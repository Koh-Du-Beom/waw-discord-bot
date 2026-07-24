import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthConfigurationError,
  parseAuthConfiguration,
} from "./oauth-configuration.ts";
import {
  createDiscordOAuthIdentityProvider,
  DiscordOAuthProviderError,
  type FetchLike,
} from "../adapters/discord/oauth-identity.ts";
import {
  createOAuthLoginResponse,
  handleOAuthCallbackRequest,
} from "../http/oauth-dto.ts";

const clientSecret = "client-secret-canary-that-must-not-escape";
const code = "authorization-code-canary-that-must-not-escape";
const accessToken = "access-token-canary-that-must-not-escape";
const refreshToken = "refresh-token-canary-that-must-not-escape";
const state = "oauth-state-canary-0123456789abcdef";
const redirectUri = "https://waw.dubeom.com/auth/discord/callback";

function productionConfiguration() {
  return parseAuthConfiguration({
    environment: "production",
    clientId: "100",
    clientSecret,
    redirectUri,
    allowedOrigin: "https://waw.dubeom.com",
    allowedGuildId: "200",
    operatorRoleIds: "300",
    administratorRoleIds: "400",
    providerTimeoutMilliseconds: "2500",
  });
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("builds an exact identify-only authorization URL without the client secret", () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const provider = createDiscordOAuthIdentityProvider(configuration, async () => {
    throw new Error("fetch must not run while building an authorization URL");
  });
  const authorizationUrl = new URL(provider.createAuthorizationUrl(state));

  assert.equal(authorizationUrl.origin, "https://discord.com");
  assert.equal(authorizationUrl.pathname, "/oauth2/authorize");
  assert.deepEqual(
    ([...authorizationUrl.searchParams] as Array<[string, string]>).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
    ([
      ["client_id", "100"],
      ["redirect_uri", redirectUri],
      ["response_type", "code"],
      ["scope", "identify"],
      ["state", state],
    ] as Array<[string, string]>).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  assert.equal(authorizationUrl.href.includes(clientSecret), false);
});

test("exchanges the code with the exact redirect and fetches identity through injected fetch", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fakeFetch: FetchLike = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://discord.com/api/v10/oauth2/token") {
      return response({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        scope: "identify",
      });
    }
    return response({ id: "500" });
  };
  const provider = createDiscordOAuthIdentityProvider(configuration, fakeFetch);

  assert.deepEqual(await provider.exchangeCode(code), { accessToken, refreshToken });
  assert.deepEqual(await provider.fetchIdentity(accessToken), { id: "500" });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://discord.com/api/v10/oauth2/token");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    new Headers(calls[0]?.init?.headers).get("content-type"),
    "application/x-www-form-urlencoded",
  );
  const tokenBody = new URLSearchParams(String(calls[0]?.init?.body));
  assert.deepEqual(Object.fromEntries(tokenBody), {
    client_id: "100",
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  assert.equal(calls[0]?.init?.signal instanceof AbortSignal, true);
  assert.equal(calls[1]?.url, "https://discord.com/api/v10/users/@me");
  assert.equal(
    new Headers(calls[1]?.init?.headers).get("authorization"),
    `Bearer ${accessToken}`,
  );
});

test("normalizes timeout, 401, 403, 429, and 5xx without leaking credentials", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const fixtures = [
    { status: 401, reason: "unauthorized" },
    { status: 403, reason: "forbidden" },
    { status: 429, reason: "rate-limited" },
    { status: 500, reason: "server-error" },
  ] as const;

  for (const fixture of fixtures) {
    const provider = createDiscordOAuthIdentityProvider(
      configuration,
      async () => response({ leaked: `${clientSecret}${code}` }, fixture.status),
    );
    await assert.rejects(provider.exchangeCode(code), (error: unknown) => {
      assert.equal(error instanceof DiscordOAuthProviderError, true);
      assert.equal((error as DiscordOAuthProviderError).reason, fixture.reason);
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes(clientSecret), false);
      assert.equal(serialized.includes(code), false);
      return true;
    });
  }

  const timeoutProvider = createDiscordOAuthIdentityProvider(configuration, async () => {
    throw Object.assign(new Error(`${clientSecret}${code}`), { name: "AbortError" });
  });
  await assert.rejects(timeoutProvider.exchangeCode(code), (error: unknown) => {
    assert.equal((error as DiscordOAuthProviderError).reason, "timeout");
    assert.equal(JSON.stringify(error).includes(clientSecret), false);
    return true;
  });
});

test("rejects malformed token and identity JSON without reflecting provider data", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const malformedBodies = [
    { token: { access_token: "", token_type: "Bearer", leaked: clientSecret } },
    { token: { access_token: accessToken, token_type: "Basic" } },
    { identity: { id: "not-a-snowflake", leaked: accessToken } },
  ];

  for (const fixture of malformedBodies) {
    const provider = createDiscordOAuthIdentityProvider(configuration, async (input) => {
      return response(String(input).endsWith("/users/@me") ? fixture.identity : fixture.token);
    });
    const operation =
      fixture.identity === undefined
        ? provider.exchangeCode(code)
        : provider.fetchIdentity(accessToken);
    await assert.rejects(operation, (error: unknown) => {
      assert.equal((error as DiscordOAuthProviderError).reason, "invalid-response");
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes(clientSecret), false);
      assert.equal(serialized.includes(accessToken), false);
      return true;
    });
  }

  const invalidJsonProvider = createDiscordOAuthIdentityProvider(
    configuration,
    async () =>
      new Response(`not-json-${clientSecret}`, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  await assert.rejects(
    invalidJsonProvider.exchangeCode(code),
    (error: unknown) => (error as DiscordOAuthProviderError).reason === "invalid-response",
  );
});

