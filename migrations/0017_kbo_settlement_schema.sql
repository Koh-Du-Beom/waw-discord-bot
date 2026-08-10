alter table kbo_bet
  add constraint kbo_bet_id_game_uq unique (bet_id, game_id);

create table bet_settlement (
  settlement_id text primary key check (char_length(settlement_id) between 16 and 128),
  bet_id text not null,
  game_id text not null,
  game_revision bigint not null check (game_revision > 0),
  result text not null check (result in ('lost', 'outcome_hit', 'score_hit', 'void')),
  multiplier smallint not null,
  return_amount bigint not null check (return_amount >= 0),
  applied_delta bigint not null,
  operation_id text not null unique references operation_ledger (operation_id),
  ledger_entry_id bigint unique references credit_ledger_entry (entry_id),
  supersedes_settlement_id text,
  settled_at timestamptz not null,
  unique (settlement_id, bet_id),
  unique (bet_id, game_revision),
  foreign key (bet_id, game_id) references kbo_bet (bet_id, game_id),
  foreign key (game_id, game_revision)
    references kbo_game_revision (game_id, source_revision),
  foreign key (supersedes_settlement_id, bet_id)
    references bet_settlement (settlement_id, bet_id),
  check (
    (result = 'lost' and multiplier = 0 and return_amount = 0)
    or (result = 'void' and multiplier = 1 and return_amount > 0)
    or (result = 'outcome_hit' and multiplier = 2 and return_amount > 0)
    or (result = 'score_hit' and multiplier = 3 and return_amount > 0)
  ),
  check ((applied_delta = 0) = (ledger_entry_id is null)),
  check (supersedes_settlement_id is not null or applied_delta = return_amount),
  check (supersedes_settlement_id is null or supersedes_settlement_id <> settlement_id)
);

alter table kbo_bet
  add column current_settlement_id text,
  add constraint kbo_bet_current_settlement_fk
    foreign key (current_settlement_id, bet_id)
    references bet_settlement (settlement_id, bet_id)
    deferrable initially deferred,
  add constraint kbo_bet_status_settlement_check check (
    (status = 'pending' and current_settlement_id is null)
    or (status in ('settled', 'void') and current_settlement_id is not null)
  );

alter table bet_settlement enable row level security;

create policy bet_settlement_web_read_policy on bet_settlement
  for select to waw_web using (true);
create policy bet_settlement_bot_read_policy on bet_settlement
  for select to waw_bot using (true);
create policy bet_settlement_bot_insert_policy on bet_settlement
  for insert to waw_bot with check (true);
create policy kbo_bet_bot_settlement_update_policy on kbo_bet
  for update to waw_bot using (true) with check (status in ('settled', 'void'));

revoke all on bet_settlement from public;
grant select on bet_settlement to waw_web;
grant select, insert on bet_settlement to waw_bot;
grant update (status, current_settlement_id) on kbo_bet to waw_bot;

insert into app_schema_version (version) values (17);
