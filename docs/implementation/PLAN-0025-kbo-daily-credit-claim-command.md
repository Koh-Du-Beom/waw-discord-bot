# 구현 계획: KBO 일일 크레딧 지급 Discord command

- Status: Completed (source/local only; Discord unregistered)
- Related requirements: `FUN-024`
- Related ADRs: `ADR-0029`
- Depends on: completed `PLAN-0021`, command boundaries from `PLAN-0023`·`PLAN-0024`
- Owner: Product owner

## 목표

활성 KBO 가입 사용자가 `/크레딧 받기`를 직접 실행해 서버 현재 시각 기준 KST
날짜의 50,000 크레딧을 한 번만 받고, correction debt가 있으면 먼저 상계된 결과를
호출자에게만 확인할 수 있는 최소 Discord command 경계를 구현한다.

## 현재 구현 상태

- `PostgresKboDailyCreditClaimStore`는 서버 시각을 `Asia/Seoul` 날짜로 변환하고
  active account lock 아래 operation, projection, 불변 ledger, daily claim과 audit을
  하나의 transaction으로 처리한다.
- 동일 성공 operation은 기존 지급 결과를 반환하고, 같은 계정·KST 날짜의 다른
  operation은 `already_claimed`, 미가입·탈퇴 계정은 `not_enrolled`로 종료한다.
- `/크레딧 내정보`는 option 없는 credit subcommand, ephemeral 응답, 중앙 command
  audit과 local assembly 패턴을 제공한다. `/베팅 가입`으로 명시적 가입도 가능하다.
- `/크레딧 받기` definition, interaction normalization과 claim command 연결은 없다.

## 범위

- option 없는 `/크레딧 받기` slash subcommand와 interaction normalization
- 기존 `KboCreditCommandExecutor`의 exact `크레딧 받기` 분기
- Discord interaction ID를 operation ID로, prefix가 있는 서버 UUID 하나를 claim
  ID로 사용하고 서버 현재 시각을 store에 전달
- 지급 50,000, 가용 증가액과 correction debt 상계액을 표시하는 ephemeral 한국어 응답
- 이미 받은 날짜·미가입·중복 operation·저장 실패의 고정 메시지와 audit reason
- 기존 credit route와 bot local assembly 확장
- unit·합성 Discord integration test

## 범위 제외

- 지급 계산·transaction·schema·migration 변경과 새 dependency
- client 날짜·시간대 option, 과거 미수령분 소급, 자동 지급과 scheduler
- 지급 취소·회수, 최근 지급·원장 조회와 dashboard
- 가입 처리, 베팅 등록·정산·랭킹과 공급자 연동
- 별도 command executor/router/audit abstraction
- Discord REST application-command 등록·수정, 시험·외부 서버 변경
- Production migration·build·deploy·feature activation

## 선행 조건과 고정 경계

1. 명령은 기존 `/크레딧` root 아래 option 없는 `/크레딧 받기` 하나로 추가한다.
   날짜, 금액, 대상 사용자와 account ID를 입력받지 않는다.
2. 기존 credit executor가 `크레딧 내정보`와 `크레딧 받기` 두 exact command만
   처리한다. 새 composite나 두 번째 credit router를 만들지 않는다.
3. Store 입력은 `operationId = request.eventId`,
   `claimId = kbo_daily_claim:<crypto.randomUUID()>`, 현재 guild/user와 주입된 서버
   현재 시각이다. KST 날짜는 기존 store만 계산하며 Discord client 값을 신뢰하지
   않는다.
4. `claimed` 응답은 `오늘 50,000 크레딧을 받았습니다`, `가용 크레딧 증가`와
   `정정 부채 상계`를 `Intl.NumberFormat('ko-KR')`로 표시한다. 두 배분액의 합은
   항상 50,000이며 상계액이 0이어도 두 값을 모두 보여 준다.
5. 응답에는 화폐 기호와 `원`, raw Discord/account/operation/claim/ledger ID를
   포함하지 않는다. Store가 반환한 claim date는 내부 결과 검증에만 사용하고
   사용자에게 client-local 날짜처럼 표시하지 않는다.
6. `already_claimed`는 `kbo_daily_credit_already_claimed`, `not_enrolled`는
   `kbo_not_enrolled`, `duplicate_operation`은 `kbo_daily_credit_duplicate` denied
   reason과 고정 안내로 처리한다. 중복 operation을 성공으로 추정하지 않는다.
