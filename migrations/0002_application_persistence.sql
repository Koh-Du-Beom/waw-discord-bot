do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'waw_web') then
    create role waw_web nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'waw_bot') then
    create role waw_bot nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;

alter table app_session
  add check (last_seen_at >= created_at),
  add check (idle_expires_at <= absolute_expires_at),
  add check (absolute_expires_at > created_at);

create table oauth_state (
  state_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table role_cache (
  actor_id text primary key,
  authorization_tier text not null check (authorization_tier in ('operator', 'administrator')),
  verified_at timestamptz not null
);

alter table audit_event
  add column operation_id text references operation_ledger (operation_id),
  add check (outcome in ('success', 'failure', 'denied'));

create index audit_event_occurred_at_idx on audit_event (occurred_at);
create index audit_event_correlation_id_idx on audit_event (correlation_id);

alter table oauth_state enable row level security;
alter table role_cache enable row level security;

create policy app_session_web_policy on app_session
  for all to waw_web using (true) with check (true);
create policy oauth_state_web_policy on oauth_state
  for all to waw_web using (true) with check (true);
create policy role_cache_web_policy on role_cache
  for all to waw_web using (true) with check (true);
create policy role_cache_bot_policy on role_cache
  for all to waw_bot using (true) with check (true);
create policy operation_ledger_web_policy on operation_ledger
  for all to waw_web using (true) with check (true);
create policy audit_event_web_policy on audit_event
  for all to waw_web using (true) with check (true);

revoke create on schema public from public;
revoke all on app_schema_version, app_session, oauth_state, role_cache, operation_ledger, audit_event from public;

grant usage on schema public to waw_web, waw_bot;
grant select, insert, update, delete on app_session, oauth_state, role_cache, operation_ledger, audit_event to waw_web;
grant select, insert, update, delete on role_cache to waw_bot;

insert into app_schema_version (version) values (2);