test("validates exact server-side origins and disables arbitrary preview login", () => {
  assert.deepEqual(
    parseAuthConfiguration({
      environment: "arbitrary-preview",
    }),
    { enabled: false, environment: "arbitrary-preview" },
  );

  for (const invalid of [
    { redirectUri: "https://evil.example/auth/discord/callback" },
    { redirectUri: `${redirectUri}?next=https://evil.example` },
    { allowedOrigin: "http://waw.dubeom.com" },
    { operatorRoleIds: "not-a-snowflake" },
  ]) {
    assert.throws(
      () =>
        parseAuthConfiguration({
          environment: "production",
          clientId: "100",
          clientSecret,
          redirectUri,
          allowedOrigin: "https://waw.dubeom.com",
          allowedGuildId: "200",
          operatorRoleIds: "300",
          administratorRoleIds: "400",
          providerTimeoutMilliseconds: "2500",
          ...invalid,
        }),
      (error: unknown) => {
        assert.equal(error instanceof AuthConfigurationError, true);
        assert.equal(JSON.stringify(error).includes(clientSecret), false);
        return true;
      },
    );
  }
});

test("uses framework-neutral DTOs and keeps callback code/state out of public responses", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const provider = createDiscordOAuthIdentityProvider(configuration, async () => {
    throw new Error("fetch is not used by DTO construction");
  });
  const login = createOAuthLoginResponse(configuration, provider, state);
  assert.equal(login.statusCode, 302);
  assert.equal(login.headers.location, provider.createAuthorizationUrl(state));

  const commands: Array<{ code: string; rawState: string }> = [];
  const accepted = await handleOAuthCallbackRequest(
    {
      method: "GET",
      url: `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    },
    configuration,
    async (command) => {
      commands.push(command);
      return { kind: "succeeded", authorizationTier: "operator" };
    },
  );
  assert.deepEqual(commands, [{ code, rawState: state }]);
  assert.deepEqual(accepted, {
    statusCode: 303,
    headers: { location: "/" },
    body: { kind: "succeeded" },
  });
  assert.equal(JSON.stringify(accepted).includes(code), false);
  assert.equal(JSON.stringify(accepted).includes(state), false);

  for (const url of [
    `https://evil.example/auth/discord/callback?code=${code}&state=${state}`,
    `${redirectUri}/extra?code=${code}&state=${state}`,
    `${redirectUri}?code=${code}&state=${state}&next=https://evil.example`,
    `${redirectUri}?code=${code}&code=duplicate&state=${state}`,
  ]) {
    const denied = await handleOAuthCallbackRequest(
      { method: "GET", url },
      configuration,
      async () => {
        throw new Error("invalid callback must not reach the command handler");
      },
    );
    assert.deepEqual(denied, {
      statusCode: 400,
      headers: {},
      body: { kind: "denied", reason: "callback-invalid" },
    });
    assert.equal(JSON.stringify(denied).includes(code), false);
  }
});

test("passes an existing session to callback rotation and rejects duplicate session cookies", async () => {
  const configuration = productionConfiguration();
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) {
    return;
  }
  const previousRawSessionId = "previous-session-0123456789abcdef-unique";
  const commands: Array<{
    code: string;
    rawState: string;
    previousRawSessionId?: string;
  }> = [];
  const accepted = await handleOAuthCallbackRequest(
    {
      method: "GET",
      url: `${redirectUri}?code=${code}&state=${state}`,
      headers: {
        cookie: `__Host-waw_session=${previousRawSessionId}`,
      },
    },
    configuration,
    async (command) => {
      commands.push(command);
      return { kind: "succeeded", authorizationTier: "operator" };
    },
  );
  assert.equal(accepted.statusCode, 303);
  assert.deepEqual(commands, [{ code, rawState: state, previousRawSessionId }]);

  const denied = await handleOAuthCallbackRequest(
    {
      method: "GET",
      url: `${redirectUri}?code=${code}&state=${state}`,
      headers: {
        cookie:
          `__Host-waw_session=${previousRawSessionId}; ` +
          "__Host-waw_session=duplicate-session-0123456789abcdef",
      },
    },
    configuration,
    async () => {
      throw new Error("duplicate cookie must not reach callback");
    },
  );
  assert.deepEqual(denied, {
    statusCode: 400,
    headers: {},
    body: { kind: "denied", reason: "callback-invalid" },
  });
});

test("rejects oversized or malformed callback code and state before dispatch", async () => {
  const configuration = productionConfiguration();
  const invalidUrls = [
    `${redirectUri}?code=${"a".repeat(2049)}&state=${state}`,
    `${redirectUri}?code=${code}&state=${"a".repeat(129)}`,
    `${redirectUri}?code=${code}&state=not%20base64url`,
  ];
  for (const url of invalidUrls) {
    let dispatched = false;
    const response = await handleOAuthCallbackRequest(
      { method: "GET", url },
      configuration,
      async () => {
        dispatched = true;
        return { kind: "succeeded", authorizationTier: "operator" };
      },
    );
    assert.equal(response.statusCode, 400);
    assert.equal(dispatched, false);
  }
});

test("disables login and callback DTOs in arbitrary preview", async () => {
  const configuration = parseAuthConfiguration({
    environment: "arbitrary-preview",
  });
  assert.deepEqual(
    createOAuthLoginResponse(configuration, undefined, state),
    {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    },
  );
  assert.deepEqual(
    await handleOAuthCallbackRequest(
      { method: "GET", url: `${redirectUri}?code=${code}&state=${state}` },
      configuration,
      async () => {
        throw new Error("disabled callback must not run");
      },
    ),
    {
      statusCode: 404,
      headers: {},
      body: { kind: "denied", reason: "auth-disabled" },
    },
  );
});
