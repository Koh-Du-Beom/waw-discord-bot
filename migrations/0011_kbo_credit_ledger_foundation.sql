create table credit_account (
  account_id text primary key,
  available_balance bigint not null default 0 check (available_balance >= 0),
  correction_debt bigint not null default 0 check (correction_debt >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at)
);

create table betting_enrollment (
  enrollment_id text primary key,
  account_id text not null unique references credit_account (account_id),
  guild_id text not null,
  discord_user_id text,
  status text not null check (status in ('active', 'departed')),
  policy_version bigint not null check (policy_version > 0),
  enrolled_at timestamptz not null,
  departed_at timestamptz,
  foreign key (guild_id, discord_user_id)
    references registered_discord_user (guild_id, discord_user_id),
  check (
    (status = 'active' and discord_user_id is not null and departed_at is null)
    or
    (status = 'departed' and discord_user_id is null and departed_at is not null)
  ),
  check (departed_at is null or departed_at >= enrolled_at)
);

create unique index betting_enrollment_active_user_uq
  on betting_enrollment (guild_id, discord_user_id)
  where status = 'active';

create table credit_ledger_entry (
  entry_id bigint generated always as identity primary key,
  account_id text not null references credit_account (account_id),
  reason_code text not null check (
    reason_code in (
      'daily_claim',
      'bet_stake',
      'bet_payout',
      'bet_void_refund',
      'settlement_correction',
      'admin_adjustment'
    )
  ),
  available_delta bigint not null,
  debt_delta bigint not null,
  available_before bigint not null check (available_before >= 0),
  available_after bigint not null check (available_after >= 0),
  debt_before bigint not null check (debt_before >= 0),
  debt_after bigint not null check (debt_after >= 0),
  operation_id text not null references operation_ledger (operation_id),
  source_type text not null check (char_length(source_type) between 1 and 50),
  source_id text not null check (char_length(source_id) between 1 and 200),
  actor_type text not null check (actor_type in ('system', 'administrator')),
  actor_id text,
  occurred_at timestamptz not null,
  unique (account_id, operation_id, reason_code),
  unique (account_id, reason_code, source_type, source_id),
  check (available_after = available_before + available_delta),
  check (debt_after = debt_before + debt_delta),
  check (
    (actor_type = 'system' and actor_id is null)
    or
    (actor_type = 'administrator' and actor_id is not null)
  )
);

alter table credit_account enable row level security;
alter table betting_enrollment enable row level security;
alter table credit_ledger_entry enable row level security;

create policy credit_account_web_read_policy on credit_account
  for select to waw_web using (true);
create policy credit_account_bot_read_policy on credit_account
  for select to waw_bot using (true);
create policy credit_account_bot_insert_policy on credit_account
  for insert to waw_bot with check (
    available_balance = 0 and correction_debt = 0 and version = 0
  );
create policy credit_account_bot_update_policy on credit_account
  for update to waw_bot using (true) with check (true);

create policy betting_enrollment_web_read_policy on betting_enrollment
  for select to waw_web using (true);
create policy betting_enrollment_bot_read_policy on betting_enrollment
  for select to waw_bot using (true);
create policy betting_enrollment_bot_insert_policy on betting_enrollment
  for insert to waw_bot with check (true);
create policy betting_enrollment_bot_update_policy on betting_enrollment
  for update to waw_bot using (true) with check (true);

create policy credit_ledger_entry_web_read_policy on credit_ledger_entry
  for select to waw_web using (true);
create policy credit_ledger_entry_bot_read_policy on credit_ledger_entry
  for select to waw_bot using (true);
create policy credit_ledger_entry_bot_insert_policy on credit_ledger_entry
  for insert to waw_bot with check (true);

revoke all on credit_account, betting_enrollment, credit_ledger_entry from public;
revoke all on sequence credit_ledger_entry_entry_id_seq from public;
grant select on credit_account, betting_enrollment, credit_ledger_entry to waw_web;
grant select, insert, update on credit_account, betting_enrollment to waw_bot;
grant select, insert on credit_ledger_entry to waw_bot;
grant usage on sequence credit_ledger_entry_entry_id_seq to waw_bot;

insert into app_schema_version (version) values (11);
