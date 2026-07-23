import { createHash } from "node:crypto";

import type { Pool, PoolClient, QueryResult } from "pg";

import type { AuthorizationTier } from "../contracts/local-command.ts";
import type { OpaqueSession } from "./session-store.ts";

type Queryable = {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
};

export class MigrationAlreadyAppliedError extends Error {
  constructor(version: number) {
    super(`migration version ${version} is already applied`);
    this.name = "MigrationAlreadyAppliedError";
  }
}

export class MigrationChecksumMismatchError extends Error {
  constructor(version: number) {
    super(`migration version ${version} checksum differs`);
    this.name = "MigrationChecksumMismatchError";
  }
}

export class PersistenceError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super("persistence operation failed");
    this.name = "PersistenceError";
    this.reasonCode = reasonCode;
  }

  toJSON(): { name: string; reasonCode: string } {
    return { name: this.name, reasonCode: this.reasonCode };
  }
}

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export async function applyPendingMigrations(
  pool: Pool,
  migrations: readonly Migration[],
): Promise<number[]> {
  const appliedVersions: number[] = [];
  for (const migration of migrations) {
    const ledger = await pool.query<{ relation: string | null }>(
      "select to_regclass('public.waw_schema_migration')::text as relation",
    );
    const existing =
      ledger.rows[0]?.relation === null
        ? undefined
        : await pool.query<{ sha256: string }>(
            "select sha256 from waw_schema_migration where version = $1",
            [migration.version],
          );
    if (existing !== undefined && existing.rowCount !== 0) {
      const expected = createHash("sha256").update(migration.sql, "utf8").digest("hex");
      if (existing.rows[0]?.sha256 !== expected) {
        throw new MigrationChecksumMismatchError(migration.version);
      }
      continue;
    }
    await applyMigration(pool, migration);
    appliedVersions.push(migration.version);
  }
  return appliedVersions;
}

const legacyVersionOneColumns = [
  "app_schema_version.version",
  "app_session.absolute_expires_at",
  "app_session.actor_id",
  "app_session.authorization_tier",
  "app_session.created_at",
  "app_session.idle_expires_at",
  "app_session.last_seen_at",
  "app_session.revoked_at",
  "app_session.session_id_hash",
  "audit_event.actor_id",
  "audit_event.correlation_id",
  "audit_event.event_id",
  "audit_event.event_type",
  "audit_event.occurred_at",
  "audit_event.outcome",
  "audit_event.reason_code",
  "operation_ledger.accepted_at",
  "operation_ledger.actor_id",
  "operation_ledger.operation_id",
  "operation_ledger.outcome",
  "operation_ledger.reason_code",
] as const;

export async function applyMigration(pool: Pool, migration: Migration): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('waw_schema_migration'))");
    if (migration.version === 1 && (await isExactLegacyVersionOne(client))) {
      await createMigrationLedger(client);
      await recordMigration(client, migration);
      await client.query("commit");
      return;
    }
    await createMigrationLedger(client);
    const applied = await client.query<{ version: number }>(
      "select version from waw_schema_migration where version = $1",
      [migration.version],
    );
    if (applied.rowCount !== 0) {
      throw new MigrationAlreadyAppliedError(migration.version);
    }

    await client.query(migration.sql);
    await recordMigration(client, migration);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof MigrationAlreadyAppliedError) {
      throw error;
    }
    throw new PersistenceError("migration_failed");
  } finally {
    client.release();
  }
}

async function createMigrationLedger(client: PoolClient): Promise<void> {
  await client.query(`
    create table if not exists waw_schema_migration (
      version integer primary key check (version > 0),
      name text not null,
      sha256 text not null,
      applied_at timestamptz not null default clock_timestamp()
    )
  `);
}

async function recordMigration(client: PoolClient, migration: Migration): Promise<void> {
  await client.query(
    `insert into waw_schema_migration (version, name, sha256)
     values ($1, $2, $3)`,
    [
      migration.version,
      migration.name,
      createHash("sha256").update(migration.sql, "utf8").digest("hex"),
    ],
  );
}

