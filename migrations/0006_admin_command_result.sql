create table admin_command_result (
  operation_id text primary key references operation_ledger (operation_id),
  command_name text not null check (
    command_name in (
      'riot_link_request_list',
      'riot_link_request_approve',
      'riot_link_request_reject',
      'operation_status'
    )
  ),
  outcome text not null check (
    outcome in ('success', 'denied', 'conflict', 'failure')
  ),
  reason_code text not null check (
    reason_code in (
      'completed',
      'administrator_required',
      'request_expired',
      'request_malformed',
      'request_unavailable',
      'operation_duplicate',
      'operation_unknown',
      'riot_link_request_stale',
      'riot_link_request_unavailable',
      'riot_active_puuid_conflict',
      'invalid_puuid',
      'platform_mismatch',
      'validator_unavailable',
      'persistence_unavailable'
    )
  ),
  completed_at timestamptz not null
);

alter table admin_command_result enable row level security;

create policy admin_command_result_bot_policy on admin_command_result
  for all to waw_bot using (true) with check (true);

revoke all on admin_command_result from public;
grant select, insert on admin_command_result to waw_bot;

insert into app_schema_version (version) values (6);
