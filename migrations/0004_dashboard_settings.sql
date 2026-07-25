create table dashboard_setting (
  singleton boolean primary key default true check (singleton),
  summary_enabled boolean not null default false,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into dashboard_setting (singleton, summary_enabled, version)
values (true, false, 0);

alter table dashboard_setting enable row level security;

create policy dashboard_setting_web_policy on dashboard_setting
  for all to waw_web using (true) with check (true);

revoke all on dashboard_setting from public;
grant select, update on dashboard_setting to waw_web;

insert into app_schema_version (version) values (4);