async function isExactLegacyVersionOne(client: PoolClient): Promise<boolean> {
  const relations = await client.query<{
    ledger: string | null;
    version_table: string | null;
    oauth_state: string | null;
    role_cache: string | null;
  }>(`
    select
      to_regclass('public.waw_schema_migration')::text as ledger,
      to_regclass('public.app_schema_version')::text as version_table,
      to_regclass('public.oauth_state')::text as oauth_state,
      to_regclass('public.role_cache')::text as role_cache
  `);
  const relation = relations.rows[0];
  if (
    relation?.ledger !== null ||
    relation?.version_table === null ||
    relation?.oauth_state !== null ||
    relation?.role_cache !== null
  ) {
    return false;
  }

  const versions = await client.query<{ version: number }>(
    "select version from app_schema_version order by version",
  );
  if (versions.rows.length !== 1 || versions.rows[0]?.version !== 1) {
    return false;
  }

  const columns = await client.query<{ column_name: string }>(`
    select table_name || '.' || column_name as column_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name in (
         'app_schema_version',
         'app_session',
         'operation_ledger',
         'audit_event'
       )
     order by table_name, column_name
  `);
  if (
    columns.rows.map((row) => row.column_name).join("\n") !==
    [...legacyVersionOneColumns].sort().join("\n")
  ) {
    return false;
  }

  const rls = await client.query<{ relrowsecurity: boolean }>(`
    select relrowsecurity
      from pg_class
     where oid in (
       'public.app_session'::regclass,
       'public.operation_ledger'::regclass,
       'public.audit_event'::regclass
     )
  `);
  return rls.rows.length === 3 && rls.rows.every((row) => row.relrowsecurity);
}

export type OAuthState = {
  stateHash: string;
  expiresAt: Date;
};

export type RoleCache = {
  actorId: string;
  authorizationTier: AuthorizationTier;
  verifiedAt: Date;
};

export type AuditEvent = {
  eventId: string;
  operationId?: string;
  occurredAt: Date;
  eventType: string;
  actorId?: string;
  outcome: string;
  reasonCode: string;
  correlationId: string;
};

export type OperationWithAudit = {
  operationId: string;
  actorId: string;
  acceptedAt: Date;
  operationOutcome: "accepted" | "denied";
  operationReasonCode: string;
  audit: AuditEvent;
};

export class PostgresPersistence {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async saveSession(session: OpaqueSession): Promise<void> {
    await this.run("session_save_failed", (database) =>
      database.query(
        `insert into app_session (
          session_id_hash, actor_id, authorization_tier, created_at, last_seen_at,
          idle_expires_at, absolute_expires_at, revoked_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        sessionValues(session),
      ),
    );
  }

  async findSession(sessionIdHash: string): Promise<OpaqueSession | undefined> {
    return this.run("session_read_failed", async (database) => {
      const result = await database.query<SessionRow>(
        `select session_id_hash, actor_id, authorization_tier, created_at, last_seen_at,
                idle_expires_at, absolute_expires_at, revoked_at
           from app_session
          where session_id_hash = $1`,
        [sessionIdHash],
      );
      return result.rows[0] === undefined ? undefined : mapSession(result.rows[0]);
    });
  }

  async revokeSession(sessionIdHash: string, revokedAt: Date): Promise<boolean> {
    return this.run("session_revoke_failed", async (database) => {
      const result = await database.query(
        `update app_session
            set revoked_at = $2
          where session_id_hash = $1 and revoked_at is null`,
        [sessionIdHash, revokedAt],
      );
      return result.rowCount === 1;
    });
  }

  async rotateSession(
    previousSessionIdHash: string,
    nextSession: OpaqueSession,
    revokedAt: Date,
  ): Promise<void> {
    await this.transaction("session_rotation_failed", async (client) => {
      const revoked = await client.query(
        `update app_session
            set revoked_at = $2
          where session_id_hash = $1 and revoked_at is null`,
        [previousSessionIdHash, revokedAt],
      );
      if (revoked.rowCount !== 1) {
        throw new Error("previous session is unavailable");
      }
      await client.query(
        `insert into app_session (
          session_id_hash, actor_id, authorization_tier, created_at, last_seen_at,
          idle_expires_at, absolute_expires_at, revoked_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        sessionValues(nextSession),
      );
    });
  }

  async touchSession(
    sessionIdHash: string,
    lastSeenAt: Date,
    proposedIdleExpiresAt: Date,
  ): Promise<boolean> {
    return this.run("session_touch_failed", async (database) => {
      const result = await database.query(
        `update app_session
            set last_seen_at = $2,
                idle_expires_at = least($3, absolute_expires_at)
          where session_id_hash = $1
            and revoked_at is null
            and idle_expires_at > $2
            and absolute_expires_at > $2`,
        [sessionIdHash, lastSeenAt, proposedIdleExpiresAt],
      );
      return result.rowCount === 1;
    });
  }

  async createOAuthState(state: OAuthState): Promise<void> {
    await this.run("oauth_state_save_failed", (database) =>
      database.query(
        "insert into oauth_state (state_hash, expires_at) values ($1, $2)",
        [state.stateHash, state.expiresAt],
      ),
    );
  }

