import assert from "node:assert/strict";
import test from "node:test";

import { RiotPuuidValidator } from "./riot-puuid-validator.ts";

const puuid = "A".repeat(64);
const secret = "RGAPI-SYNTHETIC-SECRET-CANARY";

test("resolves an exact KR Riot ID to PUUID", async () => {
  const validator = new RiotPuuidValidator(secret, async (input) => {
    assert.match(String(input), /\/by-riot-id\//);
    return Response.json({ puuid, gameName: "합성계정", tagLine: "KR1" });
  });
  assert.deepEqual(
    await validator.resolve({ gameName: "합성계정", tagLine: "kr1", platformId: "KR" }),
    { kind: "valid", normalizedPuuid: puuid },
  );
});

test("resolves a Unicode Riot tag through an encoded Account API path", async () => {
  const validator = new RiotPuuidValidator(secret, async (input) => {
    assert.match(
      String(input),
      /\/by-riot-id\/simsul%EB%B3%B5%EC%88%AD%EC%95%84\/%EC%8B%AC%EB%B3%B5%ED%83%80%EB%8F%84$/u,
    );
    return Response.json({
      puuid,
      gameName: "simsul복숭아",
      tagLine: "심복타도",
    });
  });

  assert.deepEqual(
    await validator.resolve({
      gameName: "simsul복숭아",
      tagLine: "심복타도",
      platformId: "KR",
    }),
    { kind: "valid", normalizedPuuid: puuid },
  );
});

test("accepts only an exact Account API PUUID match", async () => {
  const requests: Array<{ url: string; token: string | null }> = [];
  const validator = new RiotPuuidValidator(secret, async (input, init) => {
    requests.push({
      url: String(input),
      token: new Headers(init?.headers).get("X-Riot-Token"),
    });
    return new Response(JSON.stringify({
      puuid,
      gameName: "현재 이름",
      tagLine: "KR1",
    }), { status: 200 });
  });

  assert.deepEqual(await validator.validate({ puuid: ` ${puuid} `, platformId: "kr" }), {
    kind: "valid",
    normalizedPuuid: puuid,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.token, secret);
  assert.match(requests[0]?.url ?? "", /^https:\/\/asia\.api\.riotgames\.com\//u);
});

test("reads the latest Riot ID display metadata by permanent PUUID", async () => {
  const validator = new RiotPuuidValidator(secret, async (input) => {
    assert.match(String(input), /\/by-puuid\//u);
    return Response.json({ puuid, gameName: "변경된 이름", tagLine: "NEW" });
  });
  assert.deepEqual(await validator.lookupByPuuid({ puuid, platformId: "KR" }), {
    normalizedPuuid: puuid,
    gameName: "변경된 이름",
    tagLine: "NEW",
  });
});

test("rejects malformed, missing, and unsupported-platform identifiers", async () => {
  let calls = 0;
  const validator = new RiotPuuidValidator(secret, async () => {
    calls += 1;
    return new Response(null, { status: 404 });
  });

  assert.deepEqual(await validator.validate({ puuid: "bad/value", platformId: "KR" }), {
    kind: "invalid",
    reasonCode: "invalid_puuid",
  });
  assert.deepEqual(await validator.validate({ puuid, platformId: "NA1" }), {
    kind: "invalid",
    reasonCode: "platform_mismatch",
  });
  assert.deepEqual(await validator.validate({ puuid, platformId: "KR" }), {
    kind: "invalid",
    reasonCode: "invalid_puuid",
  });
  assert.equal(calls, 1);
});

test("normalizes provider and response failures without reflecting sensitive data", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => new Response("denied", { status: 401 }),
    async () => new Response("limited", { status: 429 }),
    async () => new Response("failed", { status: 500 }),
    async () => new Response(JSON.stringify({ puuid: "B".repeat(64) }), { status: 200 }),
    async () => new Response("{", { status: 200 }),
    async () => new Response("x".repeat(4_097), { status: 200 }),
    async () => {
      throw new Error(`${secret} ${puuid}`);
    },
  ];

  for (const response of cases) {
    const validator = new RiotPuuidValidator(secret, response);
    await assert.rejects(
      validator.validate({ puuid, platformId: "KR" }),
      (error: Error) => {
        assert.equal(error.message, "riot_validator_unavailable");
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.message.includes(puuid), false);
        return true;
      },
    );
  }
});
