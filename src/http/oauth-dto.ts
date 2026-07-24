import type { AuthConfiguration } from "../auth/oauth-configuration.ts";
import type {
  DiscordOAuthIdentityProvider,
} from "../adapters/discord/oauth-identity.ts";
import type { OAuthCallbackOutcome } from "../auth/oauth-callback.ts";
import { readSessionCredential } from "./session-boundary.ts";

export type FrameworkNeutralRequest = {
  method: string;
  url: string;
  headers?: Readonly<Record<string, string | undefined>>;
};

export type FrameworkNeutralResponse = {
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, string>>;
};

export type OAuthCallbackCommandHandler = (command: {
  code: string;
  rawState: string;
  previousRawSessionId?: string;
}) => Promise<OAuthCallbackOutcome>;

export function createOAuthLoginResponse(
  configuration: AuthConfiguration,
  provider: DiscordOAuthIdentityProvider | undefined,
  rawState: string,
): FrameworkNeutralResponse {
  if (!configuration.enabled || provider === undefined) {
    return {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    };
  }
  return {
    statusCode: 302,
    headers: { location: provider.createAuthorizationUrl(rawState) },
    body: { kind: "redirect" },
  };
}

export async function handleOAuthCallbackRequest(
  request: FrameworkNeutralRequest,
  configuration: AuthConfiguration,
  commandHandler: OAuthCallbackCommandHandler,
): Promise<FrameworkNeutralResponse> {
  if (!configuration.enabled) {
    return {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    };
  }
  const command = parseCallbackCommand(request, configuration);
  if (command === undefined) {
    return callbackInvalidResponse();
  }

  let outcome: OAuthCallbackOutcome;
  try {
    outcome = await commandHandler(command);
  } catch {
    return {
      statusCode: 503,
      headers: {},
      body: { kind: "denied", reason: "callback-unavailable" },
    };
  }
  if (outcome.kind === "succeeded") {
    return {
      statusCode: 303,
      headers: { location: "/" },
      body: { kind: "succeeded" },
    };
  }
  return {
    statusCode:
      outcome.reason === "provider-unavailable" ? 503 : 403,
    headers: {},
    body: { kind: "denied", reason: outcome.reason },
  };
}

function parseCallbackCommand(
  request: FrameworkNeutralRequest,
  configuration: Extract<AuthConfiguration, { enabled: true }>,
):
  | { code: string; rawState: string; previousRawSessionId?: string }
  | undefined {
  if (request.method !== "GET") {
    return undefined;
  }
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(request.url);
  } catch {
    return undefined;
  }
  const expected = new URL(configuration.redirectUri);
  if (
    requestedUrl.origin !== expected.origin ||
    requestedUrl.pathname !== expected.pathname ||
    requestedUrl.hash.length > 0 ||
    requestedUrl.username.length > 0 ||
    requestedUrl.password.length > 0
  ) {
    return undefined;
  }
  const keys = [...requestedUrl.searchParams.keys()];
  if (
    keys.length !== 2 ||
    keys.filter((key) => key === "code").length !== 1 ||
    keys.filter((key) => key === "state").length !== 1
  ) {
    return undefined;
  }
  const code = requestedUrl.searchParams.get("code");
  const rawState = requestedUrl.searchParams.get("state");
  if (
    code === null ||
    code.length === 0 ||
    code.length > 2048 ||
    rawState === null ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(rawState)
  ) {
    return undefined;
  }
  const previous = readSessionCredential(request.headers?.cookie);
  if (previous.kind === "invalid") {
    return undefined;
  }
  return {
    code,
    rawState,
    ...(previous.kind === "present"
      ? { previousRawSessionId: previous.rawSessionId }
      : {}),
  };
}

function callbackInvalidResponse(): FrameworkNeutralResponse {
  return {
    statusCode: 400,
    headers: {},
    body: { kind: "denied", reason: "callback-invalid" },
  };
}
