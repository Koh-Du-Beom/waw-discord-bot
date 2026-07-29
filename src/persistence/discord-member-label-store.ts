import type { QueryResult } from "pg";

import { PersistenceError } from "./postgres-persistence.ts";

type Queryable = {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<Record<string, unknown>>>;
};

export type DiscordMemberLabel = {
  guildId: string;
  discordUserId: string;
  displayLabel: string;
};

export class PostgresDiscordMemberLabelStore {
  constructor(private readonly database: Queryable) {}

  async refreshKnown(
    members: readonly DiscordMemberLabel[],
    observedAt: Date,
  ): Promise<void> {
    if (members.length === 0) return;
    try {
      await this.database.query(
        `update registered_discord_user users
            set display_label = incoming.display_label,
                updated_at = $4
           from unnest($1::text[], $2::text[], $3::text[])
             as incoming(guild_id, discord_user_id, display_label)
          where users.guild_id = incoming.guild_id
            and users.discord_user_id = incoming.discord_user_id
            and users.display_label is distinct from incoming.display_label`,
        [
          members.map((member) => member.guildId),
          members.map((member) => member.discordUserId),
          members.map((member) => member.displayLabel),
          observedAt,
        ],
      );
    } catch {
      throw new PersistenceError("discord_member_label_refresh_failed");
    }
  }
}
