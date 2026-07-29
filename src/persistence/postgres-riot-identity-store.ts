import type { Pool } from "pg";

import type {
  RiotIdentityRefreshSource,
  RiotIdentityRefreshTarget,
} from "../riot/riot-identity-refresh.ts";
import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresRiotIdentityStore implements RiotIdentityRefreshSource {
  constructor(private readonly pool: Pool) {}

  async listIdentityRefreshTargets(input: {
    afterLinkId?: string;
    limit: number;
  }): Promise<readonly RiotIdentityRefreshTarget[]> {
    try {
      const result = await this.pool.query<{
        link_id: string;
        puuid: string;
        platform_id: string;
        version: string;
      }>(
        `select link_id, puuid, platform_id, version::text
           from riot_account_link
          where removed_at is null
            and ($1::text is null or link_id > $1)
          order by link_id
          limit $2`,
        [input.afterLinkId ?? null, input.limit],
      );
      return result.rows.map((row) => ({
        linkId: row.link_id,
        puuid: row.puuid,
        platformId: row.platform_id,
        version: Number(row.version),
      }));
    } catch {
      throw new PersistenceError("riot_identity_refresh_targets_failed");
    }
  }

  async updateIdentity(input: RiotIdentityRefreshTarget & {
    gameName: string;
    tagLine: string;
  }): Promise<void> {
    try {
      await this.pool.query(
        `update riot_account_link
            set game_name = $4, tag_line = $5, version = version + 1
          where link_id = $1
            and puuid = $2
            and version = $3
            and removed_at is null
            and (game_name, tag_line) is distinct from ($4, $5)`,
        [
          input.linkId,
          input.puuid,
          input.version,
          input.gameName,
          input.tagLine,
        ],
      );
    } catch {
      throw new PersistenceError("riot_identity_refresh_update_failed");
    }
  }
}
