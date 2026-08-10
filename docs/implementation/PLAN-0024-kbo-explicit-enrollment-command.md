# 구현 계획: KBO 명시적 가입 Discord command

- Status: Completed (source/local only; Discord unregistered)
- Related requirements: `FUN-023`, `OWN-048`
- Related ADRs: `ADR-0029`
- Depends on: completed `PLAN-0019`, command boundary from `PLAN-0023`
- Owner: Product owner

## 목표

사용자가 비현금성·공개 범위·탈퇴와 보존 고지를 명시적으로 확인한 뒤
`/베팅 가입 동의:true`로 0잔액 KBO 계정을 한 번만 생성할 수 있는 최소 Discord
command 경계를 구현한다.

## 현재 구현 상태

- `PostgresKboEnrollmentStore`는 기존 등록 사용자의 active enrollment와 opaque
  0잔액 account를 하나의 멱등 transaction으로 생성한다.
- 기존 command audit sink는 command 완료 후 `registered_discord_user`를 upsert한다.
  따라서 새 사용자의 첫 가입 command에서 enrollment store를 먼저 호출하면
  `not_registered`가 되고 두 번째 시도에서야 가입되는 순서 문제가 있다.
- `/크레딧 내정보`가 KBO executor routing, ephemeral reply와 중앙 command audit의
  source/local 패턴을 제공한다.
- 가입 고지와 동의 option, ID 생성 및 enrollment command executor는 없다.

## 범위

- `/베팅 가입 동의:<참/거짓>` slash command와 interaction normalization
- 비현금성·공개 랭킹·탈퇴 후 직접 연결 제거·1년 보존·backup 최대 30일 잔존의
  고정 동의 문구
- `동의:true`만 허용하는 explicit confirmation
- command actor를 enrollment 전에 기존 등록 사용자로 upsert하는 최소 port
- Discord interaction ID를 operation ID로, 서버 UUID를 account/enrollment ID로 사용
- policy version `1`과 동의 문구의 고정 결합
- enrollment store 결과의 최소 ephemeral 한국어 응답과 중앙 command audit
- 기존 KBO feature router와 bot local assembly 연결
- unit·합성 Discord integration test

## 범위 제외

- `/크레딧 받기`, 베팅 등록, 최근 내역과 랭킹
- 사용자용 가입 해제·복구, 서버 탈퇴 listener와 보존 purge
- 버튼·modal, 별도 consent session/table와 자유 서술 입력
- Discord REST command 등록·수정, 시험·외부 서버 변경
- schema·migration·dependency, Production build/deploy와 feature activation
- 공개 전 법률·등급·Discord gate 변경

## 선행 조건과 고정 경계

1. Command는 `/베팅 가입` 하나와 required Boolean option `동의`만 가진다.
   Option 설명에 `비현금·공개 랭킹·탈퇴 후 1년 보존·백업 최대 30일 잔존`을
   표시하고 `true`가 아니면 store를 호출하지 않는다.
2. 성공 응답은 시작 잔액 0 크레딧, 현실 가치·구매·판매·현금화·양도·교환 금지,
   공개 랭킹 참여, 서버 탈퇴 시 직접 Discord 연결 제거, opaque 원장 1년 보존과
   backup 최대 30일 잔존을 다시 표시한다. 화폐 기호와 `원`은 사용하지 않는다.
3. 동의 문구와 `policyVersion = 1`은 한 source constant에 결합한다. 문구의 의미,
   공개 범위나 보존 정책을 바꾸면 version과 재동의 정책을 별도 승인한다.
4. Executor는 현재 guild/user/display label을 actor-registration port에 먼저
   전달한 뒤 enrollment store를 호출한다. Registration은 command 참여자 기록일
   뿐 KBO 가입으로 간주하지 않으며 enrollment transaction은 그대로 분리한다.
5. Actor registration은 기존 command audit upsert와 같은 bounded label·guild/user만
   저장한다. 가입 실패 후 등록 row가 남아도 자동 가입이나 0잔액 account는 없다.
6. `operationId`는 `request.eventId`, account/enrollment ID는 주입된
   `crypto.randomUUID()` 두 값에 고정 prefix를 붙인다. Raw user ID를 ID나 응답에
   포함하지 않는다.
