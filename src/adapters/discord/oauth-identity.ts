import type { EnabledAuthConfiguration } from "../../auth/oauth-configuration.ts";
import type {
  OAuthIdentityProvider,
  OAuthTokenSet,
} from "../../auth/oauth-callback.ts";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type DiscordOAuthProviderReason =
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "server-error"
  | "provider-error"
  | "invalid-response";

export class DiscordOAuthProviderError extends Error {
  readonly reason: DiscordOAuthProviderReason;

  constructor(reason: DiscordOAuthProviderReason) {
    super("Discord OAuth provider request failed");
    this.name = "DiscordOAuthProviderError";
    this.reason = reason;
  }

  toJSON(): { name: string; reason: DiscordOAuthProviderReason } {
    return { name: this.name, reason: this.reason };
  }
}

export type DiscordOAuthIdentityProvider = OAuthIdentityProvider & {
  createAuthorizationUrl(state: string): string;
};

const authorizationEndpoint = "https://discord.com/oauth2/authorize";
const tokenEndpoint = "https://discord.com/api/v10/oauth2/token";
const identityEndpoint = "https://discord.com/api/v10/users/@me";

export function createDiscordOAuthIdentityProvider(
  configuration: EnabledAuthConfiguration,
  fetchImplementation: FetchLike = fetch,
): DiscordOAuthIdentityProvider {
  return {
    createAuthorizationUrl(state): string {
      if (state.length === 0) {
        throw new DiscordOAuthProviderError("provider-error");
      }
      const url = new URL(authorizationEndpoint);
      url.searchParams.set("client_id", configuration.clientId);
      url.searchParams.set("redirect_uri", configuration.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "identify");
      url.searchParams.set("state", state);
      return url.href;
    },

    async exchangeCode(code): Promise<OAuthTokenSet> {
      const body = new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: configuration.redirectUri,
      });
      const providerBody = await requestJson(
        fetchImplementation,
        tokenEndpoint,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(
            configuration.providerTimeoutMilliseconds,
          ),
        },
      );
      if (
        !isRecord(providerBody) ||
        typeof providerBody.access_token !== "string" ||
        providerBody.access_token.length === 0 ||
        providerBody.token_type !== "Bearer" ||
        providerBody.scope !== "identify" ||
        (providerBody.refresh_token !== undefined &&
          (typeof providerBody.refresh_token !== "string" ||
            providerBody.refresh_token.length === 0))
      ) {
        throw new DiscordOAuthProviderError("invalid-response");
      }
      return {
        accessToken: providerBody.access_token,
        ...(providerBody.refresh_token === undefined
          ? {}
          : { refreshToken: providerBody.refresh_token }),
      };
    },

    async fetchIdentity(accessToken): Promise<{ id: string }> {
      const providerBody = await requestJson(
        fetchImplementation,
        identityEndpoint,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(
            configuration.providerTimeoutMilliseconds,
          ),
        },
      );
      if (
        !isRecord(providerBody) ||
        typeof providerBody.id !== "string" ||
        !/^[0-9]{1,20}$/.test(providerBody.id)
      ) {
        throw new DiscordOAuthProviderError("invalid-response");
      }
      return { id: providerBody.id };
    },
  };
}

async function requestJson(
  fetchImplementation: FetchLike,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw new DiscordOAuthProviderError("timeout");
    }
    throw new DiscordOAuthProviderError("provider-error");
  }

  if (!response.ok) {
    throw new DiscordOAuthProviderError(reasonForStatus(response.status));
  }
  try {
    return await response.json();
  } catch {
    throw new DiscordOAuthProviderError("invalid-response");
  }
}

function reasonForStatus(status: number): DiscordOAuthProviderReason {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 429) {
    return "rate-limited";
  }
  if (status >= 500 && status <= 599) {
    return "server-error";
  }
  return "provider-error";
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
