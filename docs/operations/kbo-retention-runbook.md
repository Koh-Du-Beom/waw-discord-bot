# KBO 탈퇴 계정 보존·삭제 runbook

## 경계

- 운영 DB의 직접 식별 연결은 Discord 서버 탈퇴 transaction에서 즉시 제거한다.
- Opaque KBO 계정은 탈퇴 시각과 마지막 KBO 원장 시각 중 늦은 때부터 1년 보존한다.
- Pending bet, `legal_obligation` 또는 `active_dispute` hold가 있으면 삭제하지 않는다.
- 암호화 backup은 기존 `backups/` 30일 lifecycle을 변경하지 않는다. 과거 backup을
  복원하면 멤버 reconciliation과 이 runbook을 다시 적용한 뒤 서비스를 연다.

## 읽기 전용 확인

Migration 17 적용 뒤 workload role에는 `purge_expired_kbo_accounts`의 bounded
EXECUTE만 있고 KBO table DELETE나 hold table 권한은 없어야 한다. Bot은 시작 시와
24시간마다 최대 100개를 처리하며 성공 건수나 account ID를 journal에 기록하지 않는다.

후보 수는 migration 권한의 named human operator가 maintenance window에 다음 조건과
동일한 read-only query로 확인한다. 결과의 account ID를 일반 작업 기록에 복사하지 않는다.

```sql
select count(*)
from betting_enrollment enrollment
where enrollment.status = 'departed'
  and not exists (
    select 1 from kbo_retention_hold hold where hold.account_id = enrollment.account_id
  )
  and not exists (
    select 1 from kbo_bet bet
     where bet.account_id = enrollment.account_id and bet.status = 'pending'
  )
  and greatest(
    enrollment.departed_at,
    coalesce((select max(occurred_at) from credit_ledger_entry
              where account_id = enrollment.account_id), enrollment.departed_at)
  ) <= clock_timestamp() - interval '1 year';
```

## Legal/dispute hold

Hold에는 자유 서술을 저장하지 않는다. 정확한 opaque account와 allowlisted 사유를
승인 기록과 대조한 뒤 migration 권한 session에서 transaction으로 추가한다.

```sql
begin;
insert into kbo_retention_hold (account_id, reason_code, held_at, held_by)
values (:'account_id', :'reason_code', clock_timestamp(), :'operator_id');
commit;
```

해제는 법적 의무 또는 분쟁 종료가 별도로 승인된 뒤 정확한 한 row만 삭제한다.

```sql
begin;
delete from kbo_retention_hold where account_id = :'account_id';
commit;
```

## 장애와 복구

- Purge 실패 진단이 발생하면 신규 지급·베팅을 자동으로 열지 말고 DB health와
  migration 17, hold, pending bet을 읽기 전용으로 확인한다.
- 삭제 함수나 table DELETE를 수동 반복하지 않는다. 원인을 수정한 뒤 다음 bounded
  invocation을 사용한다.
- 삭제 완료 데이터는 운영 DB에서 복구하지 않는다. 재가입은 새 명시적 가입과
  0잔액 account만 허용한다.
