import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { createConnection } from "node:net";
import { test } from "node:test";

import type {
  AdminCommandRequest,
  AdminCommandResponse,
} from "../contracts/admin-command-ipc.ts";
import {
  createAdminCommandIpcClient,
  createAdminCommandIpcServer,
  inheritSocketDirectoryGroup,
  prepareAdminCommandSocketPath,
} from "./admin-command-ipc.ts";

function socketPath(): string {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\waw-admin-command-${randomUUID()}`
    : `/tmp/waw-admin-command-${randomUUID()}.sock`;
}

function request(
  command: AdminCommandRequest["command"] = "riot_link_request_list",
): AdminCommandRequest {
  const payload =
    command === "riot_link_request_list"
      ? { limit: 10 }
      : command === "riot_link_request_reject"
        ? { requestId: "riot-request-0001", expectedVersion: 0 }
        : command === "riot_link_request_approve"
          ? {
              requestId: "riot-request-0001",
              expectedVersion: 0,
              linkId: "riot-link-000001",
              puuid: "A".repeat(64),
            }
          : { operationId: "target-operation-01" };
  return {
    version: 1,
    requestId: "transport_request_0001",
    operationId: "transport-operation-01",
    actorId: "123456789012345678",
    guildId: "223456789012345678",
    command,
    requestedAt: new Date("2026-07-26T06:00:00.000Z"),
    expiresAt: new Date("2026-07-26T06:00:10.000Z"),
    payload,
  } as AdminCommandRequest;
}

function success(input: AdminCommandRequest): AdminCommandResponse {
  return {
    version: 1,
    requestId: input.requestId,
    operationId: input.operationId,
    outcome: "success",
    reasonCode: "completed",
    result: {
      kind: "riot_link_request_page",
      requests: [],
    },
  };
}

test("exchanges exactly one request and response with request-id binding", async () => {
  const path = socketPath();
  let executions = 0;
  const server = createAdminCommandIpcServer({
    socketPath: path,
    async execute(input) {
      executions += 1;
      return success(input);
    },
  });
  await server.listen();
  try {
    const response = await createAdminCommandIpcClient({
      socketPath: path,
    }).execute(request());
    assert.equal(response.outcome, "success");
    assert.equal(response.requestId, "transport_request_0001");
    assert.equal(executions, 1);
  } finally {
    await server.close();
  }
});

test("rejects malformed, multi-frame and oversized input before dispatch", async () => {
  const path = socketPath();
  let executions = 0;
  const server = createAdminCommandIpcServer({
    socketPath: path,
    async execute(input) {
      executions += 1;
      return success(input);
    },
  });
  await server.listen();
  try {
    await rawSend(path, Buffer.from("{bad}\n"));
    await rawSend(path, Buffer.from("{}\n{}\n"));
    await rawSend(path, Buffer.alloc(32 * 1024 + 2, 0x61));
    assert.equal(executions, 0);
  } finally {
    await server.close();
  }
});

test("maps mutation deadline to outcome_unknown and other transport failures to unavailable", async () => {
  const path = socketPath();
  const server = createAdminCommandIpcServer({
    socketPath: path,
    requestDeadlineMilliseconds: 100,
    async execute(input) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return success(input);
    },
  });
  await server.listen();
  try {
    const client = createAdminCommandIpcClient({
      socketPath: path,
      deadlineMilliseconds: 20,
    });
    const mutation = await client.execute(request("riot_link_request_reject"));
    assert.equal(mutation.outcome, "outcome_unknown");
    const read = await client.execute(request("riot_link_request_list"));
    assert.equal(read.outcome, "unavailable");
  } finally {
    await server.close();
  }
});

test("binds response request id and rejects EOF or late malformed replies", async () => {
  for (const reply of [
    "",
    '{"version":1,"requestId":"wrong_request_0001"}\n',
    "{}\n{}\n",
  ]) {
    const path = socketPath();
    const server = createAdminCommandIpcServer({
      socketPath: path,
      async execute(input) {
        return success(input);
      },
    });
    // Exercise hostile replies with a minimal raw server rather than the
    // serializer-protected production server.
    await server.listen();
    await server.close();
    const raw = await import("node:net").then(({ createServer }) =>
      createServer({ allowHalfOpen: true }, (socket) => {
        socket.once("error", () => undefined);
        socket.once("data", () => socket.end(reply));
      }),
    );
    await new Promise<void>((resolve) => raw.listen(path, resolve));
    try {
      const response = await createAdminCommandIpcClient({
        socketPath: path,
        deadlineMilliseconds: 100,
      }).execute(request());
      assert.equal(response.outcome, "unavailable");
    } finally {
      await new Promise<void>((resolve) => raw.close(() => resolve()));
    }
  }
});

test("limits active connections to eight and never dispatches the excess connection", async () => {
  const path = socketPath();
  let executions = 0;
  const server = createAdminCommandIpcServer({
    socketPath: path,
    requestDeadlineMilliseconds: 500,
    async execute(input) {
      executions += 1;
      return success(input);
    },
  });
  await server.listen();
  const held = Array.from({ length: 8 }, () => createConnection(path));
  await Promise.all(held.map((socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    })
  ));
  try {
    const response = await createAdminCommandIpcClient({
      socketPath: path,
      deadlineMilliseconds: 100,
    }).execute(request());
    assert.equal(response.outcome, "unavailable");
    assert.equal(executions, 0);
  } finally {
    for (const socket of held) socket.destroy();
    await server.close();
  }
});

test("removes only an owned stale socket and refuses symlink, regular file or other owner", async () => {
  let removed = 0;
  const status = (input: {
    socket: boolean;
    symbolic?: boolean;
    uid?: number;
  }) =>
    ({
      uid: input.uid ?? 1000,
      isSocket: () => input.socket,
      isSymbolicLink: () => input.symbolic ?? false,
    }) as Stats;
  await prepareAdminCommandSocketPath("/run/test.sock", {
    platform: "linux",
    currentUid: 1000,
    inspect: async () => status({ socket: true }),
    remove: async () => {
      removed += 1;
    },
  });
  assert.equal(removed, 1);
  for (const unsafe of [
    status({ socket: false }),
    status({ socket: true, symbolic: true }),
    status({ socket: true, uid: 2000 }),
  ]) {
    await assert.rejects(
      prepareAdminCommandSocketPath("/run/test.sock", {
        platform: "linux",
        currentUid: 1000,
        inspect: async () => unsafe,
        remove: async () => undefined,
      }),
      /not an owned socket/,
    );
  }
});

test("assigns the socket to its real parent directory group", async () => {
  let assignment: { path: string; uid: number; gid: number } | undefined;
  await inheritSocketDirectoryGroup("/run/waw-admin-command/admin-command.sock", {
    platform: "linux",
    inspect: async () =>
      ({
        gid: 4100,
        isDirectory: () => true,
        isSymbolicLink: () => false,
      }) as Stats,
    assign: async (path, uid, gid) => {
      assignment = { path: path.toString(), uid, gid };
    },
  });
  assert.deepEqual(assignment, {
    path: "/run/waw-admin-command/admin-command.sock",
    uid: -1,
    gid: 4100,
  });

  await assert.rejects(
    inheritSocketDirectoryGroup("/run/waw-admin-command/admin-command.sock", {
      platform: "linux",
      inspect: async () =>
        ({
          gid: 4100,
          isDirectory: () => true,
          isSymbolicLink: () => true,
        }) as Stats,
      assign: async () => undefined,
    }),
    /not a real directory/,
  );
});

async function rawSend(path: string, frame: Buffer): Promise<void> {
  await new Promise<void>((resolve) => {
    const socket = createConnection(path);
    socket.once("connect", () => socket.end(frame));
    socket.once("error", () => resolve());
    socket.once("close", () => resolve());
    socket.resume();
  });
}
