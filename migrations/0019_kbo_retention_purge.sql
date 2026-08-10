create table kbo_retention_hold (
  account_id text primary key references credit_account (account_id),
  reason_code text not null check (reason_code in ('legal_obligation', 'active_dispute')),
  held_at timestamptz not null,
  held_by text not null check (char_length(held_by) between 1 and 128)
);

alter table kbo_retention_hold enable row level security;
revoke all on kbo_retention_hold from public, waw_web, waw_bot;

create function purge_expired_kbo_accounts(observed_at timestamptz, batch_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target record;
  operation_ids text[];
  purged integer := 0;
begin
  if observed_at is null or batch_limit < 1 or batch_limit > 100 then
    raise exception 'invalid KBO retention purge input';
  end if;

  for target in
    select enrollment.account_id
      from public.betting_enrollment enrollment
      join public.credit_account account on account.account_id = enrollment.account_id
     where enrollment.status = 'departed'
       and not exists (
         select 1 from public.kbo_retention_hold hold
          where hold.account_id = enrollment.account_id
       )
       and not exists (
         select 1 from public.kbo_bet bet
          where bet.account_id = enrollment.account_id and bet.status = 'pending'
       )
       and greatest(
         enrollment.departed_at,
         coalesce((
           select max(ledger.occurred_at)
             from public.credit_ledger_entry ledger
            where ledger.account_id = enrollment.account_id
         ), enrollment.departed_at)
       ) <= observed_at - interval '1 year'
     order by enrollment.departed_at, enrollment.account_id
     for update of enrollment, account skip locked
     limit batch_limit
  loop
    select coalesce(array_agg(distinct operation_id), array[]::text[])
      into operation_ids
      from (
        select operation_id from public.credit_ledger_entry where account_id = target.account_id
        union all
        select operation_id from public.daily_credit_claim where account_id = target.account_id
        union all
        select operation_id from public.kbo_bet where account_id = target.account_id
        union all
        select settlement.operation_id
          from public.bet_settlement settlement
          join public.kbo_bet bet on bet.bet_id = settlement.bet_id
         where bet.account_id = target.account_id
      ) operations;

    delete from public.admin_command_result where operation_id = any(operation_ids);
    delete from public.audit_event where operation_id = any(operation_ids);
    delete from public.bet_settlement settlement
      using public.kbo_bet bet
      where settlement.bet_id = bet.bet_id and bet.account_id = target.account_id;
    delete from public.kbo_bet where account_id = target.account_id;
    delete from public.daily_credit_claim where account_id = target.account_id;
    delete from public.credit_ledger_entry where account_id = target.account_id;
    delete from public.betting_enrollment where account_id = target.account_id;
    delete from public.credit_account where account_id = target.account_id;
    delete from public.operation_ledger where operation_id = any(operation_ids);
    purged := purged + 1;
  end loop;
  return purged;
end
$$;

revoke all on function purge_expired_kbo_accounts(timestamptz, integer) from public;
grant execute on function purge_expired_kbo_accounts(timestamptz, integer) to waw_bot;

insert into app_schema_version (version) values (19);
