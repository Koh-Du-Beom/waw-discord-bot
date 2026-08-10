# 구현 계획: KBO 베팅 등록 원자 transaction

- Status: Completed (source/local only)
- Related requirements: `FUN-025`, `OWN-041`, `OWN-044`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0027`, `PLAN-0028`
- Owner: Product owner

## 목표

가입 account와 canonical game을 같은 순서로 잠그고 접수 정책을 transaction
안에서 재검증한 뒤 bet·stake 원장·잔액·감사를 전부 commit하거나 rollback하는
PostgreSQL store를 구현한다.

## 범위

- 신뢰 경계 입력 검증과 멱등 결과 contract
- account → game 고정 lock 순서
- 5분 이내 source/수집 evidence, rights gate와 시작 시각 재검증
- 일일 순원금, debt, 잔액과 기존 pending bet 검사
- operation claim, account 차감, immutable ledger, bet와 audit 원자 commit
- disposable PostgreSQL 동시·중복·rollback 검증

## 범위 제외

- Discord `/베팅` command와 runtime feature activation
- game ingestion/parser, 정산·무효·정정과 랭킹
- Production migration·배포

## 선행 조건

1. Store는 client의 market version·잔액·날짜를 받지 않고 잠근 DB row와 서버
   시각에서 계산한다.
2. 외부 데이터 source 시각과 수집 시각이 모두 5분 이내이고 미래가 아니며
   rights gate가 authorized일 때만 fresh다.
3. account를 먼저, game을 나중에 잠가 후속 settlement와 같은 순서를 사용한다.
4. 새 dependency나 generic transaction framework를 추가하지 않는다.

## 작업

### Task 1: registration store와 PostgreSQL 검증

- 목적: 성공·거부·중복을 고정 결과로 만들고 부분 write를 없앤다.
- 변경 예상 파일: `src/kbo/bet-placement.ts`,
  `src/persistence/postgres-kbo-bet-store.ts`, 대상 test,
  `PROJECT_STATUS.md`, 이 계획
- 테스트: 정상 접수, 잔액·debt·일일한도·기존 bet·stale·시작 경계 거부,
  같은 operation/bet 동시 실행, ledger/audit 실패 전체 rollback
- 완료 기준: 대상 test, 전체 test, typecheck와 diff check 통과
- 위험: 이후 settlement도 account → game 순서를 지키지 않으면 deadlock 위험이 있다.
- 롤백: runtime 연결을 하지 않고 새 store 파일을 제거한다. 성공한 원장은
  application rollback에서도 삭제하지 않는다.

## 검증 계획

- disposable PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

없다. `0016`까지의 local schema만 사용하고 Production에는 연결하지 않는다.

## 문서 갱신

- 구현 결과와 검증 evidence
- `PROJECT_STATUS.md`

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- trust-boundary ID·금액·예측·점수를 DB 연결 전에 검증하고 source/수집 시각이
  모두 미래가 아니며 5분 이내일 때만 fresh로 판정한다.
- account → game 순서로 잠근 뒤 권리·상태·시작 시각·debt·잔액·KST 일일
  순원금·기존 pending bet을 재검증한다.
- operation claim, account 차감, immutable stake ledger, bet과 audit를 한
  transaction에 넣고 같은 operation 동시 요청은 한 결과로 결합했다.
- 대상 PostgreSQL test `22/22`, 전체 test
  `327 pass / 7 기존 환경 skip / 0 fail`, typecheck와 diff check가 통과했다.
- Discord command/runtime, settlement와 Production 변경은 수행하지 않았다.
