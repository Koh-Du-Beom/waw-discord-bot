import { chmod, chown, lstat, unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { dirname } from "node:path";

import {
  ADMIN_COMMAND_MAXIMUM_FRAME_BYTES,
  parseAdminCommandRequest,
  parseAdminCommandResponse,
  serializeAdminCommandRequest,
  serializeAdminCommandResponse,
  type AdminCommandRequest,
  type AdminCommandResponse,
} from "../contracts/admin-command-ipc.ts";

const DEFAULT_DEADLINE_MILLISECONDS = 3_000;
const DEFAULT_MAXIMUM_CONNECTIONS = 8;

export type AdminCommandTransport = {
  execute(request: AdminCommandRequest): Promise<AdminCommandResponse>;
};

export type AdminCommandIpcServerDiagnostic =
  | { stage: "request_accepted"; command: AdminCommandRequest["command"] }
  | {
      stage: "response_ready";
      command: AdminCommandRequest["command"];
      outcome: AdminCommandResponse["outcome"];
      reasonCode: AdminCommandResponse["reasonCode"];
    }
  | { stage: "execute_failed"; command: AdminCommandRequest["command"] }
  | { stage: "request_rejected"; reasonCode: "frame_invalid" | "frame_too_large" };

export function createAdminCommandIpcClient(options: {
  socketPath: string;
  deadlineMilliseconds?: number;
}): AdminCommandTransport {
  const deadlineMilliseconds =
    options.deadlineMilliseconds ?? DEFAULT_DEADLINE_MILLISECONDS;
  if (!Number.isInteger(deadlineMilliseconds) || deadlineMilliseconds < 1) {
    throw new Error("invalid admin command IPC deadline");
  }
  return {
    execute(request) {
      let frame: string;
      try {
        frame = `${serializeAdminCommandRequest(request)}\n`;
      } catch {
        return Promise.resolve(transportFailure(request, "unavailable"));
      }
      return exchange(
        options.socketPath,
        frame,
        request,
        deadlineMilliseconds,
      );
    },
  };
}

export function createAdminCommandIpcServer(options: {
  socketPath: string;
  execute(request: AdminCommandRequest): Promise<AdminCommandResponse>;
  socketMode?: number;
  inheritSocketDirectoryGroup?: boolean;
  maximumConnections?: number;
  requestDeadlineMilliseconds?: number;
  reportDiagnostic?: (diagnostic: AdminCommandIpcServerDiagnostic) => void;
}): {
  listen(): Promise<void>;
  close(): Promise<void>;
} {
  const maximumConnections =
    options.maximumConnections ?? DEFAULT_MAXIMUM_CONNECTIONS;
  const requestDeadlineMilliseconds =
    options.requestDeadlineMilliseconds ?? DEFAULT_DEADLINE_MILLISECONDS;
  if (
    !Number.isInteger(maximumConnections) ||
    maximumConnections < 1 ||
    maximumConnections > DEFAULT_MAXIMUM_CONNECTIONS ||
    !Number.isInteger(requestDeadlineMilliseconds) ||
    requestDeadlineMilliseconds < 1
  ) {
    throw new Error("invalid admin command IPC server bounds");
  }
  let activeConnections = 0;
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    if (activeConnections >= maximumConnections) {
      socket.destroy();
      return;
    }
    activeConnections += 1;
    sockets.add(socket);
    socket.once("close", () => {
      activeConnections -= 1;
      sockets.delete(socket);
    });
    handleConnection(
      socket,
      options.execute,
      requestDeadlineMilliseconds,
      options.reportDiagnostic,
    );
  });
  return {
    async listen() {
      await prepareAdminCommandSocketPath(options.socketPath);
      await listen(server, options.socketPath);
      if (process.platform !== "win32") {
        if (options.inheritSocketDirectoryGroup) {
          await inheritSocketDirectoryGroup(options.socketPath);
        }
        await chmod(options.socketPath, options.socketMode ?? 0o660);
      }
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
    },
  };
}

export async function inheritSocketDirectoryGroup(
  socketPath: string,
  dependencies: {
    platform?: NodeJS.Platform;
    inspect?: (path: string) => Promise<{
      gid: number;
      isDirectory(): boolean;
      isSymbolicLink(): boolean;
    }>;
    assign?: (path: string, uid: number, gid: number) => Promise<void>;
  } = {},
): Promise<void> {
  if ((dependencies.platform ?? process.platform) === "win32") return;
  const inspect = dependencies.inspect ?? ((path) => lstat(path));
  const assign =
    dependencies.assign ?? ((path, uid, gid) => chown(path, uid, gid));
  const directory = await inspect(dirname(socketPath));
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("admin command IPC directory is not a real directory");
  }
  await assign(socketPath, -1, directory.gid);
}

