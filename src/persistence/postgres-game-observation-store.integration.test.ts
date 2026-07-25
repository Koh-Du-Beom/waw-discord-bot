import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { GameObservationExecutor } from "../game/game-observation-executor.ts";
import { PostgresGameObservationStore } from "./postgres-game-observation-store.ts";
import { PersistenceError } from "./postgres-persistence.ts";

const connectionString = process.env.WAW_POSTGRES_TEST_URL;
const enabled = connectionString !== undefined;
let pool: Pool;
let executor: GameObservationExecutor;

before(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 4 });
  await pool.query("select 1");
  executor = new GameObservationExecutor(new PostgresGameObservationStore(pool));
});

after(async () => {
  await pool?.end();
});

test(
  "persists separate evidence and comparison with deduplication, stale rejection and atomic rollback",
  { skip: !enabled },
  async () => {
    const first = observation({
      observedAt: new Date("2026-07-25T00:04:59.999Z"),
    });
    assert.equal(await executor.execute(first), "recorded");
    assert.equal(await executor.execute(first), "duplicate");

    const interrupted = observation({
      observedAt: new Date("2026-07-25T00:06:59.999Z"),
      riot: { state: "active", evidenceCode: "spectator_active", generation: 2 },
      goLive: {
        state: "inactive",
        evidenceCode: "voice_state_event",
        generation: 2,
        interruptedAt: new Date("2026-07-25T00:05:00Z"),
      },
    });
    assert.equal(await executor.execute(interrupted), "recorded");
    assert.equal(
      await executor.execute(
        observation({
          observedAt: new Date("2026-07-25T00:05:30Z"),
          riot: { state: "unknown", evidenceCode: "riot_timeout", generation: 3 },
          goLive: {
            state: "unknown",
            evidenceCode: "gateway_unavailable",
            generation: 3,
          },
        }),
      ),
      "stale",
    );

    const persisted = await pool.query<{
      source: string;
      state: string;
      evidence_code: string;
      comparison_state: string;
      version: string;
    }>(`
      select observation.source, observation.state, observation.evidence_code,
             incident.comparison_state, incident.version::text
        from game_observation observation
        join game_incident incident
          on incident.game_key = observation.game_key
         and incident.discord_user_id = observation.discord_user_id
       where observation.game_key = 'KR:observation-game'
       order by observation.generation desc, observation.source
       limit 2
    `);
    assert.deepEqual(persisted.rows, [
      {
        source: "discord_voice",
        state: "inactive",
        evidence_code: "voice_state_event",
        comparison_state: "interrupted",
        version: "1",
      },
      {
        source: "riot_spectator",
        state: "active",
        evidence_code: "spectator_active",
        comparison_state: "interrupted",
        version: "1",
      },
    ]);

    await pool.query(
      `delete from game_observation
        where game_key = 'KR:observation-game'
          and source = 'discord_voice' and generation = 2`,
    );
    await assert.rejects(executor.execute(interrupted), PersistenceError);
    const partial = await pool.query<{ riot_count: string; discord_count: string }>(`
      select
        count(*) filter (where source = 'riot_spectator')::text riot_count,
        count(*) filter (where source = 'discord_voice')::text discord_count
      from game_observation
      where game_key = 'KR:observation-game' and generation = 2
    `);
    assert.deepEqual(partial.rows, [{ riot_count: "1", discord_count: "0" }]);

    assert.equal(
      await executor.execute(
        observation({
          gameId: "observation-game-unknown",
          riot: { state: "unknown", evidenceCode: "riot_rate_limited", generation: 1 },
          goLive: {
            state: "unknown",
            evidenceCode: "gateway_unavailable",
            generation: 1,
          },
        }),
      ),
      "recorded",
    );
    assert.equal(
      (
        await pool.query<{ comparison_state: string }>(
          `select comparison_state from game_incident
            where game_key = 'KR:observation-game-unknown'`,
        )
      ).rows[0]?.comparison_state,
      "unknown",
    );
  },
);

function observation(
  overrides: Partial<Parameters<GameObservationExecutor["execute"]>[0]> = {},
): Parameters<GameObservationExecutor["execute"]>[0] {
  return {
    platformId: "KR",
    gameId: "observation-game",
    queueId: 420,
    gameStartedAt: new Date("2026-07-25T00:00:00Z"),
    discordUserId: "observation-member",
    observedAt: new Date("2026-07-25T00:05:00Z"),
    riot: { state: "active", evidenceCode: "spectator_active", generation: 1 },
    goLive: { state: "inactive", evidenceCode: "voice_state_event", generation: 1 },
    ...overrides,
  };
}
