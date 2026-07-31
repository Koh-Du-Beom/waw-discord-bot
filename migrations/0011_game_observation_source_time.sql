alter table game_observation
  add column source_observed_at timestamptz;

alter table game_observation
  add constraint game_observation_source_time_scope
  check (
    source_observed_at is null
    or source = 'discord_voice'
  );

insert into app_schema_version (version) values (11);
