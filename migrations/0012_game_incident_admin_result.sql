alter table admin_command_result
  drop constraint admin_command_result_command_name_check,
  add constraint admin_command_result_command_name_check check (
    command_name in (
      'riot_link_request_list',
      'riot_link_request_approve',
      'riot_link_request_reject',
      'riot_link_remove',
      'game_incident_correct',
      'game_incident_cancel',
      'operation_status'
    )
  ),
  drop constraint admin_command_result_reason_code_check,
  add constraint admin_command_result_reason_code_check check (
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
      'riot_link_not_found',
      'riot_link_stale',
      'riot_active_puuid_conflict',
      'game_incident_not_found',
      'game_incident_stale',
      'invalid_puuid',
      'platform_mismatch',
      'validator_unavailable',
      'persistence_unavailable'
    )
  );

insert into app_schema_version (version) values (12);
