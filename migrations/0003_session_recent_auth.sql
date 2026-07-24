alter table app_session
  add column last_oauth_completed_at timestamptz;

update app_session
   set last_oauth_completed_at = created_at
 where last_oauth_completed_at is null;

alter table app_session
  alter column last_oauth_completed_at set not null,
  add check (last_oauth_completed_at <= last_seen_at);

insert into app_schema_version (version) values (3);
