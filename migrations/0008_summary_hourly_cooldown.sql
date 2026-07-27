alter table summary_quota_reservation
  drop constraint summary_quota_reservation_guild_id_discord_user_id_quota_d_fkey,
  drop column quota_date;

alter table summary_quota_reservation
  drop constraint summary_quota_reservation_decision_check;

update summary_quota_reservation
set decision = 'cooldown'
where decision in ('disabled', 'exhausted');

alter table summary_quota_reservation
  add constraint summary_quota_reservation_decision_check
    check (decision in ('reserved', 'cooldown'));

drop table summary_quota_counter;
drop table summary_quota_override;

alter table dashboard_setting
  drop column summary_daily_limit;

insert into app_schema_version (version) values (8);
