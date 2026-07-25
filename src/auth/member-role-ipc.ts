import { randomUUID } from "node:crypto";
import { chmod, lstat, unlink } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";

import type { AuthorizationTier } from "../contracts/local-command.ts";

const protocolVersion = 1;
const maximumFrameBytes = 4 * 1024;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;
const requestIdPattern = /^[A-Za-z0-9_-]{16,128}$/;

export type CurrentAuthorizationResult =
  | { kind: "authorized"; authorizationTier: AuthorizationTier }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

export type CurrentAuthorizationReader = {
  readCurrentAuthorization(input: {
    actorId: string;
    guildId: string;
  }): Promise<CurrentAuthorizationResult>;
};

type MemberRoleRequest = {
  version: 1;
  requestId: string;
  actorId: string;
  guildId: string;
};

type MemberRoleResponse =
  | {
      version: 1;
      requestId: string;
      kind: "authorized";
      authorizationTier: AuthorizationTier;
    }
  | {
      version: 1;
      requestId: string;
      kind: "unauthorized" | "unavailable";
    };

export function parseMemberRoleRequest(
  frame: string,
): MemberRoleRequest | undefined {
  if (Buffer.byteLength(frame, "utf8") > maximumFrameBytes) return undefined;
  const value = parseObject(frame);
  if (
    value === undefined ||
    !hasExactKeys(value, ["actorId", "guildId", "requestId", "version"]) ||
    value.version !== protocolVersion ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.actorId !== "string" ||
    !snowflakePattern.test(value.actorId) ||
    typeof value.guildId !== "string" ||
    !snowflakePattern.test(value.guildId)
  ) {
    return undefined;
  }
  return {
    version: protocolVersion,
    requestId: value.requestId,
    actorId: value.actorId,
    guildId: value.guildId,
  };
}

export function parseMemberRoleResponse(
  frame: string,
  expectedRequestId: string,
): CurrentAuthorizationResult | undefined {
  if (Buffer.byteLength(frame, "utf8") > maximumFrameBytes) return undefined;
  const value = parseObject(frame);
  if (
    value === undefined ||
    value.version !== protocolVersion ||
    value.requestId !== expectedRequestId
  ) {
    return undefined;
  }
  if (
    value.kind === "authorized" &&
    hasExactKeys(value, [
      "authorizationTier",
      "kind",
      "requestId",
      "version",
    ]) &&
    (value.authorizationTier === "operator" ||
      value.authorizationTier === "administrator")
  ) {
    return {
      kind: "authorized",
      authorizationTier: value.authorizationTier,
    };
  }
  if (
    (value.kind === "unauthorized" || value.kind === "unavailable") &&
    hasExactKeys(value, ["kind", "requestId", "version"])
  ) {
    return { kind: value.kind };
  }
  return undefined;
}

export function createMemberRoleIpcClient(options: {
  socketPath: string;
  timeoutMilliseconds?: number;
  generateRequestId?: () => string;
}): CurrentAuthorizationReader {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 3_000;
  const generateRequestId = options.generateRequestId ?? randomUUID;
  return {
    async readCurrentAuthorization(input) {
      if (
        !snowflakePattern.test(input.actorId) ||
        !snowflakePattern.test(input.guildId)
      ) {
        return { kind: "unavailable" };
      }
      const requestId = generateRequestId();
      if (!requestIdPattern.test(requestId)) return { kind: "unavailable" };
      const request: MemberRoleRequest = {
        version: protocolVersion,
        requestId,
        actorId: input.actorId,
        guildId: input.guildId,
      };
      return requestAuthorization(
        options.socketPath,
        `${JSON.stringify(request)}\n`,
        requestId,
        timeoutMilliseconds,
      );
    },
  };
}

export function createMemberRoleIpcServer(options: {
  socketPath: string;
  readAuthorization: CurrentAuthorizationReader["readCurrentAuthorization"];
  socketMode?: number;
}): {
  listen(): Promise<void>;
  close(): Promise<void>;
} {
  const server = createServer((socket) => {
    handleConnection(socket, options.readAuthorization);
  });
  return {
    async listen() {
      await prepareSocketPath(options.socketPath);
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
        server.listen(options.socketPath);
      });
      if (process.platform !== "win32") {
        await chmod(options.socketPath, options.socketMode ?? 0o660);
      }
    },
    async close() {
      await closeServer(server);
    },
  };
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  if (process.platform === "win32") return;
  let status;
  try {
    status = await lstat(socketPath);
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return;
    throw error;
  }
  if (
    !status.isSocket() ||
    status.isSymbolicLink() ||
    (typeof process.getuid === "function" && status.uid !== process.getuid())
  ) {
    throw new Error("member-role IPC path is not an owned socket");
  }
  await unlink(socketPath);
}

async function requestAuthorization(
  socketPath: string,
  requestFrame: string,
  requestId: string,
  timeoutMilliseconds: number,
): Promise<CurrentAuthorizationResult> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffer = "";
    const finish = (result: CurrentAuthorizationResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMilliseconds, () => finish({ kind: "unavailable" }));
    socket.once("error", () => finish({ kind: "unavailable" }));
    socket.once("connect", () => socket.write(requestFrame));
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (Buffer.byteLength(buffer, "utf8") > maximumFrameBytes + 1) {
        finish({ kind: "unavailable" });
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      if (buffer.slice(newline + 1).length !== 0) {
        finish({ kind: "unavailable" });
        return;
      }
      finish(
        parseMemberRoleResponse(buffer.slice(0, newline), requestId) ?? {
          kind: "unavailable",
        },
      );
    });
    socket.once("end", () => finish({ kind: "unavailable" }));
  });
}

function handleConnection(
  socket: Socket,
  readAuthorization: CurrentAuthorizationReader["readCurrentAuthorization"],
): void {
  let buffer = "";
  let handled = false;
  socket.on("data", (chunk: Buffer) => {
    if (handled) {
      socket.destroy();
      return;
    }
    buffer += chunk.toString("utf8");
    if (Buffer.byteLength(buffer, "utf8") > maximumFrameBytes + 1) {
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    if (buffer.slice(newline + 1).length !== 0) {
      socket.destroy();
      return;
    }
    handled = true;
    const request = parseMemberRoleRequest(buffer.slice(0, newline));
    if (request === undefined) {
      socket.destroy();
      return;
    }
    void Promise.resolve(
      readAuthorization({
        actorId: request.actorId,
        guildId: request.guildId,
      }),
    )
      .catch((): CurrentAuthorizationResult => ({ kind: "unavailable" }))
      .then((result) => {
        const response: MemberRoleResponse =
          result.kind === "authorized"
            ? {
                version: protocolVersion,
                requestId: request.requestId,
                kind: "authorized",
                authorizationTier: result.authorizationTier,
              }
            : {
                version: protocolVersion,
                requestId: request.requestId,
                kind: result.kind,
              };
        socket.end(`${JSON.stringify(response)}\n`);
      });
  });
  socket.once("error", () => undefined);
}

function parseObject(frame: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(frame);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
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
