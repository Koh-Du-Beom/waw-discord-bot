\set ON_ERROR_STOP on

insert into app_session (
  session_id_hash, actor_id, authorization_tier, created_at, last_seen_at,
  idle_expires_at, absolute_expires_at, revoked_at, last_oauth_completed_at
) values (
  'fixture-session', 'fixture-member', 'administrator', now(), now(),
  now() + interval '1 hour', now() + interval '2 hours', null, now()
);
insert into oauth_state values ('fixture-state', now() + interval '1 hour', null);
insert into role_cache values ('fixture-member', 'administrator', now());
insert into operation_ledger values (
  'fixture-operation', 'fixture-member', now(), 'accepted', 'accepted'
);
insert into audit_event (
  event_id, occurred_at, event_type, actor_id, outcome, reason_code,
  correlation_id, operation_id, guild_id, channel_id, command_name
) values (
  'fixture-event', now(), 'discord.command', 'fixture-member', 'success',
  'completed', 'fixture-correlation', 'fixture-operation', 'fixture-guild',
  'fixture-channel', '도움말'
);
insert into riot_account_link (
  link_id, discord_user_id, puuid, platform_id, game_name, tag_line,
  verification_method, is_primary, approved_by, created_at
) values (
  'fixture-link', 'fixture-member', 'fixture-puuid', 'KR', 'Fixture', 'KR1',
  'admin_approved_unverified', true, 'fixture-admin', now()
);
insert into riot_account_link_request (
  request_id, operation_id, discord_user_id, platform_id, game_name, tag_line,
  status, version, requested_at, decided_at, decided_by, approved_link_id
) values (
  'fixture-request', 'fixture-operation', 'fixture-member', 'KR', 'Fixture',
  'KR1', 'approved', 1, now(), now(), 'fixture-admin', 'fixture-link'
);
insert into riot_game values (
  'fixture-game', 'KR', 'fixture-game-id', 420, now(), null
);
insert into game_observation values (
  'fixture-observation', 'fixture-game', 'fixture-member', 'riot_spectator',
  'active', now(), 'fixture', 1
);
insert into game_incident values (
  'fixture-incident', 'fixture-game', 'fixture-member', 'open', 'violation',
  1, 0, now(), now()
);
insert into game_incident_revision values (
  'fixture-revision', 'fixture-incident', 'fixture-operation', 'fixture-admin',
  'correct', 'open', 'corrected', 'fixture reason', now()
);
insert into admin_command_result values (
  'fixture-operation', 'riot_link_request_approve', 'success', 'completed', now()
);
insert into registered_discord_user values (
  'fixture-guild', 'fixture-member', 'Fixture Member', now(), now()
);
insert into summary_quota_reservation values (
  'fixture-operation', 'fixture-guild', 'fixture-member', 'reserved', now()
);
update dashboard_setting
   set summary_enabled = true, version = 9, updated_at = now()
 where singleton = true;
