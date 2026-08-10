# 구현 계획: KBO 불변 정산 schema

- Status: Completed
- Related requirements: `FUN-026`, `OWN-045`, `OWN-048`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0028`, `PLAN-0029`
- Owner: Product owner

## 목표

베팅별 game revision 정산과 공식 정정을 덮어쓰지 않고 보존하며, 현재 canonical
정산만 `kbo_bet`이 가리키는 additive PostgreSQL schema를 만든다.

## 범위

- 결과 분류, multiplier, 반환액과 실제 적용 차액을 가진 불변 settlement
- 같은 bet·revision, operation과 ledger 중복 방지
- 같은 bet의 이전 settlement만 참조하는 correction chain
- `kbo_bet`의 pending/terminal 상태와 current settlement projection
- web/bot 최소 RLS·column 권한과 disposable PostgreSQL 검증

## 범위 제외

- 반환액 계산, account·ledger 갱신 transaction과 settlement worker
- 최근 베팅·랭킹·관리자 UI
- Production migration·배포·기능 활성화

## 선행 조건

1. 기존 settlement와 원장은 UPDATE/DELETE하지 않는다.
2. 반환액 0 또는 차액 0은 ledger 없이도 settlement와 audit 대상이다.
3. bot은 `kbo_bet`의 status와 current settlement pointer만 변경할 수 있다.
4. 새 dependency나 범용 event framework를 추가하지 않는다.

## 작업

### Task 1: additive schema와 권한 검증

- 변경 예상 파일: `migrations/0017_kbo_settlement_schema.sql`, migration runner,
  PostgreSQL integration test, `PROJECT_STATUS.md`, 이 계획
- 테스트: 결과·multiplier 불변식, correction chain, bet/revision/operation/ledger
  중복과 FK, current pointer, RLS와 column 권한
- 완료 기준: 대상 PostgreSQL test, 전체 test, typecheck와 diff check 통과
- 롤백: runtime을 연결하지 않고 additive schema를 보존한다.

## 배포 및 마이그레이션

Source/local migration까지만 수행한다. Production 적용은 별도 preflight 이후
실행한다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- additive `0017`에 revision별 불변 settlement, 같은 bet의 correction chain과
  현재 canonical settlement pointer를 추가했습니다.
- bot은 settlement SELECT·INSERT와 `kbo_bet.status/current_settlement_id` UPDATE만,
  web은 settlement SELECT만 가능하며 application UPDATE·DELETE는 금지했습니다.
- PostgreSQL 대상 test `23/23`, 전체 test
  `333 pass / 7 기존 환경 skip / 0 fail`, typecheck, production build와 diff
  check가 통과했습니다.
- 정산 transaction/worker와 Production migration·배포는 수행하지 않았습니다.
