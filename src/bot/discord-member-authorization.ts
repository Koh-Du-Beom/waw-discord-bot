import type { AuthorizationTier } from "../contracts/local-command.ts";

export type BotAuthorizationConfiguration = {
  allowedGuildId: string;
  operatorRoleIds: readonly string[];
  administratorRoleIds: readonly string[];
};

const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export function parseBotAuthorizationConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): BotAuthorizationConfiguration {
  const allowedGuildId = requireSnowflake(environment.WAW_DISCORD_GUILD_ID);
  const operatorRoleIds = parseRoleIds(
    environment.WAW_DISCORD_OPERATOR_ROLE_IDS,
  );
  const administratorRoleIds = parseRoleIds(
    environment.WAW_DISCORD_ADMINISTRATOR_ROLE_IDS,
  );
  if (
    operatorRoleIds.some((roleId) => administratorRoleIds.includes(roleId))
  ) {
    throw new Error("bot authorization role tiers overlap");
  }
  return { allowedGuildId, operatorRoleIds, administratorRoleIds };
}

export function resolveMemberAuthorization(input: {
  actorId: string;
  guildOwnerId: string;
  roleIds: readonly string[];
  configuration: BotAuthorizationConfiguration;
}): AuthorizationTier | undefined {
  if (
    input.actorId === input.guildOwnerId ||
    input.roleIds.some((roleId) =>
      input.configuration.administratorRoleIds.includes(roleId),
    )
  ) {
    return "administrator";
  }
  return input.roleIds.some((roleId) =>
    input.configuration.operatorRoleIds.includes(roleId),
  )
    ? "operator"
    : undefined;
}

function parseRoleIds(value: string | undefined): readonly string[] {
  if (value === undefined) throw new Error("bot authorization role missing");
  const values = value.split(",").map((roleId) => roleId.trim());
  if (
    values.length === 0 ||
    values.some((roleId) => !snowflakePattern.test(roleId)) ||
    new Set(values).size !== values.length
  ) {
    throw new Error("bot authorization role invalid");
  }
  return values;
}

function requireSnowflake(value: string | undefined): string {
  if (value === undefined || !snowflakePattern.test(value)) {
    throw new Error("bot authorization guild invalid");
  }
  return value;
}
