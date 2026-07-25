import type { Pool, PoolClient } from "pg";

import type {
  RiotAccountLink,
  RiotAccountLinkStore,
} from "../riot/account-link.ts";
import type {
  GameCommandStore,
  GameStatusItem,
} from "../game/game-command-executor.ts";
import type {
  IncidentMutation,
  IncidentMutationStore,
} from "../game/incident-service.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type RiotLinkRow = {
  link_id: string;
  discord_user_id: string;
  puuid: string;
  platform_id: string;
  game_name: string;
  tag_line: string;
  verification_method: RiotAccountLink["verificationMethod"];
  is_primary: boolean;
  approved_by: string | null;
  created_at: Date;
  removed_at: Date | null;
};

export class PostgresFeatureStore
  implements RiotAccountLinkStore, IncidentMutationStore, GameCommandStore
{
  constructor(private readonly pool: Pool) {}

  async findActiveByPuuid(puuid: string): Promise<RiotAccountLink | undefined> {
    return this.run("riot_link_read_failed", async () => {
      const result = await this.pool.query<RiotLinkRow>(
        `${RIOT_LINK_SELECT} where puuid = $1 and removed_at is null`,
        [puuid],
      );
      return result.rows[0] && mapRiotLink(result.rows[0]);
    });
  }

  async listActive(discordUserId: string): Promise<readonly RiotAccountLink[]> {
    return this.run("riot_link_read_failed", async () => {
      const result = await this.pool.query<RiotLinkRow>(
        `${RIOT_LINK_SELECT}
          where discord_user_id = $1 and removed_at is null
          order by is_primary desc, created_at, link_id`,
        [discordUserId],
      );
      return result.rows.map(mapRiotLink);
    });
  }

  async save(link: RiotAccountLink): Promise<void> {
    await this.run("riot_link_write_failed", () =>
      this.pool.query(
        `insert into riot_account_link (
          link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
          verification_method, is_primary, approved_by, created_at, removed_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          link.linkId,
          link.discordUserId,
          link.puuid,
          link.platformId,
          link.gameName,
          link.tagLine,
          link.verificationMethod,
          link.isPrimary,
          link.approvedBy ?? null,
          link.createdAt,
          link.removedAt ?? null,
        ],
      ),
    );
  }

  async remove(
    linkId: string,
    discordUserId: string,
    removedAt: Date,
  ): Promise<boolean> {
    return this.run("riot_link_remove_failed", async () => {
      const result = await this.pool.query(
        `update riot_account_link
            set removed_at = $3, is_primary = false
          where link_id = $1 and discord_user_id = $2 and removed_at is null`,
        [linkId, discordUserId, removedAt],
      );
      return result.rowCount === 1;
    });
  }

  async mutateWithAudit(
    input: IncidentMutation,
  ): Promise<"updated" | "conflict" | "not_found"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{
        status: string;
        version: string;
      }>(
        `select status, version::text
           from game_incident
          where incident_id = $1
          for update`,
        [input.incidentId],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query("rollback");
        return "not_found";
      }
      if (Number(row.version) !== input.expectedVersion) {
        await client.query("rollback");
        return "conflict";
      }
      if (row.status === "corrected" || row.status === "cancelled") {
        await client.query("rollback");
        return "conflict";
      }
      const nextStatus = input.action === "cancel" ? "cancelled" : "corrected";
      const operation = await client.query(
        `insert into operation_ledger (
          operation_id, actor_id, accepted_at, outcome, reason_code
        ) values ($1,$2,$3,'accepted','accepted')
        on conflict (operation_id) do nothing`,
        [input.operationId, input.actorId, input.occurredAt],
      );
      if (operation.rowCount !== 1) {
        await client.query("rollback");
        return "conflict";
      }
      await client.query(
        `update game_incident
            set status = $2, version = version + 1, updated_at = $3
          where incident_id = $1`,
        [input.incidentId, nextStatus, input.occurredAt],
      );
      await appendRevision(client, input, row.status, nextStatus);
      await client.query(
        `insert into audit_event (
          event_id, operation_id, occurred_at, event_type, actor_id,
          outcome, reason_code, correlation_id
        ) values ($1,$2,$3,$4,$5,'success',$6,$2)`,
        [
          `incident:${input.operationId}`,
          input.operationId,
          input.occurredAt,
          `game.${input.action}`,
          input.actorId,
          `${input.action}_completed`,
        ],
      );
      await client.query("commit");
      return "updated";
    } catch {
      await client.query("rollback").catch(() => undefined);
      throw new PersistenceError("incident_mutation_failed");
    } finally {
      client.release();
    }
  }

  async findIncidentVersion(incidentId: string): Promise<number | undefined> {
    return this.run("incident_read_failed", async () => {
      const result = await this.pool.query<{ version: string }>(
        `select version::text from game_incident where incident_id = $1`,
        [incidentId],
      );
      return result.rows[0] ? Number(result.rows[0].version) : undefined;
    });
  }

  async listStatus(discordUserId: string): Promise<readonly GameStatusItem[]> {
    return this.run("game_status_read_failed", async () => {
      const result = await this.pool.query<GameStatusRow>(
        `select incident.incident_id, incident.discord_user_id,
                game.platform_id, game.game_id, incident.comparison_state,
                incident.status, incident.version::text,
                riot.state riot_state, discord.state go_live_state,
                greatest(riot.observed_at, discord.observed_at) observed_at
           from game_incident incident
           join riot_game game on game.game_key = incident.game_key
           join lateral (
             select state, observed_at from game_observation
              where game_key = incident.game_key
                and discord_user_id = incident.discord_user_id
                and source = 'riot_spectator'
              order by observed_at desc, generation desc limit 1
           ) riot on true
           join lateral (
             select state, observed_at from game_observation
              where game_key = incident.game_key
                and discord_user_id = incident.discord_user_id
                and source = 'discord_voice'
              order by observed_at desc, generation desc limit 1
           ) discord on true
          where incident.discord_user_id = $1
          order by incident.updated_at desc, incident.incident_id`,
        [discordUserId],
      );
      return result.rows.map((row) => ({
        incidentId: row.incident_id,
        discordUserId: row.discord_user_id,
        platformId: row.platform_id,
        gameId: row.game_id,
        riotState: row.riot_state,
        goLiveState: row.go_live_state,
        comparisonState: row.comparison_state,
        status: row.status,
        version: Number(row.version),
        observedAt: row.observed_at,
      }));
    });
  }

  private async run<T>(reasonCode: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch {
      throw new PersistenceError(reasonCode);
    }
  }
}

type GameStatusRow = {
  incident_id: string;
  discord_user_id: string;
  platform_id: string;
  game_id: string;
  riot_state: GameStatusItem["riotState"];
  go_live_state: GameStatusItem["goLiveState"];
  comparison_state: GameStatusItem["comparisonState"];
  status: GameStatusItem["status"];
  version: string;
  observed_at: Date;
};

const RIOT_LINK_SELECT = `select link_id, discord_user_id, puuid, platform_id,
  game_name, tag_line, verification_method, is_primary, approved_by, created_at,
  removed_at from riot_account_link`;

function mapRiotLink(row: RiotLinkRow): RiotAccountLink {
  return {
    linkId: row.link_id,
    discordUserId: row.discord_user_id,
    puuid: row.puuid,
    platformId: row.platform_id,
    gameName: row.game_name,
    tagLine: row.tag_line,
    verificationMethod: row.verification_method,
    isPrimary: row.is_primary,
    ...(row.approved_by === null ? {} : { approvedBy: row.approved_by }),
    createdAt: row.created_at,
    ...(row.removed_at === null ? {} : { removedAt: row.removed_at }),
  };
}

async function appendRevision(
  client: PoolClient,
  input: IncidentMutation,
  previousStatus: string,
  nextStatus: string,
): Promise<void> {
  await client.query(
    `insert into game_incident_revision (
      revision_id, incident_id, operation_id, actor_id, action,
      previous_status, next_status, reason, occurred_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `revision:${input.operationId}`,
      input.incidentId,
      input.operationId,
      input.actorId,
      input.action,
      previousStatus,
      nextStatus,
      input.reason,
      input.occurredAt,
    ],
  );
}
