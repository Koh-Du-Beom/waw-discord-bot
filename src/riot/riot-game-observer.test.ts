import assert from "node:assert/strict";
import test from "node:test";

import { RiotSpectatorObserver } from "./riot-game-observer.ts";

const puuid = "A".repeat(64);
const secret = "RGAPI-SYNTHETIC-SECRET-CANARY";
const signal = new AbortController().signal;

test("normalizes active, inactive, and invalid Riot spectator results", async () => {
  const requests: Array<{ url: string; token: string | null }> = [];
  const responses = [
    Response.json({
      gameId: 1234567890,
      gameQueueConfigId: 420,
      gameStartTime: 1_785_000_000_000,
    }),
    new Response(null, { status: 404 }),
    Response.json({ gameId: 1, gameQueueConfigId: 420 }),
  ];
  const observer = new RiotSpectatorObserver(secret, async (input, init) => {
    requests.push({
      url: String(input),
      token: new Headers(init?.headers).get("X-Riot-Token"),
    });
    return responses.shift()!;
  });

  assert.deepEqual(await observer.observe({ platformId: "kr", puuid, signal }), {
    state: "active",
    gameId: "1234567890",
    queueId: 420,
    startedAt: new Date(1_785_000_000_000),
  });
  assert.deepEqual(await observer.observe({ platformId: "KR", puuid, signal }), {
    state: "inactive",
  });
  assert.deepEqual(await observer.observe({ platformId: "KR", puuid, signal }), {
    state: "unknown",
    reasonCode: "riot_response_invalid",
  });
  assert.equal(requests[0]?.token, secret);
  assert.match(requests[0]?.url ?? "", /^https:\/\/kr\.api\.riotgames\.com\//u);
});

test("honors Retry-After without another provider call", async () => {
  let now = 1_000;
  let calls = 0;
  const observer = new RiotSpectatorObserver(
    secret,
    async () => {
      calls += 1;
      return new Response(null, { status: 429, headers: { "Retry-After": "2" } });
    },
    () => now,
  );

  assert.deepEqual(await observer.observe({ platformId: "KR", puuid, signal }), {
    state: "unknown",
    reasonCode: "riot_rate_limited",
  });
  now = 2_999;
  assert.deepEqual(await observer.observe({ platformId: "KR", puuid, signal }), {
    state: "unknown",
    reasonCode: "riot_rate_limited",
  });
  assert.equal(calls, 1);
});

test("normalizes failures without reflecting credentials or identifiers", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => new Response("denied", { status: 403 }),
    async () => new Response("x".repeat(16_385), { status: 200 }),
    async () => {
      throw new Error(`${secret} ${puuid}`);
    },
  ];
  for (const response of cases) {
    const result = await new RiotSpectatorObserver(secret, response).observe({
      platformId: "KR",
      puuid,
      signal,
    });
    assert.equal(result.state, "unknown");
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(puuid), false);
  }
});
