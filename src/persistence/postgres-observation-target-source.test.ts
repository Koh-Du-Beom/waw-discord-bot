import assert from "node:assert/strict";
import test from "node:test";

import type { QueryResult } from "pg";

import { PostgresObservationTargetSource } from "./postgres-observation-target-source.ts";
import { PersistenceError } from "./postgres-persistence.ts";

test("reads only active Riot link fields and injects the configured guild", async () => {
  const calls: string[] = [];
  const source = new PostgresObservationTargetSource(
    {
      async query(text: string) {
        calls.push(text);
        return {
          rows: [{
            link_id: "link",
            discord_user_id: "member",
            platform_id: "KR",
            puuid: "normalized-puuid",
          }],
          rowCount: 1,
        } as QueryResult<never>;
      },
    } as never,
    "guild",
  );
  assert.deepEqual(await source.listTargets(), [{
    linkId: "link",
    guildId: "guild",
    discordUserId: "member",
    platformId: "KR",
    puuid: "normalized-puuid",
  }]);
  assert.match(calls[0]!, /where removed_at is null/);
  assert.doesNotMatch(calls[0]!, /game_name|tag_line/);
});

test("normalizes PostgreSQL failures without reflecting provider details", async () => {
  const source = new PostgresObservationTargetSource(
    { async query() { throw new Error("database-secret-canary"); } } as never,
    "guild",
  );
  let failure: unknown;
  try {
    await source.listTargets();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof PersistenceError);
  assert.equal(JSON.stringify(failure).includes("database-secret-canary"), false);
});
