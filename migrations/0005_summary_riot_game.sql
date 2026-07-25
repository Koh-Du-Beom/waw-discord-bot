alter table audit_event
  add column guild_id text,
  add column channel_id text,
  add column command_name text;

create table riot_account_link (
  link_id text primary key,
  discord_user_id text not null,
  puuid text not null,
  platform_id text not null,
  game_name text not null,
  tag_line text not null,
  verification_method text not null check (
    verification_method in ('admin_approved_unverified', 'rso_verified')
  ),
  is_primary boolean not null default false,
  approved_by text,
  created_at timestamptz not null,
  removed_at timestamptz,
  check (
    (verification_method = 'admin_approved_unverified' and approved_by is not null)
    or verification_method = 'rso_verified'
  ),
  check (removed_at is null or removed_at >= created_at)
);

create unique index riot_account_link_active_puuid_uq
  on riot_account_link (puuid)
  where removed_at is null;

create unique index riot_account_link_one_primary_uq
  on riot_account_link (discord_user_id)
  where removed_at is null and is_primary;

create table riot_account_link_request (
  request_id text primary key,
  operation_id text not null unique references operation_ledger (operation_id),
  discord_user_id text not null,
  platform_id text not null,
  game_name text not null,
  tag_line text not null,
  status text not null check (
    status in ('pending_admin_approval', 'approved', 'rejected', 'cancelled')
  ),
  version bigint not null default 0 check (version >= 0),
  requested_at timestamptz not null,
  decided_at timestamptz,
  decided_by text,
  approved_link_id text references riot_account_link (link_id),
  check (
    (status = 'pending_admin_approval' and decided_at is null and decided_by is null)
    or
    (status <> 'pending_admin_approval' and decided_at is not null and decided_by is not null)
  ),
  check ((status = 'approved') = (approved_link_id is not null))
);

create unique index riot_account_link_request_pending_identity_uq
  on riot_account_link_request (
    discord_user_id,
    lower(platform_id),
    lower(game_name),
    lower(tag_line)
  )
  where status = 'pending_admin_approval';

create table riot_game (
  game_key text primary key,
  platform_id text not null,
  game_id text not null,
  queue_id integer not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  unique (platform_id, game_id),
  check (ended_at is null or ended_at >= started_at)
);

create table game_observation (
  observation_id text primary key,
  game_key text not null references riot_game (game_key),
  discord_user_id text not null,
  source text not null check (source in ('riot_spectator', 'discord_voice')),
  state text not null check (state in ('active', 'inactive', 'unknown')),
  observed_at timestamptz not null,
  evidence_code text not null,
  generation bigint not null check (generation >= 0),
  unique (game_key, discord_user_id, source, generation)
);

create table game_incident (
  incident_id text primary key,
  game_key text not null references riot_game (game_key),
  discord_user_id text not null,
  status text not null check (status in ('open', 'confirmed', 'corrected', 'cancelled')),
  comparison_state text not null check (
    comparison_state in ('compliant', 'grace', 'interrupted', 'violation', 'unknown')
  ),
  policy_version bigint not null check (policy_version > 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (game_key, discord_user_id)
);

create table game_incident_revision (
  revision_id text primary key,
  incident_id text not null references game_incident (incident_id),
  operation_id text not null references operation_ledger (operation_id),
  actor_id text not null,
  action text not null check (action in ('correct', 'cancel')),
  previous_status text not null,
  next_status text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  occurred_at timestamptz not null,
  unique (incident_id, operation_id)
);

alter table riot_account_link enable row level security;
alter table riot_account_link_request enable row level security;
alter table riot_game enable row level security;
alter table game_observation enable row level security;
alter table game_incident enable row level security;
alter table game_incident_revision enable row level security;

create policy riot_account_link_web_policy on riot_account_link
  for select to waw_web using (true);
create policy riot_account_link_bot_policy on riot_account_link
  for all to waw_bot using (true) with check (true);
create policy riot_account_link_request_web_policy on riot_account_link_request
  for select to waw_web using (true);
create policy riot_account_link_request_bot_policy on riot_account_link_request
  for all to waw_bot using (true) with check (true);
create policy riot_game_web_policy on riot_game
  for select to waw_web using (true);
create policy riot_game_bot_policy on riot_game
  for all to waw_bot using (true) with check (true);
create policy game_observation_web_policy on game_observation
  for select to waw_web using (true);
create policy game_observation_bot_policy on game_observation
  for all to waw_bot using (true) with check (true);
create policy game_incident_web_policy on game_incident
  for select to waw_web using (true);
create policy game_incident_bot_policy on game_incident
  for all to waw_bot using (true) with check (true);
create policy game_incident_revision_web_policy on game_incident_revision
  for select to waw_web using (true);
create policy game_incident_revision_bot_policy on game_incident_revision
  for all to waw_bot using (true) with check (true);
create policy operation_ledger_bot_command_policy on operation_ledger
  for insert to waw_bot with check (true);
create policy audit_event_bot_command_policy on audit_event
  for insert to waw_bot with check (true);

revoke all on riot_account_link, riot_account_link_request, riot_game, game_observation, game_incident,
  game_incident_revision from public;
grant select on riot_account_link, riot_account_link_request, riot_game, game_observation, game_incident,
  game_incident_revision to waw_web;
grant select, insert, update on riot_account_link, riot_account_link_request, riot_game, game_observation,
  game_incident, game_incident_revision to waw_bot;
grant insert on operation_ledger, audit_event to waw_bot;

insert into app_schema_version (version) values (5);
