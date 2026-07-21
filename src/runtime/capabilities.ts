import type { AuthorizationTier } from "../contracts/local-command.ts";

export type LocalCommandService = {
  submit(input: { actorId: string; authorizationTier: AuthorizationTier; operationId: string }): void;
};

export type MemberRoleReader = {
  readCurrentRole(actorId: string): AuthorizationTier | undefined;
};

export type WebRuntime = {
  submitCommand(input: { actorId: string; authorizationTier: AuthorizationTier; operationId: string }): void;
};

export type BotRuntime = {
  readCurrentRole(actorId: string): AuthorizationTier | undefined;
  isConfigured(): boolean;
};

export function createWebRuntime(commandService: LocalCommandService): WebRuntime {
  return {
    submitCommand(input): void {
      commandService.submit(input);
    },
  };
}

export function createBotRuntime(
  botToken: string,
  memberRoleReader: MemberRoleReader,
): BotRuntime {
  if (botToken.length === 0) {
    throw new Error("bot token must be injected by the bot runtime");
  }

  return {
    readCurrentRole(actorId): AuthorizationTier | undefined {
      return memberRoleReader.readCurrentRole(actorId);
    },
    isConfigured(): boolean {
      return true;
    },
  };
}
