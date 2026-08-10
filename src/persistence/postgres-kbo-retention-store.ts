import type { Pool } from "pg";

import { PersistenceError } from "./postgres-persistence.ts";

export class PostgresKboRetentionStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async purgeExpired(observedAt: Date, batchLimit = 100): Promise<number> {
    if (
      Number.isNaN(observedAt.getTime()) ||
      !Number.isSafeInteger(batchLimit) ||
      batchLimit < 1 ||
      batchLimit > 100
    ) {
      throw new PersistenceError("kbo_retention_input_invalid");
    }
    try {
      const result = await this.pool.query<{ purged: number }>(
        `select purge_expired_kbo_accounts($1, $2) purged`,
        [observedAt, batchLimit],
      );
      return result.rows[0]?.purged ?? 0;
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("kbo_retention_purge_failed");
    }
  }
}
