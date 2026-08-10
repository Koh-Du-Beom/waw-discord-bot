# 구현 계획: KBO 관리자 크레딧 조정 core

- Status: Completed
- Related requirements: `FUN-030`, `OWN-045`, `DAT-001`~`DAT-005`, `SEC-004`~`SEC-009`
- Related ADRs: `ADR-0017`, `ADR-0029`
- Depends on: `PLAN-0015`, `PLAN-0031`
- Owner: Product owner

## 목표

기존 별도 관리자 IPC에 exact `credit_account_adjust`를 추가하고 현재 관리자 역할을
bot에서 다시 확인한 뒤 account·원장·operation·감사·terminal result를 원자 반영한다.

## 범위

- account ID, expected version, bounded signed delta, allowlisted reason, confirmation 계약
- 자기 계정·stale version·음수 잔액·debt 변경 거부
- 불변 `admin_adjustment` ledger와 account version
- IPC parser/response/application과 PostgreSQL transaction
- application default-off 상태의 source/local 검증

## 범위 제외

- dashboard API·화면과 KBO 관리 조회
- correction debt 관리자 변경, generic ledger write와 batch
- Production migration·배포·기능 활성화

## 선행 조건

1. 조정 절댓값은 1,000,000 크레딧 이하의 0이 아닌 안전한 정수다.
2. 사유는 `support_correction`, `policy_correction`, `incident_recovery`만 허용한다.
3. bot process가 현재 Discord administrator 역할을 재검증한다.
4. 원장·감사 실패는 projection과 terminal result까지 전부 rollback한다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- IPC protocol과 bot application에 exact `credit_account_adjust`를 추가하고 현재
  Discord administrator 역할 재검증 뒤에만 store를 호출합니다.
- account lock 아래 self/stale/음수 잔액을 거부하고 projection, 불변 원장,
  allowlisted 사유, operation, audit와 terminal result를 원자 반영합니다.
- 대상 PostgreSQL test `27/27`, 전체 test
  `346 pass / 7 기존 환경 skip / 0 fail`, typecheck, production build와 diff
  check가 통과했습니다.
- dashboard API/UI와 Production migration·활성화는 수행하지 않았습니다.
