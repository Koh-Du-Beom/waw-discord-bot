# 구현 계획: KBO 정산·무효·정정 transaction

- Status: Completed
- Related requirements: `FUN-026`, `OWN-045`, `OWN-048`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0031`
- Owner: Product owner

## 목표

현재 canonical game revision으로 pending/terminal bet을 멱등 정산하고 account,
원장, settlement, bet projection과 감사를 한 PostgreSQL transaction으로 묶는다.

## 범위

- final 0/2/3배와 cancelled/no_game/postponed 1배 void
- 최초 당첨·양수 정정의 correction debt 우선 상계
- void 원금의 debt 비상계와 음수 정정의 잔액 회수·부채 생성
- account → game → bet 고정 lock과 current/newer revision 재검증
- 같은 operation/revision 동시 요청, audit 실패 rollback 검증

## 범위 제외

- 외부 parser·ingestion과 주기 settlement worker 활성화
- 최근 베팅·랭킹·관리자 UI
- Production migration·배포·기능 활성화

## 선행 조건

1. suspended/final_pending/비terminal 상태는 정산하지 않는다.
2. 서버 탈퇴 후에도 opaque account의 열린 bet은 terminal까지 정산한다.
3. 공식 정정은 현재 settlement보다 큰 current game revision에만 적용한다.
4. 새 dependency나 범용 transaction framework를 추가하지 않는다.

## 작업

### Task 1: settlement store와 PostgreSQL 검증

- 변경 예상 파일: KBO settlement 계산/contract, PostgreSQL store와 integration
  test, `PROJECT_STATUS.md`, 이 계획
- 테스트: loss/result/score/void, debt 상계·비상계, 음수 정정 debt, 양수 정정,
  같은 operation/revision 동시성, stale revision, audit rollback
- 완료 기준: 대상 test, 전체 test, typecheck, build와 diff check 통과
- 롤백: worker/runtime을 연결하지 않고 store를 사용하지 않는다. 성공 원장은
  application rollback에서도 삭제하지 않는다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- account → game → bet 순서로 잠그고 current/newer revision과 terminal 상태를
  transaction 안에서 다시 검증합니다.
- 기존 0/2/3배 계산을 재사용하고 void 1배, debt 우선 상계, 음수 정정 회수·부채,
  양수 정정 상계를 불변 settlement/ledger와 canonical bet pointer에 반영합니다.
- 대상 test `26/26`, 전체 test `336 pass / 7 기존 환경 skip / 0 fail`,
  typecheck, production build와 diff check가 통과했습니다.
- parser·worker/runtime과 Production migration·배포는 수행하지 않았습니다.
