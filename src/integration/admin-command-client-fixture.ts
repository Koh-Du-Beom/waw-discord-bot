import { createAdminCommandIpcClient } from "../ipc/admin-command-ipc.ts";
import type { AdminCommandRequest } from "../contracts/admin-command-ipc.ts";

const mode = required("WAW_ADMIN_COMMAND_MODE");
const operationId = required("WAW_ADMIN_COMMAND_OPERATION_ID");
const now = new Date();
const base = {
  version: 1 as const,
  requestId: `request-${operationId}`,
  operationId,
  actorId: "123456789012345678",
  guildId: "223456789012345678",
  requestedAt: now,
  expiresAt: new Date(now.getTime() + 15_000),
};
const request =
  mode === "list"
    ? { ...base, command: "riot_link_request_list", payload: { limit: 10 } }
    : mode === "approve"
      ? {
          ...base,
          command: "riot_link_request_approve",
          payload: {
            requestId: required("WAW_RIOT_REQUEST_ID"),
            expectedVersion: Number(process.env.WAW_EXPECTED_VERSION ?? "0"),
            linkId: required("WAW_RIOT_LINK_ID"),
            puuid: (process.env.WAW_PUUID_CHARACTER ?? "A").repeat(64),
          },
        }
      : mode === "reject"
        ? {
            ...base,
            command: "riot_link_request_reject",
            payload: {
              requestId: required("WAW_RIOT_REQUEST_ID"),
              expectedVersion: Number(process.env.WAW_EXPECTED_VERSION ?? "0"),
            },
          }
        : {
            ...base,
            command: "operation_status",
            payload: { operationId: required("WAW_TARGET_OPERATION_ID") },
          };
const response = await createAdminCommandIpcClient({
  socketPath: required("WAW_ADMIN_COMMAND_SOCKET"),
  deadlineMilliseconds: Number(process.env.WAW_ADMIN_DEADLINE_MS ?? "3000"),
}).execute(request as AdminCommandRequest);
process.stdout.write(`${JSON.stringify(response)}\n`);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}