7. Persistence·입력 검증 실패는 `kbo_daily_credit_unavailable` failure와 고정
   재시도 안내로 정규화하며 DB 오류나 입력을 반사하지 않는다.
8. Claim store의 transaction audit과 기존 `KoreanCommandHandler` command audit을
   유지하고 executor에 추가 audit write를 만들지 않는다.
9. 기존 non-summary interaction adapter의 ephemeral reply를 재사용한다. Public
   지급 알림, defer, button/modal과 새 response abstraction은 추가하지 않는다.
10. Source/local assembly 변경은 Discord REST 등록이나 Production 활성화를
    허용하지 않는다. 공개 전 권리·법률·등급·Discord gate도 그대로 남는다.

## 작업

### Task 1: `/크레딧 받기` command와 local assembly

- 목적: 검증된 일일 지급 transaction을 기존 credit command 경계에 최소 연결한다.
- 변경 예상 파일: `src/commands/slash-commands.ts`, command type과 interaction
  normalizer, 기존 KBO credit command executor, `src/bot/main.ts`, 관련 unit·합성
  Discord integration tests, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - command tree에 option 없는 `/크레딧 받기`가 정확히 정의되고 기존 `내정보` 유지
  - interaction이 current guild/user와 event ID만 command request에 정규화
  - 주입된 UUID prefix claim ID와 주입된 서버 시각을 store에 정확히 한 번 전달
  - `claimed`의 debt 0·부분·전액 상계 결과가 합계 50,000이고 한국어 숫자로 표시
  - 응답은 `ephemeral: true`이며 화폐 표현·내부 ID·DB 오류를 포함하지 않음
  - `already_claimed`, `not_enrolled`, `duplicate_operation`, persistence/input 실패를
    고정 메시지와 success/denied/failure command audit reason으로 구분
  - 동일 성공 operation은 기존 store 결과를 그대로 성공 표시하고 새 지급 로직을
    command 계층에 중복 구현하지 않음
  - 기존 `/크레딧 내정보`, `/베팅 가입`, Riot·몰랭 command routing 회귀 없음
- 완료 기준: 합성 interaction에서 direct request→기존 멱등 claim store→debt-first
  결과→ephemeral 응답과 redacted command audit 흐름이 재현되고 전체
  test/typecheck가 통과한다.
- 위험: 지급 완료 후 Discord 응답이 유실되면 사용자는 같은 interaction을 재사용할
  수 없지만, 같은 날 재실행은 `already_claimed`로 안전하게 종료된다. 지급 내역
  조회 UX가 필요해질 때 별도 계획으로 추가한다.
- 롤백: command definition/normalizer와 기존 executor·assembly의 claim 분기만
  제거하면 schema, 이미 기록된 claim·원장과 `/크레딧 내정보`에 영향이 없다.

## 검증 계획

- 대상 credit command executor/Discord 합성 integration test
- 기존 daily claim unit/PostgreSQL integration regression
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Migration은 없다. 구현 승인은 source와 local/disposable·합성 검증만 허용하며
Discord REST 등록, 시험·외부 서버 command 갱신, Production migration 적용·배포와
feature activation을 허용하지 않는다.

## 문서 갱신

- 구현 시 이 계획의 진행 결과
- `PROJECT_STATUS.md`
- 실제 Discord 등록은 공개 전 gate 승인 뒤 별도 command 운영 문서

## 승인

- Owner decision: Approved — Task 1의 command, local assembly와 unit·합성
  integration test만 구현; Discord REST 등록과 Production 배포 금지
- Approved date: 2026-08-07

## 구현 결과

- Option 없는 `/크레딧 받기` definition과 interaction normalization을 추가하고,
  기존 credit executor를 검증된 daily claim store와 local bot assembly에 연결했다.
- Discord interaction ID, 서버 UUID와 서버 시각을 store에 전달하며 지급 50,000,
  가용 증가액과 correction debt 상계액만 ephemeral 한국어 응답으로 표시한다.
- 대상 command/domain/합성 test `20/20`, 전체 test
  `320 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가 통과했다.
- Discord REST command 등록, 외부 서버 변경, schema·migration과 Production
  build/deploy·feature activation은 수행하지 않았다.
