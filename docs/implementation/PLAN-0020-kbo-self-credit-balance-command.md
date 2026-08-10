# 구현 계획: KBO 본인 크레딧 잔액 Discord command

- Status: Completed (source/local only; Discord unregistered)
- Related requirements: `FUN-024`, `FUN-031`
- Related ADRs: `ADR-0029`
- Depends on: completed `PLAN-0019`
- Owner: Product owner

## 목표

활성 KBO 가입 사용자가 `/크레딧 내정보`로 자신의 가용 크레딧과 correction
debt를 호출자에게만 조회할 수 있는 최소 Discord command 경계를 구현한다.

## 현재 구현 상태

- `PostgresKboCreditBalanceStore`는 guild/user의 active enrollment만 조회해
  정확한 bigint 잔액·debt 또는 `not_enrolled`를 반환한다.
- 기존 interaction adapter는 모든 non-summary 명령을 ephemeral reply로 보내고
  `KoreanCommandHandler`는 모든 성공·거부·실패를 고정 metadata로 감사한다.
- Slash command 정의와 normalizer, feature router는 Riot·몰랭 명령만 지원하며
  KBO credit executor와 runtime assembly가 없다.
- KBO 연구는 `/크레딧 내정보`를 가용 잔액 조회 명령으로 제안했다.

## 범위

- `/크레딧 내정보` slash command 정의와 interaction normalization
- exact command 하나를 처리하는 KBO credit executor
- 호출자의 guild/user만 store에 전달하는 본인 조회
- bigint의 한국어 천 단위 숫자 formatting
- 가용 크레딧과 정정 부채만 포함한 ephemeral 한국어 응답
- 미가입·조회 실패의 고정 사용자 메시지와 감사 reason
- 기존 feature router와 bot local assembly 연결
- unit·합성 Discord integration test

## 범위 제외

- `/베팅 가입`, `/크레딧 받기`, 최근 지급·원장·최근 5개 베팅
- 다른 사용자 잔액 조회, 공개 랭킹과 dashboard
- account ID, raw Discord ID, operation/ledger ID와 version 표시
- Discord REST application-command 등록·수정과 외부 서버 배포
- Production build/deploy, migration, credential와 feature activation
- 법률·등급·Discord 공개 배포 gate 변경

## 선행 조건과 고정 경계

1. 명령명은 기존 연구와 맞춘 `/크레딧 내정보`로 고정하고 option을 추가하지
   않는다. 다른 사용자나 account ID를 선택할 수 없다.
2. Interaction의 현재 `guildId`와 `actorId`만 balance store에 전달한다.
   Direct message의 synthetic guild 값은 store 입력 검증에서 거부되고 고정 실패로
   처리한다.
3. Active 결과는 `Intl.NumberFormat('ko-KR')`로 bigint를 직접 format해
   `가용 크레딧: N 크레딧`, `정정 부채: N 크레딧`만 표시한다. 화폐 기호와
   `원`, 내부 ID와 raw bigint JSON serialization은 사용하지 않는다.
4. `not_enrolled`는 `kbo_not_enrolled` denied audit과 가입 계정이 없다는 고정
   메시지로 반환한다. 아직 없는 가입 command를 실행하라고 안내하지 않는다.
5. Persistence 실패는 `kbo_credit_balance_unavailable` failure audit과 재시도
   안내만 반환하며 DB 오류나 식별자를 반사하지 않는다.
6. 기존 `KoreanCommandHandler`가 command audit을 기록하므로 read store나 KBO
   executor에 별도 operation/audit write를 추가하지 않는다.
7. 기존 interaction adapter의 ephemeral reply 계약을 재사용한다. Public reply,
   defer와 새 Discord response abstraction은 추가하지 않는다.
8. Source에 command payload와 local runtime assembly를 추가해도 Discord REST
   등록과 Production 배포는 수행하지 않는다. 실제 등록·활성화는 공개 전 gate와
   별도 exact owner 승인이 필요하다.

## 작업

### Task 1: `/크레딧 내정보` command와 local assembly

- 목적: 기존 read store를 최소 ephemeral Discord command 경계에 연결한다.
- 변경 예상 파일: `src/commands/slash-commands.ts`,
  `src/commands/command-handler.ts`, `src/adapters/discord/interaction-handler.ts`,
  `src/commands/feature-command-executor.ts`, 새 KBO command executor,
  `src/bot/main.ts`, 관련 unit/integration tests, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - command tree에 option 없는 `/크레딧 내정보` 하나가 정확히 정의됨
  - interaction normalizer가 다른 사용자 option 없이 actor guild/user만 전달
  - 0, 양수와 Number safe range 초과 bigint를 쉼표가 있는 `크레딧` 문자열로 표시
  - correction debt 0·양수를 별도 줄에 표시하고 `원`·화폐 기호·내부 ID가 없음
  - `not_enrolled`는 고정 denied message/reason이고 잔액을 표시하지 않음
  - persistence·malformed guild 실패는 고정 failure message/reason이며 입력과 DB
    오류를 반사하지 않음
  - Discord adapter 응답은 `ephemeral: true`이며 기존 command audit은 성공·거부·
    실패 각각 한 건
  - 기존 Riot·몰랭 routing과 명령들이 회귀하지 않음
- 완료 기준: 합성 interaction이 exact store input, 최소 ephemeral response와 redacted
  audit을 재현하고 전체 test/typecheck가 통과한다.
- 위험: source command payload가 배포되더라도 자동 등록되지는 않지만, 기존 수동
  등록 절차가 실행되면 새 명령이 노출된다. Production 등록 절차는 이번 작업에서
  실행하거나 수정하지 않는다.
- 롤백: 새 command definition/normalizer/executor route와 local assembly를 제거하면
  persistence와 schema 영향 없이 이전 명령 집합으로 돌아간다.

## 검증 계획

- 대상 command/executor/Discord integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Migration은 없다. 구현 승인은 source와 합성/local 검증만 허용하며 Discord REST
등록, 시험·외부 서버 command 갱신, Production 배포와 feature activation을
허용하지 않는다.

## 문서 갱신

- 이 계획과 `PROJECT_STATUS.md`에 source/local 완료 결과를 기록했다.
- 실제 Discord 등록은 별도 승인 시 command 운영 문서

## 승인

- Owner decision: Approved — Task 1의 command, local assembly와 unit/합성
  Discord 테스트만 구현; Discord REST 등록과 Production 배포 금지
- Approved date: 2026-08-07

## 진행 결과

- Option 없는 `/크레딧 내정보` definition, interaction normalization과 exact KBO
  credit executor를 구현하고 기존 feature router와 bot source assembly에 연결했다.
- 응답은 기존 ephemeral adapter를 재사용해 bigint 가용 크레딧과 정정 부채만
  한국어 숫자로 표시하며 미가입·조회 실패를 고정 reason으로 감사한다.
- 대상 command/executor/합성 Discord test `12/12`, 전체 test
  `311 pass / 7 기존 환경 skip / 0 fail`, typecheck와 `git diff --check`가
  통과했다.
- 첫 대상 테스트에서 option 없는 subcommand를 누락하던 기존 검사와 reply count
  기대값 두 건이 실패했고 실제 9개 command 계약에 맞게 수정한 뒤 통과했다.
- Discord REST command 등록, 외부 서버 변경, migration·credential과 Production
  build/deploy는 수행하지 않았다.
