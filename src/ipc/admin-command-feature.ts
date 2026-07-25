import type { AdminCommandRequest, AdminCommandResponse } from "../contracts/admin-command-ipc.ts";

export type AdminCommandServer = {
  listen(): Promise<void>;
  close(): Promise<void>;
};

export function adminCommandFeatureEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error("invalid admin command IPC feature flag");
}

export async function startAdminCommandServerFeature(input: {
  enabled: boolean;
  duplicateBot: boolean;
  createServer: (execute: (request: AdminCommandRequest) => Promise<AdminCommandResponse>) => AdminCommandServer;
  execute: (request: AdminCommandRequest) => Promise<AdminCommandResponse>;
}): Promise<AdminCommandServer | undefined> {
  if (!input.enabled || input.duplicateBot) return undefined;
  const server = input.createServer(input.execute);
  await server.listen();
  return server;
}

export async function shutdownBotFeatures(input: {
  adminCommand?: AdminCommandServer;
  memberRole: { close(): Promise<void> };
  shutdownBot(): Promise<void>;
  closeDatabase(): Promise<void>;
}): Promise<void> {
  await input.adminCommand?.close();
  await input.memberRole.close();
  await input.shutdownBot();
  await input.closeDatabase();
}
