import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { PostgresObservationTargetSource } from "./postgres-observation-target-source.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
let pool: Pool;

before(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 2 });
});

after(async () => {
  await pool?.end();
});

test("returns active links only from PostgreSQL", { skip: !enabled }, async () => {
  await pool.query(`
    insert into riot_account_link (
      link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
      verification_method, is_primary, approved_by, created_at, removed_at
    ) values
      ('target-active', 'target-member', 'target-active-puuid', 'KR',
       'active', 'KR1', 'admin_approved_unverified', true, 'admin',
       '2026-07-25T00:00:00Z', null),
      ('target-removed', 'target-member', 'target-removed-puuid', 'KR',
       'removed', 'KR1', 'admin_approved_unverified', false, 'admin',
       '2026-07-25T00:00:00Z', '2026-07-25T01:00:00Z')
  `);
  const source = new PostgresObservationTargetSource(pool, "guild");
  assert.deepEqual(await source.listTargets(), [{
    linkId: "target-active",
    guildId: "guild",
    discordUserId: "target-member",
    platformId: "KR",
    puuid: "target-active-puuid",
  }]);
});