  async consumeOAuthState(stateHash: string, usedAt: Date): Promise<boolean> {
    return this.run("oauth_state_consume_failed", async (database) => {
      const result = await database.query(
        `update oauth_state
            set used_at = $2
          where state_hash = $1
            and used_at is null
            and expires_at > $2`,
        [stateHash, usedAt],
      );
      return result.rowCount === 1;
    });
  }

  async upsertRoleCache(cache: RoleCache): Promise<void> {
    await this.run("role_cache_write_failed", (database) =>
      database.query(
        `insert into role_cache (actor_id, authorization_tier, verified_at)
         values ($1, $2, $3)
         on conflict (actor_id) do update
           set authorization_tier = excluded.authorization_tier,
               verified_at = excluded.verified_at`,
        [cache.actorId, cache.authorizationTier, cache.verifiedAt],
      ),
    );
  }

  async findFreshRoleCache(actorId: string, now: Date): Promise<RoleCache | undefined> {
    return this.run("role_cache_read_failed", async (database) => {
      const result = await database.query<RoleCacheRow>(
        `select actor_id, authorization_tier, verified_at
           from role_cache
          where actor_id = $1
            and verified_at <= $2
            and verified_at >= $2 - interval '5 minutes'`,
        [actorId, now],
      );
      const row = result.rows[0];
      return row === undefined
        ? undefined
        : {
            actorId: row.actor_id,
            authorizationTier: row.authorization_tier,
            verifiedAt: row.verified_at,
          };
    });
  }

  async recordOperationWithAudit(input: OperationWithAudit): Promise<boolean> {
    return this.transaction("operation_record_failed", async (client) => {
      const operation = await client.query(
        `insert into operation_ledger (
          operation_id, actor_id, accepted_at, outcome, reason_code
        ) values ($1, $2, $3, $4, $5)
        on conflict (operation_id) do nothing
        returning operation_id`,
        [
          input.operationId,
          input.actorId,
          input.acceptedAt,
          input.operationOutcome,
          input.operationReasonCode,
        ],
      );
      if (operation.rowCount === 0) {
        return false;
      }
      await client.query(
        `insert into audit_event (
          event_id, operation_id, occurred_at, event_type, actor_id, outcome, reason_code,
          correlation_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.audit.eventId,
          input.audit.operationId ?? input.operationId,
          input.audit.occurredAt,
          input.audit.eventType,
          input.audit.actorId ?? null,
          input.audit.outcome,
          input.audit.reasonCode,
          input.audit.correlationId,
        ],
      );
      return true;
    });
  }

  private async run<T>(
    reasonCode: string,
    operation: (database: Queryable) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(this.pool);
    } catch {
      throw new PersistenceError(reasonCode);
    }
  }

  private async transaction<T>(
    reasonCode: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch {
      await client?.query("rollback").catch(() => undefined);
      throw new PersistenceError(reasonCode);
    } finally {
      client?.release();
    }
  }
}

export type DatabaseSizeSnapshot = {
  observedAt: Date;
  databaseBytes: number;
  quotaBytes: number;
  usagePercent: number;
  status: "ok" | "warning" | "critical";
};

export async function readDatabaseSize(
  database: Queryable,
  quotaBytes: number,
): Promise<DatabaseSizeSnapshot> {
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) {
    throw new PersistenceError("database_size_config_invalid");
  }
  try {
    const result = await database.query<{ observed_at: Date; database_bytes: string }>(
      `select clock_timestamp() as observed_at,
              pg_database_size(current_database())::text as database_bytes`,
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("database size row is missing");
    }
    const databaseBytes = Number(row.database_bytes);
    const usagePercent = (databaseBytes / quotaBytes) * 100;
    return {
      observedAt: row.observed_at,
      databaseBytes,
      quotaBytes,
      usagePercent,
      status: usagePercent >= 85 ? "critical" : usagePercent >= 70 ? "warning" : "ok",
    };
  } catch {
    throw new PersistenceError("database_size_read_failed");
  }
}

type SessionRow = {
  session_id_hash: string;
  actor_id: string;
  authorization_tier: AuthorizationTier;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
};

type RoleCacheRow = {
  actor_id: string;
  authorization_tier: AuthorizationTier;
  verified_at: Date;
};

function sessionValues(session: OpaqueSession): unknown[] {
  return [
    session.sessionIdHash,
    session.actorId,
    session.authorizationTier,
    session.createdAt,
    session.lastSeenAt,
    session.idleExpiresAt,
    session.absoluteExpiresAt,
    session.revokedAt ?? null,
  ];
}

function mapSession(row: SessionRow): OpaqueSession {
  return {
    sessionIdHash: row.session_id_hash,
    actorId: row.actor_id,
    authorizationTier: row.authorization_tier,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}
