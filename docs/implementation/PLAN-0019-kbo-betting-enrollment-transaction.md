# 구현 계획: KBO 명시적 가입과 0잔액 계정 transaction

- Status: Completed (local/disposable only)
- Related requirements: `FUN-023`
- Related ADRs: `ADR-0029`
- Depends on: `PLAN-0018` local migration `0013`
- Owner: Product owner

## 목표

이미 등록된 Discord 사용자의 명시적 KBO 베팅 가입과 opaque 0잔액 계정 생성을
하나의 멱등 PostgreSQL transaction으로 처리한다.

## 현재 구현 상태

- Migration `0013`은 `betting_enrollment`, `credit_account`와 불변 원장 schema를
  local/disposable 범위에 추가했지만 application persistence는 없다.
- 기존 `PostgresRiotCommandStore`와 `PostgresSummaryQuotaStore`는
  `operation_ledger` claim, row lock, mutation과 audit을 한 transaction으로
  묶는 패턴을 제공한다.
- `betting_enrollment`에는 active guild/user unique index가 있고 account 연결은
  unique다. 신규 Bot account insert는 RLS에서 balance/debt/version `0`만 허용한다.
- 가입 시 잔액 변화가 없으므로 `credit_ledger_entry`는 만들지 않는다.

## 범위

- 최소 KBO enrollment store port와 PostgreSQL 구현
- 입력 operation/enrollment/account/guild/user/policy version/enrolled-at 검증
- 기존 등록 사용자 존재 확인과 `FOR UPDATE` 직렬화
- operation claim, account·active enrollment insert와 최소 audit의 단일 transaction
- 같은 operation 재시도의 `duplicate_operation` 반환
- 서로 다른 operation의 동시 가입에서 account/enrollment 하나만 생성
- 실제 disposable PostgreSQL 통합 테스트

## 범위 제외

- Discord slash command, 동의 문구·UI와 command 등록
- 기존 `registered_discord_user` 자동 생성 또는 자동 가입
- 일일 50,000 지급과 원장 entry
- 조회 DTO, 탈퇴·재가입·직접 연결 제거와 보존 purge
- betting, settlement, provider와 Gateway
- schema·migration 추가, production 적용과 feature activation

## 선행 조건과 고정 경계

1. 가입 store는 기존 `(guild_id, discord_user_id)` 등록 row가 없으면
   `not_registered`로 종료하며 row를 만들지 않는다.
2. 서버가 생성한 opaque `accountId`와 `enrollmentId`, Discord interaction 기반
   stable `operationId`를 입력받는다. raw ID와 동의 입력은 log에 남기지 않는다.
3. `operation_ledger` claim 뒤 등록 사용자 row를 `FOR UPDATE`로 잠근다. 같은
   사용자의 서로 다른 operation은 이 lock에서 직렬화한다.
4. active enrollment가 없을 때만 account와 enrollment를 insert한다. 둘 중 하나,
   operation 또는 audit이 실패하면 전부 rollback한다.
5. 가입은 balance 변화가 아니므로 zero-value ledger entry를 만들지 않는다.
6. 현재 bot workload는 `operation_ledger` SELECT 권한이 없으므로 같은 operation
   재시도는 `duplicate_operation`을 반환하고 mutation·audit을 반복하지 않는다.
   최초 terminal 결과 재조회는 권한이나 별도 result table이 승인될 때만 추가한다.
7. 다른 operation으로 이미 가입한 사용자는 기존 opaque account ID를 반환하지
   않고 `already_enrolled`만 반환한다.

## 작업

### Task 1: 가입 transaction store와 PostgreSQL 통합 테스트

- 목적: 사용자-facing command 없이 가입 persistence의 원자성·멱등성만 고정한다.
- 변경 예상 파일: `src/kbo/betting-enrollment.ts`,
  `src/persistence/postgres-kbo-enrollment-store.ts`, 관련 unit/PostgreSQL integration
  test, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - 등록 사용자 최초 가입은 account/enrollment/operation/audit 각 1건, 잔액·debt·
    version `0`, credit ledger `0건`
  - 동일 operation 순차·동시 재시도는 `duplicate_operation`이며 row를 늘리지 않음
  - 서로 다른 operation의 동시 가입은 정확히 하나만 `created`, 나머지는
    `already_enrolled`, account/enrollment 하나
  - 미등록 사용자는 `not_registered`이고 account/enrollment 없음
  - 기존 가입은 새 account ID를 저장하거나 노출하지 않음
  - account, enrollment 또는 audit 강제 실패 시 operation 포함 전부 rollback
  - malformed/oversized ID, 잘못된 시각·policy version은 DB 호출 전 거부하고
    오류에 입력값을 반사하지 않음
- 완료 기준: disposable PostgreSQL에서 transaction·중복·동시성·rollback과
  zero-opening 불변조건이 재현되고 전체 test/typecheck가 통과한다.
- 위험: bot workload의 operation row 조회 권한이 없어 중복 호출은 최초 terminal
  결과 대신 `duplicate_operation`으로만 식별됨
- 롤백: 새 store/runtime 미연결 파일만 제거하며 migration과 운영 데이터 영향 없음

## 검증 계획

- 대상 unit/PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Migration과 production 적용은 없다. 이 작업을 구현해도 store는 Discord command나
bot runtime에 연결하지 않는다. `0013`의 Production 적용은 별도 exact owner gate와
backup/restore 증거 전까지 금지한다.

## 문서 갱신

- 이 계획과 `PROJECT_STATUS.md`에 local/disposable 완료 결과를 기록했다.

## 진행 결과

- 가입 입력 검증과 PostgreSQL transaction store를 구현했다.
- 등록 사용자 lock, operation claim, 0잔액 account, active enrollment와 최소 audit을
  한 transaction으로 처리하며 실패 시 operation까지 rollback한다.
- unit test `3/3`, PostgreSQL integration suite `16/16`, 전체 test
  `297 pass / 7 환경 skip / 0 fail`이 통과했다.
- Discord command/runtime 연결, migration 추가와 Production 적용은 수행하지 않았다.

## 승인

- Owner decision: Approved — 중복 operation은 `duplicate_operation`을 반환하는
  최소안으로 Task 1 구현; Discord command와 Production 연결 금지
- Approved date: 2026-08-07