7. `created`는 success, `already_enrolled`는 `kbo_already_enrolled` denied,
   `duplicate_operation`은 이미 처리한 요청이라는 고정 응답으로 처리한다.
   Registration 뒤 `not_registered`와 persistence 실패는
   `kbo_enrollment_unavailable` failure로 정규화한다.
8. Enrollment store의 transaction audit와 기존 `KoreanCommandHandler`의 command
   audit을 각 목적대로 유지한다. Executor에서 세 번째 audit write를 추가하지 않는다.
9. 기존 non-summary interaction adapter의 ephemeral reply를 재사용한다. Public
   가입 응답이나 새 Discord component abstraction은 추가하지 않는다.
10. Source/local assembly를 추가해도 Discord REST 등록과 Production 배포는
    수행하지 않는다. 공개 전 세 서면 gate와 별도 owner 승인은 그대로 남는다.

## 작업

### Task 1: `/베팅 가입` command와 local assembly

- 목적: 기존 enrollment transaction을 명시적 동의가 있는 최소 ephemeral command에
  연결한다.
- 변경 예상 파일: `src/commands/slash-commands.ts`, command type/interaction
  normalizer와 feature router, 새 KBO enrollment command executor와 actor-registration
  port/store, `src/bot/main.ts`, 관련 unit/합성 integration tests,
  `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - required Boolean `동의`와 고정 핵심 고지가 command payload에 정확히 존재
  - `동의:false`는 registration/enrollment를 호출하지 않고 denied로 감사
  - true는 현재 actor label·guild/user만 등록하고 request event ID, 서로 다른 서버
    UUID 두 개, policy version `1`과 서버 시각을 enrollment store에 전달
  - 신규 사용자의 첫 command에서 `created`되고 시작 balance/debt/version은 0
  - 성공 응답에 모든 고지와 `0 크레딧`이 있고 `원`·화폐 기호·내부 ID가 없음
  - 이미 가입, 동일 operation, registration/enrollment 실패를 고정 응답·audit
    reason으로 구분하고 DB 오류·raw ID를 반사하지 않음
  - Discord adapter 응답은 `ephemeral: true`이며 command audit은 각 시도 한 건
  - 기존 `/크레딧 내정보`, Riot·몰랭 routing과 command가 회귀하지 않음
- 완료 기준: 합성 interaction에서 고지 확인→actor 등록→enrollment transaction→
  ephemeral 응답과 redacted command audit 순서가 재현되고 전체 test/typecheck가
  통과한다.
- 위험: Boolean option은 Discord UI에서 고지를 압축해 보여 주므로 성공 응답에도
  전체 핵심 고지를 반복한다. 더 강한 별도 consent 화면이 법률·Discord 검토에서
  요구되면 이 command를 등록하지 않고 새 UX ADR을 작성한다.
- 롤백: command definition/normalizer/executor route와 actor-registration assembly를
  제거하면 enrollment schema/store와 기존 command에 영향 없이 이전 상태로 돌아간다.

## 검증 계획

- 대상 command/executor/actor-registration/합성 Discord integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Migration은 없다. 구현 승인은 source와 local/disposable·합성 검증만 허용하며
Discord REST 등록, 시험·외부 서버 command 갱신, Production 배포와 feature
activation을 허용하지 않는다.

## 문서 갱신

- 구현 시 이 계획의 진행 결과
- `PROJECT_STATUS.md`
- 실제 Discord 등록은 공개 전 gate 승인 뒤 별도 command 운영 문서

## 승인

- Owner decision: Approved for Task 1 only; Discord REST registration and Production deployment excluded
- Approved date: 2026-08-07

## 구현 결과

- `/베팅 가입 동의:true` definition, 고정 policy v1 고지, interaction normalization,
  actor registration, enrollment executor와 local bot assembly를 연결했다.
- 동의 거부, 생성·중복·기가입·저장 실패, ephemeral 응답과 중앙 command audit을
  unit·합성 테스트로 검증했다.
- 대상 테스트 `14/14`, PostgreSQL suite `19/19`, 전체 테스트
  `317 pass / 7 기존 환경 skip / 0 fail`과 typecheck가 통과했다.
- Discord REST command 등록, 외부 서버 변경, Production migration·배포·활성화는
  수행하지 않았다.
