create table daily_credit_claim (
  claim_id text primary key,
  account_id text not null references credit_account (account_id),
  claim_date date not null,
  operation_id text not null unique references operation_ledger (operation_id),
  ledger_entry_id bigint not null unique references credit_ledger_entry (entry_id),
  claimed_at timestamptz not null,
  unique (account_id, claim_date)
);

alter table daily_credit_claim enable row level security;

create policy daily_credit_claim_web_read_policy on daily_credit_claim
  for select to waw_web using (true);
create policy daily_credit_claim_bot_read_policy on daily_credit_claim
  for select to waw_bot using (true);
create policy daily_credit_claim_bot_insert_policy on daily_credit_claim
  for insert to waw_bot with check (true);

revoke all on daily_credit_claim from public;
grant select on daily_credit_claim to waw_web;
grant select, insert on daily_credit_claim to waw_bot;

insert into app_schema_version (version) values (14);
