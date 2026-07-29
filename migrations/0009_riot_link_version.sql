alter table riot_account_link
  add column version bigint not null default 0
  check (version >= 0);

insert into app_schema_version (version) values (9);
