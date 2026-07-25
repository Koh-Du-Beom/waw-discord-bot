import type { Pool } from "pg";

import type {
  ObservationTargetSource,
  ObservedRiotLink,
} from "../game/observation-scheduler.ts";
import { PersistenceError } from "./postgres-persistence.ts";

type TargetRow = {
  link_id: string;
  discord_user_id: string;
  platform_id: string;
  puuid: string;
};

export class PostgresObservationTargetSource implements ObservationTargetSource {
  constructor(
    private readonly pool: Pool,
    private readonly guildId: string,
  ) {}

  async listTargets(): Promise<readonly ObservedRiotLink[]> {
    try {
      const result = await this.pool.query<TargetRow>(
        `select link_id, discord_user_id, platform_id, puuid
           from riot_account_link
          where removed_at is null
          order by link_id`,
      );
      return result.rows.map((row) => ({
        linkId: row.link_id,
        guildId: this.guildId,
        discordUserId: row.discord_user_id,
        platformId: row.platform_id,
        puuid: row.puuid,
      }));
    } catch {
      throw new PersistenceError("observation_target_read_failed");
    }
  }
}
