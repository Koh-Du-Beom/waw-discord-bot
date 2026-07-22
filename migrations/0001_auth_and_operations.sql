create table app_schema_version (
  version integer primary key check (version > 0)
);

insert into app_schema_version (version) values (1);

create table app_session (
  session_id_hash text primary key,
  actor_id text not null,
  authorization_tier text not null check (authorization_tier in ('operator', 'administrator')),
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz
);

create table operation_ledger (
  operation_id text primary key,
  actor_id text not null,
  accepted_at timestamptz not null,
  outcome text not null check (outcome in ('accepted', 'denied')),
  reason_code text not null
);

create table audit_event (
  event_id text primary key,
  occurred_at timestamptz not null,
  event_type text not null,
  actor_id text,
  outcome text not null,
  reason_code text not null,
  correlation_id text not null
);

alter table app_session enable row level security;
alter table operation_ledger enable row level security;
alter table audit_event enable row level security;

-- Workload-specific roles and policies are added only with the production
-- connection design; this migration deliberately does not grant public access.
