alter table dashboard_setting
  add column summary_daily_limit integer not null default 10
    check (summary_daily_limit between 1 and 100);

create table registered_discord_user (
  guild_id text not null,
  discord_user_id text not null,
  display_label text not null check (char_length(display_label) between 1 and 80),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (guild_id, discord_user_id)
);

create table summary_quota_override (
  guild_id text not null,
  discord_user_id text not null,
  enabled boolean not null default true,
  daily_limit integer check (daily_limit between 1 and 100),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null,
  primary key (guild_id, discord_user_id),
  foreign key (guild_id, discord_user_id)
    references registered_discord_user (guild_id, discord_user_id)
);

create table summary_quota_counter (
  guild_id text not null,
  discord_user_id text not null,
  quota_date date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null,
  primary key (guild_id, discord_user_id, quota_date),
  foreign key (guild_id, discord_user_id)
    references registered_discord_user (guild_id, discord_user_id)
);

create table summary_quota_reservation (
  operation_id text primary key references operation_ledger (operation_id),
  guild_id text not null,
  discord_user_id text not null,
  quota_date date not null,
  decision text not null check (decision in ('reserved', 'disabled', 'exhausted')),
  occurred_at timestamptz not null,
  foreign key (guild_id, discord_user_id, quota_date)
    references summary_quota_counter (guild_id, discord_user_id, quota_date)
);

create index audit_event_command_log_idx
  on audit_event (occurred_at desc, event_id desc)
  where event_type = 'discord.command';

alter table registered_discord_user enable row level security;
alter table summary_quota_override enable row level security;
alter table summary_quota_counter enable row level security;
alter table summary_quota_reservation enable row level security;

create policy registered_discord_user_bot_policy on registered_discord_user
  for all to waw_bot using (true) with check (true);
create policy registered_discord_user_web_policy on registered_discord_user
  for select to waw_web using (true);
create policy summary_quota_override_bot_read_policy on summary_quota_override
  for select to waw_bot using (true);
create policy summary_quota_override_web_policy on summary_quota_override
  for all to waw_web using (true) with check (true);
create policy summary_quota_counter_bot_policy on summary_quota_counter
  for all to waw_bot using (true) with check (true);
create policy summary_quota_counter_web_read_policy on summary_quota_counter
  for select to waw_web using (true);
create policy summary_quota_reservation_bot_policy on summary_quota_reservation
  for all to waw_bot using (true) with check (true);
create policy dashboard_setting_bot_quota_policy on dashboard_setting
  for select to waw_bot using (true);

revoke all on registered_discord_user, summary_quota_override,
  summary_quota_counter, summary_quota_reservation from public;
grant select, insert, update on registered_discord_user to waw_bot;
grant select on registered_discord_user to waw_web;
grant select on summary_quota_override to waw_bot;
grant select, insert, update, delete on summary_quota_override to waw_web;
grant select, insert, update on summary_quota_counter to waw_bot;
grant select on summary_quota_counter to waw_web;
grant select, insert on summary_quota_reservation to waw_bot;
grant select on dashboard_setting to waw_bot;

insert into app_schema_version (version) values (7);
