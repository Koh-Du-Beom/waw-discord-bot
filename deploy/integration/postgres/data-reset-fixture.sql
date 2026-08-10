\set ON_ERROR_STOP on

begin;
set constraints all deferred;

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
insert into operation_ledger values
  ('fixture-kbo-claim-operation', 'fixture-kbo-member', now(), 'accepted', 'completed'),
  ('fixture-kbo-stake-operation', 'fixture-kbo-member', now(), 'accepted', 'completed'),
  ('fixture-kbo-settlement-operation', 'system:kbo-settlement', now(), 'accepted', 'completed');
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
insert into registered_discord_user values (
  '92345678901234567', '82345678901234567', 'KBO Fixture Member', now(), now()
);
insert into credit_account (
  account_id, available_balance, version, created_at, updated_at
) values (
  'fixture-kbo-account', 51000, 3,
  '2026-08-10T00:00:00Z', '2026-08-10T03:00:00Z'
);
insert into betting_enrollment (
  enrollment_id, account_id, guild_id, discord_user_id, status,
  policy_version, enrolled_at
) values (
  'fixture-kbo-enrollment', 'fixture-kbo-account', '92345678901234567',
  '82345678901234567', 'active', 1, '2026-08-10T00:00:00Z'
);
insert into credit_ledger_entry (
  account_id, reason_code, available_delta, debt_delta,
  available_before, available_after, debt_before, debt_after,
  operation_id, source_type, source_id, actor_type, occurred_at
) values
  ('fixture-kbo-account', 'daily_claim', 50000, 0, 0, 50000, 0, 0,
   'fixture-kbo-claim-operation', 'daily_claim', '2026-08-10', 'system',
   '2026-08-10T01:00:00Z'),
  ('fixture-kbo-account', 'bet_stake', -1000, 0, 50000, 49000, 0, 0,
   'fixture-kbo-stake-operation', 'bet', 'fixture-kbo-bet-0001', 'system',
   '2026-08-10T02:00:00Z'),
  ('fixture-kbo-account', 'bet_payout', 2000, 0, 49000, 51000, 0, 0,
   'fixture-kbo-settlement-operation', 'settlement',
   'fixture-kbo-settlement-0001', 'system', '2026-08-10T03:00:00Z');
insert into daily_credit_claim (
  claim_id, account_id, claim_date, operation_id, ledger_entry_id, claimed_at
) values (
  'fixture-kbo-claim', 'fixture-kbo-account', '2026-08-10',
  'fixture-kbo-claim-operation',
  (select entry_id from credit_ledger_entry
    where operation_id = 'fixture-kbo-claim-operation'),
  '2026-08-10T01:00:00Z'
);
insert into kbo_game (
  game_id, source_application_id, source_game_id, competition_id, season_id,
  home_team_id, away_team_id, scheduled_start_at, status, home_score,
  away_score, current_revision, market_version, source_updated_at, collected_at,
  parser_version
) values (
  'fixture-kbo-game', '1390247647293603881', 'fixture-source-game',
  'KBO_REGULAR', '2026', 'DOOSAN', 'LG', '2026-08-10T02:00:00Z', 'final',
  3, 2, 1, 1, '2026-08-10T03:00:00Z', '2026-08-10T03:00:01Z', 1
);
insert into kbo_game_revision (
  game_id, source_revision, source_message_id, content_fingerprint,
  scheduled_start_at, status, home_score, away_score, source_updated_at,
  collected_at, parser_version
) values (
  'fixture-kbo-game', 1, '72345678901234567', repeat('a', 64),
  '2026-08-10T02:00:00Z', 'final', 3, 2,
  '2026-08-10T03:00:00Z', '2026-08-10T03:00:01Z', 1
);
insert into kbo_bet (
  bet_id, guild_id, account_id, game_id, market_version, prediction, stake,
  stake_date, status, operation_id, ledger_entry_id, placed_at
) values (
  'fixture-kbo-bet-0001', '92345678901234567', 'fixture-kbo-account',
  'fixture-kbo-game', 1, 'home_win', 1000, '2026-08-10', 'pending',
  'fixture-kbo-stake-operation',
  (select entry_id from credit_ledger_entry
    where operation_id = 'fixture-kbo-stake-operation'),
  '2026-08-10T01:30:00Z'
);
insert into bet_settlement (
  settlement_id, bet_id, game_id, game_revision, result, multiplier,
  return_amount, applied_delta, operation_id, ledger_entry_id, settled_at
) values (
  'fixture-kbo-settlement-0001', 'fixture-kbo-bet-0001', 'fixture-kbo-game',
  1, 'outcome_hit', 2, 2000, 2000, 'fixture-kbo-settlement-operation',
  (select entry_id from credit_ledger_entry
    where operation_id = 'fixture-kbo-settlement-operation'),
  '2026-08-10T03:00:00Z'
);
update kbo_bet
   set status = 'settled', current_settlement_id = 'fixture-kbo-settlement-0001'
 where bet_id = 'fixture-kbo-bet-0001';
insert into kbo_retention_hold (account_id, reason_code, held_at, held_by)
values ('fixture-kbo-account', 'active_dispute', now(), 'fixture-operator');
insert into summary_quota_reservation values (
  'fixture-operation', 'fixture-guild', 'fixture-member', 'reserved', now()
);
update dashboard_setting
   set summary_enabled = true, version = 9, updated_at = now()
 where singleton = true;

commit;
