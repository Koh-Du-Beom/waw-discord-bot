create table kbo_bet (
  bet_id text primary key check (char_length(bet_id) between 16 and 128),
  guild_id text not null check (guild_id ~ '^[1-9][0-9]{16,19}$'),
  account_id text not null references credit_account (account_id)
    check (char_length(account_id) between 16 and 128),
  game_id text not null check (char_length(game_id) between 8 and 128),
  market_version bigint not null check (market_version > 0),
  prediction text not null check (prediction in ('home_win', 'draw', 'away_win')),
  predicted_home_score smallint check (predicted_home_score >= 0),
  predicted_away_score smallint check (predicted_away_score >= 0),
  stake bigint not null check (stake between 1000 and 50000 and stake % 1000 = 0),
  stake_date date not null,
  status text not null default 'pending' check (status in ('pending', 'settled', 'void')),
  operation_id text not null unique references operation_ledger (operation_id),
  ledger_entry_id bigint not null unique references credit_ledger_entry (entry_id),
  placed_at timestamptz not null,
  unique (guild_id, account_id, game_id, market_version),
  check ((predicted_home_score is null) = (predicted_away_score is null))
);

create unique index kbo_bet_pending_account_game_uq
  on kbo_bet (guild_id, account_id, game_id)
  where status = 'pending';

alter table kbo_bet enable row level security;

create policy kbo_bet_web_read_policy on kbo_bet
  for select to waw_web using (true);
create policy kbo_bet_bot_read_policy on kbo_bet
  for select to waw_bot using (true);
create policy kbo_bet_bot_insert_policy on kbo_bet
  for insert to waw_bot with check (status = 'pending');

revoke all on kbo_bet from public;
grant select on kbo_bet to waw_web;
grant select, insert on kbo_bet to waw_bot;

insert into app_schema_version (version) values (15);
