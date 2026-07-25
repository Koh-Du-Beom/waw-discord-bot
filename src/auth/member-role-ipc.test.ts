import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createMemberRoleIpcClient,
  createMemberRoleIpcServer,
  parseMemberRoleRequest,
  parseMemberRoleResponse,
} from "./member-role-ipc.ts";

const actorId = "123456789012345678";
const guildId = "234567890123456789";

test("member-role IPC returns only the allowlisted authorization result", async (context) => {
  const socketPath = testSocketPath();
  const server = createMemberRoleIpcServer({
    socketPath,
    readAuthorization: async (input) => {
      assert.deepEqual(input, { actorId, guildId });
      return { kind: "authorized", authorizationTier: "administrator" };
    },
  });
  await server.listen();
  context.after(async () => server.close());
  if (process.platform !== "win32") {
    assert.equal((await lstat(socketPath)).mode & 0o777, 0o660);
  }

  const client = createMemberRoleIpcClient({
    socketPath,
    timeoutMilliseconds: 1_000,
    generateRequestId: () => "request_123456789",
  });
  assert.deepEqual(await client.readCurrentAuthorization({ actorId, guildId }), {
    kind: "authorized",
    authorizationTier: "administrator",
  });
});

test(
  "member-role IPC refuses to replace a regular file or symlink",
  { skip: process.platform === "win32" },
  async () => {
    const regularPath = testSocketPath();
    const targetPath = testSocketPath();
    const linkPath = testSocketPath();
    try {
      await writeFile(regularPath, "do-not-delete", { mode: 0o600 });
      const regularServer = createMemberRoleIpcServer({
        socketPath: regularPath,
        readAuthorization: async () => ({ kind: "unauthorized" }),
      });
      await assert.rejects(regularServer.listen(), /not an owned socket/);
      assert.equal((await lstat(regularPath)).isFile(), true);

      await writeFile(targetPath, "do-not-delete", { mode: 0o600 });
      await symlink(targetPath, linkPath);
      const linkServer = createMemberRoleIpcServer({
        socketPath: linkPath,
        readAuthorization: async () => ({ kind: "unauthorized" }),
      });
      await assert.rejects(linkServer.listen(), /not an owned socket/);
      assert.equal((await lstat(linkPath)).isSymbolicLink(), true);
    } finally {
      await Promise.all(
        [regularPath, targetPath, linkPath].map((path) =>
          rm(path, { force: true }),
        ),
      );
    }
  },
);

test("member-role IPC rejects unknown fields, malformed snowflakes and oversized frames", () => {
  assert.equal(
    parseMemberRoleRequest(
      JSON.stringify({
        version: 1,
        requestId: "request_123456789",
        actorId,
        guildId,
        token: "must-not-cross",
      }),
    ),
    undefined,
  );
  assert.equal(
    parseMemberRoleRequest(
      JSON.stringify({
        version: 1,
        requestId: "request_123456789",
        actorId: "not-a-snowflake",
        guildId,
      }),
    ),
    undefined,
  );
  assert.equal(parseMemberRoleRequest("x".repeat(4097)), undefined);
});

test("member-role IPC rejects response request mismatch and non-allowlisted data", () => {
  assert.equal(
    parseMemberRoleResponse(
      JSON.stringify({
        version: 1,
        requestId: "different_123456789",
        kind: "authorized",
        authorizationTier: "operator",
      }),
      "request_123456789",
    ),
    undefined,
  );
  assert.equal(
    parseMemberRoleResponse(
      JSON.stringify({
        version: 1,
        requestId: "request_123456789",
        kind: "authorized",
        authorizationTier: "operator",
        roleIds: ["345678901234567890"],
      }),
      "request_123456789",
    ),
    undefined,
  );
});

test("member-role IPC fails closed on unavailable socket and invalid input", async () => {
  const client = createMemberRoleIpcClient({
    socketPath: testSocketPath(),
    timeoutMilliseconds: 50,
    generateRequestId: () => "request_123456789",
  });
  assert.deepEqual(await client.readCurrentAuthorization({ actorId, guildId }), {
    kind: "unavailable",
  });
  assert.deepEqual(
    await client.readCurrentAuthorization({
      actorId: "invalid",
      guildId,
    }),
    { kind: "unavailable" },
  );
});

function testSocketPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\waw-member-role-${randomUUID()}`;
  }
  return join(tmpdir(), `waw-member-role-${randomUUID()}.sock`);
}
