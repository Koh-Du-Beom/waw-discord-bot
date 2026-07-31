import type { Pool, PoolClient } from "pg";

import type {
  GameObservationStore,
  PersistedGameObservation,
} from "../game/game-observation-executor.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresGameObservationStore implements GameObservationStore {
  constructor(private readonly pool: Pool) {}

  async record(
    input: PersistedGameObservation,
  ): Promise<"recorded" | "violation_recorded" | "duplicate" | "stale"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const activeLink = await client.query(
        `select 1
           from riot_account_link
          where link_id = $1 and version = $2 and removed_at is null
          for share`,
        [input.linkId, input.linkVersion],
      );
      if (activeLink.rowCount !== 1) {
        await client.query("rollback");
        return "stale";
      }
      await client.query(
        `insert into riot_game (
          game_key, platform_id, game_id, queue_id, started_at
        ) values ($1,$2,$3,$4,$5)
        on conflict (platform_id, game_id) do nothing`,
        [
          input.gameKey,
          input.platformId,
          input.gameId,
          input.queueId,
          input.gameStartedAt,
        ],
      );
      const game = await client.query<{
        game_key: string;
        queue_id: number;
        started_at: Date;
      }>(
        `select game_key, queue_id, started_at
           from riot_game
          where platform_id = $1 and game_id = $2
          for update`,
        [input.platformId, input.gameId],
      );
      const row = game.rows[0];
      if (
        !row ||
        row.game_key !== input.gameKey ||
        row.queue_id !== input.queueId ||
        row.started_at.getTime() !== input.gameStartedAt.getTime()
      ) {
        throw new Error("game identity mismatch");
      }
      const incident = await client.query<{
        status: string;
        comparison_state: string;
      }>(
        `select status, comparison_state
           from game_incident
          where game_key = $1 and discord_user_id = $2
          for update`,
        [input.gameKey, input.discordUserId],
      );
      const priorIncident = incident.rows[0];
      const firstViolation =
        input.comparisonState === "violation" &&
        (priorIncident === undefined ||
          (priorIncident.status === "open" &&
            priorIncident.comparison_state !== "violation"));

      const latest = await client.query<{ observed_at: Date }>(
        `select observed_at
           from game_observation
          where game_key = $1 and discord_user_id = $2
          order by observed_at desc
          limit 1
          for update`,
        [input.gameKey, input.discordUserId],
      );
      if (
        latest.rows[0] &&
        latest.rows[0].observed_at.getTime() > input.observedAt.getTime()
      ) {
        await client.query("rollback");
        return "stale";
      }

      const riotInserted = await insertEvidence(client, input, "riot_spectator");
      const discordInserted = await insertEvidence(client, input, "discord_voice");
      if (!riotInserted && !discordInserted) {
        await client.query("rollback");
        return "duplicate";
      }
      if (!riotInserted || !discordInserted) {
        throw new Error("partial observation generation conflict");
      }

      await client.query(
        `insert into game_incident (
          incident_id, game_key, discord_user_id, status, comparison_state,
          policy_version, version, created_at, updated_at
        ) values (
          $1,$2,$3,
          case when $4 = 'violation' then 'confirmed' else 'open' end,
          $4,$5,0,$6,$6
        )
        on conflict (game_key, discord_user_id) do update
          set status = case
                when game_incident.comparison_state = 'violation'
                  then 'confirmed'
                else excluded.status
              end,
              comparison_state = case
                when game_incident.comparison_state = 'violation'
                  then game_incident.comparison_state
                else excluded.comparison_state
              end,
              policy_version = excluded.policy_version,
              version = game_incident.version + 1,
              updated_at = excluded.updated_at
        where game_incident.status = 'open'`,
        [
          incidentId(input.gameKey, input.discordUserId),
          input.gameKey,
          input.discordUserId,
          input.comparisonState,
          input.policyVersion,
          input.observedAt,
        ],
      );
      await client.query("commit");
      return firstViolation ? "violation_recorded" : "recorded";
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("game_observation_write_failed");
    } finally {
      client.release();
    }
  }
}

async function insertEvidence(
  client: PoolClient,
  input: PersistedGameObservation,
  source: "riot_spectator" | "discord_voice",
): Promise<boolean> {
  const evidence = source === "riot_spectator" ? input.riot : input.goLive;
  const result = await client.query(
    `insert into game_observation (
      observation_id, game_key, discord_user_id, source, state, observed_at,
      source_observed_at, evidence_code, generation
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (game_key, discord_user_id, source, generation) do nothing`,
    [
      observationId(input.gameKey, input.discordUserId, source, evidence.generation),
      input.gameKey,
      input.discordUserId,
      source,
      evidence.state,
      input.observedAt,
      source === "discord_voice" ? input.goLive.sourceObservedAt ?? null : null,
      evidence.evidenceCode,
      evidence.generation,
    ],
  );
  return result.rowCount === 1;
}

function observationId(
  gameKey: string,
  discordUserId: string,
  source: string,
  generation: number,
): string {
  return `observation:${gameKey}:${discordUserId}:${source}:${generation}`;
}

function incidentId(gameKey: string, discordUserId: string): string {
  return `incident:${gameKey}:${discordUserId}`;
}
