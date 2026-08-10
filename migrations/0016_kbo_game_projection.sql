create table kbo_game (
  game_id text primary key check (char_length(game_id) between 8 and 128),
  source_application_id text not null check (source_application_id = '1390247647293603881'),
  source_game_id text not null check (char_length(source_game_id) between 8 and 128),
  competition_id text not null check (char_length(competition_id) between 1 and 128),
  season_id text not null check (char_length(season_id) between 1 and 128),
  home_team_id text not null check (home_team_id ~ '^[A-Z0-9_]{2,32}$'),
  away_team_id text not null check (away_team_id ~ '^[A-Z0-9_]{2,32}$'),
  scheduled_start_at timestamptz not null,
  status text not null check (
    status in (
      'scheduled', 'postponed', 'cancelled', 'no_game', 'suspended',
      'in_progress', 'final_pending', 'final', 'unknown'
    )
  ),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  current_revision bigint not null check (current_revision > 0),
  market_version bigint not null check (market_version > 0),
  source_updated_at timestamptz not null,
  collected_at timestamptz not null,
  parser_version integer not null check (parser_version > 0),
  unique (source_application_id, source_game_id),
  check (home_team_id <> away_team_id),
  check (collected_at >= source_updated_at),
  check ((home_score is null) = (away_score is null)),
  check (status not in ('final_pending', 'final') or home_score is not null),
  check (status not in ('scheduled', 'postponed', 'cancelled', 'no_game') or home_score is null)
);

create table kbo_game_revision (
  revision_id bigint generated always as identity primary key,
  game_id text not null references kbo_game (game_id),
  source_revision bigint not null check (source_revision > 0),
  source_message_id text not null check (source_message_id ~ '^[1-9][0-9]{16,19}$'),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  scheduled_start_at timestamptz not null,
  status text not null check (
    status in (
      'scheduled', 'postponed', 'cancelled', 'no_game', 'suspended',
      'in_progress', 'final_pending', 'final', 'unknown'
    )
  ),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  source_updated_at timestamptz not null,
  collected_at timestamptz not null,
  parser_version integer not null check (parser_version > 0),
  unique (game_id, source_revision),
  unique (game_id, content_fingerprint),
  unique (source_message_id, content_fingerprint),
  check (collected_at >= source_updated_at),
  check ((home_score is null) = (away_score is null)),
  check (status not in ('final_pending', 'final') or home_score is not null),
  check (status not in ('scheduled', 'postponed', 'cancelled', 'no_game') or home_score is null)
);

alter table kbo_game
  add constraint kbo_game_current_revision_fk
  foreign key (game_id, current_revision)
  references kbo_game_revision (game_id, source_revision)
  deferrable initially deferred;

alter table kbo_bet
  add constraint kbo_bet_game_fk foreign key (game_id) references kbo_game (game_id);

alter table kbo_game enable row level security;
alter table kbo_game_revision enable row level security;

create policy kbo_game_web_read_policy on kbo_game
  for select to waw_web using (true);
create policy kbo_game_bot_read_policy on kbo_game
  for select to waw_bot using (true);
create policy kbo_game_bot_insert_policy on kbo_game
  for insert to waw_bot with check (true);
create policy kbo_game_bot_update_policy on kbo_game
  for update to waw_bot using (true) with check (true);

create policy kbo_game_revision_bot_read_policy on kbo_game_revision
  for select to waw_bot using (true);
create policy kbo_game_revision_bot_insert_policy on kbo_game_revision
  for insert to waw_bot with check (true);

revoke all on kbo_game, kbo_game_revision from public;
revoke all on sequence kbo_game_revision_revision_id_seq from public;
grant select on kbo_game to waw_web;
grant select, insert, update on kbo_game to waw_bot;
grant select, insert on kbo_game_revision to waw_bot;
grant usage on sequence kbo_game_revision_revision_id_seq to waw_bot;

insert into app_schema_version (version) values (16);