export async function prepareAdminCommandSocketPath(
  socketPath: string,
  dependencies: {
    platform?: NodeJS.Platform;
    currentUid?: number;
    inspect?: (path: string) => Promise<{
      uid: number;
      isSocket(): boolean;
      isSymbolicLink(): boolean;
    }>;
    remove?: typeof unlink;
  } = {},
): Promise<void> {
  const platform = dependencies.platform ?? process.platform;
  if (platform === "win32") return;
  const inspect = dependencies.inspect ?? lstat;
  const remove = dependencies.remove ?? unlink;
  let status: {
    uid: number;
    isSocket(): boolean;
    isSymbolicLink(): boolean;
  };
  try {
    status = await inspect(socketPath);
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return;
    throw error;
  }
  const currentUid =
    dependencies.currentUid ??
    (typeof process.getuid === "function" ? process.getuid() : undefined);
  if (
    status.isSymbolicLink() ||
    !status.isSocket() ||
    currentUid === undefined ||
    status.uid !== currentUid
  ) {
    throw new Error("admin command IPC path is not an owned socket");
  }
  await remove(socketPath);
}

async function exchange(
  socketPath: string,
  requestFrame: string,
  request: AdminCommandRequest,
  deadlineMilliseconds: number,
): Promise<AdminCommandResponse> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let buffer = Buffer.alloc(0);
    let settled = false;
    const finish = (response: AdminCommandResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(response);
    };
    const deadline = setTimeout(() => {
      finish(
        transportFailure(
          request,
          isMutation(request) ? "outcome_unknown" : "unavailable",
        ),
      );
    }, deadlineMilliseconds);
    socket.once("error", () => {
      finish(transportFailure(request, "unavailable"));
    });
    socket.once("connect", () => socket.write(requestFrame));
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.byteLength > ADMIN_COMMAND_MAXIMUM_FRAME_BYTES + 1) {
        finish(transportFailure(request, "unavailable"));
      }
    });
    socket.once("end", () => {
      const frame = oneFrame(buffer);
      const response =
        frame === undefined
          ? undefined
          : parseAdminCommandResponse(frame, request.requestId);
      finish(response ?? transportFailure(request, "unavailable"));
    });
  });
}

function handleConnection(
  socket: Socket,
  execute: (request: AdminCommandRequest) => Promise<AdminCommandResponse>,
  deadlineMilliseconds: number,
  reportDiagnostic?: (diagnostic: AdminCommandIpcServerDiagnostic) => void,
): void {
  let buffer = Buffer.alloc(0);
  let rejected = false;
  let handled = false;
  const report = (diagnostic: AdminCommandIpcServerDiagnostic): void => {
    try {
      reportDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics must never alter command handling.
    }
  };
  const deadline = setTimeout(() => socket.destroy(), deadlineMilliseconds);
  socket.on("data", (chunk: Buffer) => {
    if (rejected) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.byteLength > ADMIN_COMMAND_MAXIMUM_FRAME_BYTES + 1) {
      rejected = true;
      report({
        stage: "request_rejected",
        reasonCode: "frame_too_large",
      });
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf(0x0a);
    if (newline < 0) return;
    if (handled || newline !== buffer.byteLength - 1 || buffer.subarray(0, newline).includes(0x0a)) {
      rejected = true;
      report({
        stage: "request_rejected",
        reasonCode: "frame_invalid",
      });
      socket.destroy();
      return;
    }
    handled = true;
    const frame = buffer.subarray(0, newline);
    const request = frame === undefined ? undefined : parseAdminCommandRequest(frame);
    if (!request) {
      report({
        stage: "request_rejected",
        reasonCode: "frame_invalid",
      });
      socket.destroy();
      return;
    }
    report({ stage: "request_accepted", command: request.command });
    void Promise.resolve(execute(request))
      .catch(() => {
        report({ stage: "execute_failed", command: request.command });
        return transportFailure(request, "unavailable");
      })
      .then((response) => {
        report({
          stage: "response_ready",
          command: request.command,
          outcome: response.outcome,
          reasonCode: response.reasonCode,
        });
        if (socket.destroyed) return;
        try {
          socket.end(`${serializeAdminCommandResponse(response)}\n`);
        } catch {
          socket.end(
            `${serializeAdminCommandResponse(
              transportFailure(request, "unavailable"),
            )}\n`,
          );
        }
      });
  });
  socket.once("end", () => {
    if (!handled) socket.destroy();
  });
  socket.once("error", () => undefined);
  socket.once("close", () => clearTimeout(deadline));
}

function oneFrame(buffer: Buffer): Uint8Array | undefined {
  if (
    buffer.byteLength < 2 ||
    buffer.byteLength > ADMIN_COMMAND_MAXIMUM_FRAME_BYTES + 1 ||
    buffer.at(-1) !== 0x0a
  ) {
    return undefined;
  }
  const frame = buffer.subarray(0, -1);
  return frame.includes(0x0a) ? undefined : frame;
}

function transportFailure(
  request: AdminCommandRequest,
  outcome: "unavailable" | "outcome_unknown",
): AdminCommandResponse {
  return {
    version: 1,
    requestId: request.requestId,
    operationId: request.operationId,
    outcome,
    reasonCode: "request_unavailable",
  };
}

function isMutation(request: AdminCommandRequest): boolean {
  return (
    request.command === "riot_link_request_approve" ||
    request.command === "riot_link_request_reject"
  );
}

async function listen(server: Server, socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
