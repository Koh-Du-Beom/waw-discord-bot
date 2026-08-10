import type { Pool } from "pg";

import { PersistenceError } from "./postgres-persistence.ts";

export type KboEnrollmentActor = {
  guildId: string;
  discordUserId: string;
  displayLabel: string;
  registeredAt: Date;
};

export type KboEnrollmentActorRegistrar = {
  register(actor: KboEnrollmentActor): Promise<void>;
};

const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboEnrollmentActorInputError extends Error {
  constructor() {
    super("invalid KBO enrollment actor input");
    this.name = "KboEnrollmentActorInputError";
  }
}

export class PostgresKboEnrollmentActorStore implements KboEnrollmentActorRegistrar {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async register(actor: KboEnrollmentActor): Promise<void> {
    if (
      !snowflakePattern.test(actor.guildId) ||
      !snowflakePattern.test(actor.discordUserId) ||
      actor.displayLabel.length < 1 ||
      actor.displayLabel.length > 80 ||
      !Number.isFinite(actor.registeredAt.getTime())
    ) {
      throw new KboEnrollmentActorInputError();
    }
    try {
      await this.pool.query(
        `insert into registered_discord_user (
           guild_id, discord_user_id, display_label, created_at, updated_at
         ) values ($1, $2, $3, $4, $4)
         on conflict (guild_id, discord_user_id) do update
           set display_label = excluded.display_label,
               updated_at = excluded.updated_at`,
        [actor.guildId, actor.discordUserId, actor.displayLabel, actor.registeredAt],
      );
    } catch {
      throw new PersistenceError("kbo_enrollment_actor_registration_failed");
    }
  }
}
