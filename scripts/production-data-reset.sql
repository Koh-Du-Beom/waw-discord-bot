\set ON_ERROR_STOP on

begin;

do $$
begin
  if current_setting('waw.data_reset_approval', true)
       is distinct from 'waw-production-data-reset-v1' then
    raise exception 'production_data_reset_not_approved';
  end if;
  if (select array_agg(version order by version) from app_schema_version)
       is distinct from array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17] then
    raise exception 'production_data_reset_schema_mismatch';
  end if;
end
$$;

truncate table
  kbo_retention_hold,
  bet_settlement,
  kbo_bet,
  kbo_game_revision,
  kbo_game,
  daily_credit_claim,
  credit_ledger_entry,
  betting_enrollment,
  credit_account,
  game_incident_revision,
  game_incident,
  game_observation,
  riot_game,
  riot_account_link_request,
  riot_account_link,
  admin_command_result,
  summary_quota_reservation,
  registered_discord_user,
  audit_event,
  operation_ledger,
  role_cache,
  oauth_state,
  app_session;

update dashboard_setting
   set summary_enabled = false,
       version = 0,
       updated_at = clock_timestamp()
 where singleton = true;

do $$
begin
  if (select count(*) from dashboard_setting) <> 1
     or not exists (
       select 1 from dashboard_setting
        where singleton = true and summary_enabled = false and version = 0
     ) then
    raise exception 'production_data_reset_setting_postcondition_failed';
  end if;
  if exists (
    select 1 from (
      select 1 from kbo_retention_hold union all
      select 1 from bet_settlement union all
      select 1 from kbo_bet union all
      select 1 from kbo_game_revision union all
      select 1 from kbo_game union all
      select 1 from daily_credit_claim union all
      select 1 from credit_ledger_entry union all
      select 1 from betting_enrollment union all
      select 1 from credit_account union all
      select 1 from game_incident_revision union all
      select 1 from game_incident union all
      select 1 from game_observation union all
      select 1 from riot_game union all
      select 1 from riot_account_link_request union all
      select 1 from riot_account_link union all
      select 1 from admin_command_result union all
      select 1 from summary_quota_reservation union all
      select 1 from registered_discord_user union all
      select 1 from audit_event union all
      select 1 from operation_ledger union all
      select 1 from role_cache union all
      select 1 from oauth_state union all
      select 1 from app_session
    ) remaining
  ) then
    raise exception 'production_data_reset_rows_remain';
  end if;
end
$$;

commit;
