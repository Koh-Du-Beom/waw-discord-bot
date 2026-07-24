export type AuthEnvironment =
  | "production"
  | "fixed-preview"
  | "arbitrary-preview"
  | "development";

export type DisabledAuthConfiguration = {
  enabled: false;
  environment: "arbitrary-preview";
};

export type EnabledAuthConfiguration = {
  enabled: true;
  environment: Exclude<AuthEnvironment, "arbitrary-preview">;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowedOrigin: string;
  allowedGuildId: string;
  operatorRoleIds: readonly string[];
  administratorRoleIds: readonly string[];
  providerTimeoutMilliseconds: number;
};

export type AuthConfiguration =
  | DisabledAuthConfiguration
  | EnabledAuthConfiguration;

export type AuthConfigurationInput = {
  environment?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  allowedOrigin?: string;
  allowedGuildId?: string;
  operatorRoleIds?: string;
  administratorRoleIds?: string;
  providerTimeoutMilliseconds?: string;
};

export class AuthConfigurationError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super("authentication configuration is invalid");
    this.name = "AuthConfigurationError";
    this.reasonCode = reasonCode;
  }

  toJSON(): { name: string; reasonCode: string } {
    return { name: this.name, reasonCode: this.reasonCode };
  }
}

const canonicalProductionOrigin = "https://waw.dubeom.com";
const callbackPath = "/auth/discord/callback";

export function parseAuthConfiguration(
  input: AuthConfigurationInput,
): AuthConfiguration {
  const environment = parseEnvironment(input.environment);
  if (environment === "arbitrary-preview") {
    return { enabled: false, environment };
  }

  const clientId = requireSnowflake(input.clientId, "client_id_invalid");
  const clientSecret = requireNonEmpty(input.clientSecret, "client_secret_missing");
  const allowedGuildId = requireSnowflake(
    input.allowedGuildId,
    "allowed_guild_id_invalid",
  );
  const allowedOrigin = parseOrigin(input.allowedOrigin, environment);
  const redirectUri = parseRedirectUri(input.redirectUri, allowedOrigin);
  const operatorRoleIds = parseRoleIds(
    input.operatorRoleIds,
    "operator_role_ids_invalid",
  );
  const administratorRoleIds = parseRoleIds(
    input.administratorRoleIds,
    "administrator_role_ids_invalid",
  );
  if (
    operatorRoleIds.some((roleId) => administratorRoleIds.includes(roleId))
  ) {
    throw new AuthConfigurationError("role_tiers_overlap");
  }

  return {
    enabled: true,
    environment,
    clientId,
    clientSecret,
    redirectUri,
    allowedOrigin,
    allowedGuildId,
    operatorRoleIds,
    administratorRoleIds,
    providerTimeoutMilliseconds: parseTimeout(
      input.providerTimeoutMilliseconds,
    ),
  };
}

function parseEnvironment(value: string | undefined): AuthEnvironment {
  if (
    value === "production" ||
    value === "fixed-preview" ||
    value === "arbitrary-preview" ||
    value === "development"
  ) {
    return value;
  }
  throw new AuthConfigurationError("environment_invalid");
}

function parseOrigin(
  value: string | undefined,
  environment: Exclude<AuthEnvironment, "arbitrary-preview">,
): string {
  const raw = requireNonEmpty(value, "allowed_origin_invalid");
  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    throw new AuthConfigurationError("allowed_origin_invalid");
  }
  if (
    origin.origin !== raw ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    (origin.protocol !== "https:" &&
      !(
        environment === "development" &&
        origin.protocol === "http:" &&
        (origin.hostname === "localhost" || origin.hostname === "127.0.0.1")
      ))
  ) {
    throw new AuthConfigurationError("allowed_origin_invalid");
  }
  if (environment === "production" && origin.origin !== canonicalProductionOrigin) {
    throw new AuthConfigurationError("production_origin_invalid");
  }
  return origin.origin;
}

function parseRedirectUri(
  value: string | undefined,
  allowedOrigin: string,
): string {
  const raw = requireNonEmpty(value, "redirect_uri_invalid");
  let redirect: URL;
  try {
    redirect = new URL(raw);
  } catch {
    throw new AuthConfigurationError("redirect_uri_invalid");
  }
  if (
    redirect.origin !== allowedOrigin ||
    redirect.pathname !== callbackPath ||
    redirect.search.length > 0 ||
    redirect.hash.length > 0 ||
    redirect.username.length > 0 ||
    redirect.password.length > 0 ||
    redirect.href !== `${allowedOrigin}${callbackPath}`
  ) {
    throw new AuthConfigurationError("redirect_uri_invalid");
  }
  return redirect.href;
}

function parseRoleIds(
  value: string | undefined,
  reasonCode: string,
): readonly string[] {
  const raw = requireNonEmpty(value, reasonCode);
  const roleIds = raw.split(",").map((roleId) => roleId.trim());
  if (
    roleIds.length === 0 ||
    roleIds.some((roleId) => !isSnowflake(roleId)) ||
    new Set(roleIds).size !== roleIds.length
  ) {
    throw new AuthConfigurationError(reasonCode);
  }
  return roleIds;
}

function parseTimeout(value: string | undefined): number {
  const timeout = Number(value);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 100 ||
    timeout > 10_000
  ) {
    throw new AuthConfigurationError("provider_timeout_invalid");
  }
  return timeout;
}

function requireSnowflake(
  value: string | undefined,
  reasonCode: string,
): string {
  const raw = requireNonEmpty(value, reasonCode);
  if (!isSnowflake(raw)) {
    throw new AuthConfigurationError(reasonCode);
  }
  return raw;
}

function isSnowflake(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value);
}

function requireNonEmpty(
  value: string | undefined,
  reasonCode: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new AuthConfigurationError(reasonCode);
  }
  return value;
}
