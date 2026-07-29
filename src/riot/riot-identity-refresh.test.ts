import assert from "node:assert/strict";
import test from "node:test";

import { RiotIdentityRefreshScheduler } from "./riot-identity-refresh.ts";

test("refreshes a bounded active-link batch and preserves failures", async () => {
  const updated: unknown[] = [];
  const targets = [
    { linkId: "a", puuid: "A".repeat(64), platformId: "KR", version: 1 },
    { linkId: "b", puuid: "B".repeat(64), platformId: "KR", version: 2 },
  ];
  const scheduler = new RiotIdentityRefreshScheduler({
    source: {
      async listIdentityRefreshTargets(input) {
        assert.equal(input.limit, 2);
        return targets;
      },
      async updateIdentity(input) { updated.push(input); },
    },
    identities: {
      async lookupByPuuid(input) {
        if (input.puuid === "B".repeat(64)) throw new Error("provider unavailable");
        return {
          normalizedPuuid: input.puuid,
          gameName: "새 이름",
          tagLine: "NEW",
        };
      },
    },
    batchSize: 2,
  });
  await scheduler.tick();
  assert.deepEqual(updated, [{
    ...targets[0],
    gameName: "새 이름",
    tagLine: "NEW",
  }]);
});

test("does not write when Account-v1 returns another PUUID", async () => {
  let writes = 0;
  const scheduler = new RiotIdentityRefreshScheduler({
    source: {
      async listIdentityRefreshTargets() {
        return [{ linkId: "a", puuid: "A".repeat(64), platformId: "KR", version: 1 }];
      },
      async updateIdentity() { writes += 1; },
    },
    identities: {
      async lookupByPuuid() {
        return {
          normalizedPuuid: "B".repeat(64),
          gameName: "잘못된 이름",
          tagLine: "BAD",
        };
      },
    },
    batchSize: 1,
  });
  await scheduler.tick();
  assert.equal(writes, 0);
});
