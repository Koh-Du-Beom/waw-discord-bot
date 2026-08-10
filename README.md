# WAW Discord Bot

개인 Discord 서버에서 대화 요약, Riot 계정 관리, 리그 오브 레전드 솔로
랭크와 Discord Go Live 비교, KBO 가상 크레딧 승부 예측, 운영 대시보드,
감사·백업·복구를 제공하는 통합 봇입니다.

- Production dashboard: **<https://waw.dubeom.com>**
- 기준 브랜치: `develop`
- Production 배포 권한 브랜치: `production`
- Runtime: TypeScript, Node.js `>=24.18.0 <25`

시간순 작업 이력, 운영 증거와 차단 요소는
[`PROJECT_STATUS.md`](PROJECT_STATUS.md)를 기준으로 확인합니다.

## 목차

- [프로젝트 성격: Fully AI-driven](#프로젝트-성격-fully-ai-driven)
- [프로젝트 명세](#프로젝트-명세)
- [사용자 기능](#사용자-기능)
- [시스템 구조](#시스템-구조)
- [기술 스택](#기술-스택)
- [저장소 구조](#저장소-구조)
- [개발 환경](#개발-환경)
- [검증 명령](#검증-명령)
- [Runtime 설정](#runtime-설정)
- [개발 workflow](#개발-workflow)
- [배포 workflow](#배포-workflow)
- [문서와 의사결정 체계](#문서와-의사결정-체계)
- [프로젝트 용어집](#프로젝트-용어집)
- [Troubleshooting](#troubleshooting)
- [보안 원칙](#보안-원칙)

## 프로젝트 성격: Fully AI-driven

WAW는 제품 개발 자체와 함께 **fully AI-driven software development**를
실전 검증하기 위해 만든 프로젝트입니다. 사람이 요구사항과 정책을 정하고
production·credential·실제 사용자 데이터처럼 영향이 큰 gate를 승인하며,
AI agent가 조사, Spike, ADR 초안, 구현 계획, 코드, 테스트, 문서, 배포 절차와
장애 진단을 증거 기반으로 수행합니다.

이 과정에서 두 가지 도구·방법론을 의도적으로 시험합니다.

- **Orca CLI**: repository context, worktree, terminal, browser 작업과 agent
  handoff를 연결하고 긴 작업의 상태와 증거를 유지하는 orchestration 경계
- **Ponytail**: 새 abstraction과 dependency를 만들기 전에 기존 코드,
  표준 library와 native platform 기능을 재사용하고 가장 작은 올바른 diff를
  선택하게 하는 개발 원칙

둘은 WAW production runtime의 dependency가 아닙니다. 이 프로젝트가 검증하려는
것은 “AI가 코드를 많이 생성할 수 있는가”가 아니라, AI 중심 개발에서도 정책,
승인, 추적 가능한 의사결정, 실패 재현, rollback과 운영 안전성을 유지할 수
있는가입니다. Fully AI-driven은 production 권한까지 무제한 자동화한다는
뜻이 아니며, Owner gate와 fail-closed 경계는 그대로 유지합니다.

## 프로젝트 명세

### 목표

WAW는 하나의 운영 가능한 시스템으로 다음 기능을 제공합니다.

- 현재 채널 또는 스레드의 최대 24시간 대화 전체 요약
- Discord 사용자의 Riot 계정 연결 요청과 관리자 승인·거절·해제
- Riot 솔로 랭크와 Discord Go Live 상태를 이용한 자동 몰랭 관측
- 몰랭 사건 현황, 정정, 취소와 스택 조회
- 명시적 가입과 비현금성 크레딧을 사용하는 KBO 승부 예측·정산·랭킹
- Discord OAuth 기반 관리자 대시보드
- 명령·설정·관리자 작업의 감사 기록
- 상태 확인, 운영 경보, 암호화 백업과 실제 복구 검증

### 제품 불변조건

다음 조건은 편의를 위해 완화할 수 없습니다.

- 대화 요약은 요청한 시간 범위 전체를 처리하거나 명시적으로 실패합니다.
- Discord 메시지 원문과 생성된 요약을 영구 저장하거나 로그에 기록하지
  않습니다.
- OAuth 코드·토큰, 쿠키, 세션 비밀, API 키와 DB·백업 인증정보를 저장소와
  로그에 남기지 않습니다.
- Discord OAuth 로그인과 제품 권한을 분리합니다. 허용된 서버와 현재 역할을
  서버에서 다시 확인합니다.
- Riot 상태와 Discord Go Live 상태가 부족하거나 외부 서비스가 실패하면
  위반으로 추정하지 않고 `unknown`으로 유지합니다.
- 모든 스키마 변경은 버전형 migration으로 관리하고, 백업 성공 로그가 아닌
  빈 대상 복구로 복구 가능성을 검증합니다.
- Production dashboard의 canonical origin은
  `https://waw.dubeom.com` 하나입니다.

자세한 제품 규칙은 [`docs/product/policy.md`](docs/product/policy.md), 배포·
보안·복구 요구사항은
[`docs/operations/deployment-and-security.md`](docs/operations/deployment-and-security.md)에
있습니다.

## 사용자 기능

### Discord 명령

| 명령 | 설명 |
|---|---|
| `/도움말` | 명령 사용법, 권한과 외부 처리 경계를 호출자에게만 표시 |
| `/요약 최근 범위:<10분~24시간>` | 현재 채널 또는 스레드의 선택 범위 요약 |
| `/요약 직접 시작:<시각> 종료:<시각>` | `20:00`, `어제 23:30`, `오늘 00:30` 형식의 한국 시간 범위 요약 |
| `/라이엇계정 연결 계정:<이름#태그>` | KR Riot ID 연결 승인 요청 |
| `/라이엇계정 목록 [사용자]` | 활성 연결 계정과 본인 해제용 연결 ID 조회 |
| `/라이엇계정 연결해제 계정:<연결 ID>` | 호출자 본인의 연결 해제 |
| `/몰랭검거 현황 [사용자]` | 전체 몰랭스택 또는 특정 사용자의 관측 기록 조회 |
| `/몰랭검거 정정 사건:<ID> 사유:<내용>` | 관리자 전용 사건 정정 |
| `/몰랭검거 취소 사건:<ID> 사유:<내용>` | 관리자 전용 사건 취소 |
| `/베팅 가입 동의:true` | 비현금성 크레딧·공개 랭킹·보존 정책에 동의하고 KBO 기능 가입 |
| `/크레딧 내정보` | 내 가용 크레딧과 정정 부채 조회 |
| `/크레딧 받기` | KST 날짜별 50,000 크레딧 직접 지급 |
| `/베팅 경기` | 최신 접수 가능 경기와 베팅용 경기 ID 조회 |
| `/베팅 하기 경기:<ID> 결과:<결과> 금액:<1,000~50,000>` | 시작 전 KBO 경기 결과 또는 정확 점수 예측 |
| `/베팅 내역` | 최근 베팅 5개와 정산·무효·정정 결과 조회 |
| `/랭킹 크레딧` | 현재 보유 크레딧 공동 순위 조회 |
| `/랭킹 결과\|점수\|적중률 대회:<ID> 시즌:<ID>` | 대회·시즌별 승부 예측 공동 순위 조회 |

관리자가 승인한 Riot 연결은 Riot 공식 소유권 인증이 아닌
`admin_approved_unverified` 상태입니다. 활성 연결은 솔로 랭크와 Discord Go
Live 자동 관측 대상이며, 연결 해제 후에는 후속 관측에서 제외됩니다.

### 대화 요약

- 현재 채널 또는 현재 스레드 하나만 처리합니다.
- 최근 10분, 30분, 1시간, 3시간, 6시간, 12시간, 24시간을 지원합니다.
- 100개를 넘는 메시지도 cursor pagination으로 요청 범위 전체를 읽습니다.
- 삭제, 권한 변경, rate limit 등으로 완전성을 증명할 수 없으면 부분 요약을
  반환하지 않습니다.
- 결과는 `핵심 논의`, `결정`, `할 일`, `미해결`로 구분합니다.
- 등록 사용자별 rolling 1시간에 한 번만 외부 provider 호출을 예약합니다.
- 선택 범위의 메시지는 OpenAI API로 전송될 수 있고 안전성 모니터링을 위해
  최대 30일 보존될 수 있습니다. API 입력·출력은 기본적으로 모델 학습에
  사용되지 않으며 WAW는 원문과 결과를 영구 저장하지 않습니다.

### 자동 몰랭 감지

- 관리자가 승인한 모든 활성 KR Riot 계정을 30초 주기로 관측합니다.
- Riot solo ranked queue ID `420`과 Discord Voice State의 Go Live
  `self_stream`을 별도 증거로 저장합니다.
- Discord Voice 증거는 실제 source 관측시각과 30초 poll 시각을 분리하고,
  3분이 지나면 `unknown`으로 낮춥니다. Gateway가 정상이어도 관측 대상만
  2분마다 current Voice State를 재조정합니다.
- 게임 시작 뒤 5분 유예, 스트림 중단 2분 허용을 적용합니다.
- 외부 API 실패와 Gateway 불확실성은 `unknown`으로 기록합니다.
- 동일 사건을 중복 생성하거나 같은 위반 알림을 반복 전송하지 않습니다.
- 새 위반 알림은 대상 사용자만 Discord mention하고, 전송 실패는 process가
  살아 있는 동안 다음 poll에서 재시도합니다.

### 관리자 대시보드

- Discord OAuth 로그인
- bot, DB와 backup 상태
- 최근 Discord 명령과 cursor 기반 명령 로그
- Riot 연결 요청 단건·일괄 승인/거절
- 활성 Riot 연결 조회와 관리자 단건 해제
- 요약 활성 설정
- 설정 변경과 운영 감사 기록
- Administrator 전용 KBO 계정·지급·베팅·정산·공급 상태와 signed 크레딧 조정
- 관리자 전용 몰랭 사건 정정·취소와 stale/timeout 안전 처리
- desktop/mobile 반응형 UI, keyboard와 axe 접근성 검사

## 시스템 구조

```text
Browser
  │ HTTPS / Discord OAuth
  ▼
Caddy ──► Fastify API + React SPA (waw-web)
             │
             ├── PostgreSQL: session, 설정, 감사, read model
             ├── member-role Unix socket ─┐
             └── admin-command Unix socket ┤
                                          ▼
Discord Gateway / commands ◄────────── waw-bot
                                          │
                         ┌────────────────┼────────────────┐
                         ▼                ▼                ▼
                    Discord API       Riot API        OpenAI API

PostgreSQL ──logical dump──► age encryption ──Put-only──► Amazon S3
systemd/journald ──► local monitor ──► Discord operational alert
```

핵심 경계는 다음과 같습니다.

- Web과 bot은 같은 Lightsail host에 있지만 별도 systemd user, unit과
  credential을 사용합니다.
- Web은 Discord bot token과 bot mutation DB capability를 받지 않습니다.
- Bot은 browser cookie, OAuth code/token, session과 CSRF credential을 받지
  않습니다.
- 역할 조회와 관리자 명령은 public TCP API가 아닌 권한 제한 Unix domain
  socket 두 개로 분리합니다.
- Fastify는 `127.0.0.1`에만 bind하고 Caddy만 public 80/443을 소유합니다.
- PostgreSQL workload role, backup writer, restore reader의 권한을 서로
  분리합니다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 언어·runtime | TypeScript, Node.js 24 |
| Discord | `discord.js` |
| Web API | Fastify |
| Dashboard | React, React Router, Vite |
| 데이터 | PostgreSQL 17, `pg`, versioned SQL migrations |
| 인증 | Discord OAuth `identify`, opaque server-side session |
| 내부 통신 | Node.js Unix domain socket IPC |
| 요약 | OpenAI Responses API adapter |
| 배포 | Ubuntu Lightsail, systemd, immutable release directory |
| HTTPS | Caddy |
| 백업 | PostgreSQL logical dump, `age`, Amazon S3 |
| 로그·경보 | journald, local systemd monitor, Discord webhook, Lightsail alarm |
| 테스트 | Node test runner, `tsx`, Testing Library, Playwright Core, axe |
| CI/CD | GitHub Actions, exact-commit SSH deployment |

정확한 dependency version은 [`package.json`](package.json)과
[`package-lock.json`](package-lock.json), 기술 선택 이유는
[`docs/adr/`](docs/adr/)에서 확인합니다.

## 저장소 구조

```text
.
├── .github/workflows/       # CI, production SSH preflight, production deploy
├── deploy/                  # systemd, Caddy, journald, installer와 Linux fixtures
├── migrations/              # 순서와 checksum이 고정된 PostgreSQL migrations
├── scripts/                 # build, backup, 배포, 진단과 검증 script
├── src/
│   ├── adapters/            # Discord 등 외부 경계 adapter
│   ├── auth/                # OAuth, session, authorization, role IPC
│   ├── bot/                 # Discord Gateway runtime
│   ├── commands/            # slash command 계약과 handler
│   ├── game/                # 몰랭 관측·판정·scheduler
│   ├── http/                # Fastify dashboard API
│   ├── ipc/                 # 관리자 명령 Unix socket
│   ├── kbo/                 # 크레딧·베팅·정산·랭킹 domain
│   ├── persistence/         # PostgreSQL stores와 migration runner
│   ├── riot/                # Riot identity·spectator adapter
│   ├── summary/             # 요약 provider와 quota
│   └── web/                 # production web assembly
├── web/                     # React SPA와 browser accessibility check
├── docs/
│   ├── product/             # 제품 정책
│   ├── operations/          # 배포·보안 정책, runbook과 실행 증거
│   ├── research/            # 기술 조사, Spike와 benchmark
│   ├── adr/                 # Architecture Decision Records
│   ├── implementation/      # 승인된 bounded 구현 계획
│   ├── standards/           # 코딩·테스트·로그·데이터·보안 표준
│   ├── ai/                  # Codex workflow
│   └── prompts/             # 반복 가능한 단계별 작업 절차
├── AGENTS.md                # AI coding agent의 저장소 규칙
├── PROJECT_STATUS.md        # 시간순 작업·운영 이력과 다음 작업
└── CHANGELOG.md             # 사용자에게 의미 있는 변경 이력
```

`dist/`와 `node_modules/`는 source of truth가 아닙니다. Source는 `src/`,
`web/`, `migrations/`, `deploy/`와 관련 문서입니다.

## 개발 환경

### 필수 도구

- Node.js `24.18.0` 이상, `25` 미만
- npm과 `package-lock.json`
- Git

전체 데이터 통합 검증에는 다음이 추가로 필요합니다.

- PostgreSQL 17의 `initdb`, `pg_ctl`
- 또는 Docker를 이용한 disposable PostgreSQL fixture

Browser 접근성 검증에는 repository에 고정된 `playwright-core`와 Chromium이
필요합니다.

### 설치

```bash
git clone https://github.com/Koh-Du-Beom/waw-discord-bot.git
cd waw-discord-bot
node --version
npm ci
```

`npm install` 대신 lockfile을 정확히 따르는 `npm ci`를 사용합니다. Node
version이 범위를 벗어나면 먼저 runtime을 맞춥니다.

### 가장 짧은 개발 확인

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

일반 `npm test`는 host에 PostgreSQL 도구가 없으면 일부 통합 테스트를
명시적으로 skip합니다. 출력의
`postgres_integration_skipped reason=postgres_tools_unavailable`은 PASS가
아니라 미검증 범위입니다.

## 검증 명령

### 전체 unit·local test

```bash
TMPDIR=/tmp npm test
```

### PostgreSQL 통합 경계를 반드시 포함

Host에 PostgreSQL 17 도구가 있을 때:

```bash
WAW_REQUIRE_POSTGRES_INTEGRATION=1 TMPDIR=/tmp npm test
```

Docker를 사용할 때:

```bash
bash deploy/integration/postgres/run.sh
```

`WAW_REQUIRE_POSTGRES_INTEGRATION=1`은 `initdb`나 `pg_ctl`이 없으면 fail
closed합니다. `WAW_SKIP_POSTGRES_INTEGRATION=1`은 CI의 의도적인 비-PostgreSQL
slice에서만 사용합니다.

### Typecheck와 build

```bash
npm run typecheck
npm run build
```

Build 결과:

- Server: `dist/server`
- Dashboard: `dist/web`
- Migration copy: `dist/migrations`

### 로컬 application 실행 경계

이 저장소에는 secret을 흉내 내는 `.env.example`이나 별도 `dev` server가
없습니다. `npm run start:web`과 `npm run start:bot`은 build된 production
assembly를 실행하며 PostgreSQL, systemd 형식 credential, Discord/Riot 설정과
Unix socket 경계를 요구합니다.

일반 개발은 unit test와 `deploy/integration/`의 disposable fixture를
사용합니다. 실제 Discord OAuth·Gateway·Riot·OpenAI를 연결한 로컬 실행은
필요한 외부 계정과 데이터 범위를 명시하고 별도 승인된 Spike 또는 integration
작업으로 수행합니다. 임의의 real credential을 `.env`에 복사해 우회하지
않습니다.

### Browser·접근성

```bash
node node_modules/playwright-core/cli.js install chromium
npm run test:browser
```

Ubuntu CI와 동일하게 OS dependency까지 설치하려면 다음을 사용합니다.

```bash
node node_modules/playwright-core/cli.js install --with-deps chromium
```

### Production asset·release fixture

Linux 또는 Linux 호환 shell에서:

```bash
bash deploy/test-production-application-assets.sh
bash deploy/test-production-release-manager.sh
bash scripts/test-deploy-production-via-lightsail.sh
bash scripts/test-wait-production-health.sh
bash deploy/integration/postgres/test-data-reset.sh
```

일부 release fixture는 GNU `stat`, `mv -T`, systemd와 Linux permission
semantics가 필요하므로 macOS 결과만으로 production 계약을 통과 처리하지
않습니다.

### Dependency audit

```bash
npm audit --omit=dev
```

현재 GitHub Actions의 전체 검증 순서는
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)이 source of truth입니다.

## Runtime 설정

Production runtime은 `.env`에 secret을 모으지 않습니다. Root-owned source
file과 systemd `LoadCredential=`로 service별 최소 credential만 주입합니다.

### Web credential

`CREDENTIALS_DIRECTORY` 아래에 다음 이름이 필요합니다.

| 파일 이름 | 내용 |
|---|---|
| `database-url` | Web 최소 권한 PostgreSQL URL |
| `oauth-client-secret` | Discord OAuth client secret |
| `csrf-key` | CSRF/session binding key |

### Bot credential

| 파일 이름 | 내용 |
|---|---|
| `discord-bot-token` | Discord bot token |
| `database-url` | Bot 최소 권한 PostgreSQL URL |
| `riot-api-key` | Riot Personal API key |
| `summary-api-key` | 요약 provider 활성화 시에만 필요한 OpenAI key |

Credential directory는 절대 경로여야 합니다. 값은 비어 있거나 여러 줄이면
거부됩니다. Secret literal을 Git, shell argument, process environment, chat,
문서와 로그에 넣지 않습니다.

### 주요 비밀이 아닌 환경 설정

| 변수 | 의미 |
|---|---|
| `WAW_AUTH_ENVIRONMENT` | `production`, `fixed-preview`, `arbitrary-preview`, `development` |
| `WAW_DISCORD_CLIENT_ID` | Discord OAuth application ID |
| `WAW_DISCORD_REDIRECT_URI` | 정확한 `/auth/discord/callback` URI |
| `WAW_ALLOWED_ORIGIN` | 허용 origin; production은 canonical origin만 가능 |
| `WAW_DISCORD_GUILD_ID` | 허용 Discord guild |
| `WAW_DISCORD_OPERATOR_ROLE_IDS` | comma-separated operator role IDs |
| `WAW_DISCORD_ADMINISTRATOR_ROLE_IDS` | comma-separated administrator role IDs |
| `WAW_DISCORD_TIMEOUT_MS` | Discord provider timeout, 100~10,000ms |
| `WAW_WEB_HOST` | 반드시 `127.0.0.1` |
| `WAW_WEB_PORT` | 1024~65535의 loopback port |
| `WAW_MEMBER_ROLE_SOCKET` | 현재 역할 조회 Unix socket |
| `WAW_ADMIN_COMMAND_SOCKET` | 관리자 명령 Unix socket |
| `WAW_BOT_HEALTH_PATH` | Bot health snapshot 경로 |
| `WAW_BACKUP_MARKER_PATH` | 최신 backup publication marker |
| `WAW_SERVICE_VERSION` | 구조화 로그와 상태에 표시할 release version |
| `WAW_GAME_ALERT_CHANNEL_ID` | 자동 관측 활성 시 공개 알림 channel snowflake |

### Feature flags

다음 flag는 값이 정확히 `1`일 때만 활성화됩니다.

| 변수 | 기능 |
|---|---|
| `WAW_ADMIN_COMMAND_IPC_ENABLED` | Dashboard→bot 관리자 명령 |
| `WAW_GAME_OBSERVATION_ENABLED` | Riot/Go Live 자동 관측 |
| `WAW_DISCORD_VOICE_RECONCILIATION_INTERVAL_MS` | 대상 Voice State 재조정 주기; 기본 120000ms |
| `WAW_DISCORD_VOICE_FRESHNESS_MS` | Discord 증거 freshness; 기본 180000ms |
| `WAW_SUMMARY_QUOTA_ENABLED` | 등록 사용자별 rolling-hour 예약 |
| `WAW_SUMMARY_PROVIDER_ENABLED` | OpenAI 요약 provider와 credential load |
| `WAW_KBO_DATA_RIGHTS_AUTHORIZED` | 승인된 KBO 데이터 권리와 ingestion 사용 |
| `WAW_KBO_RANKINGS_ENABLED` | KBO 공개 크레딧·예측 랭킹 |
| `WAW_KBO_BETTING_ENABLED` | KBO 신규 베팅 접수 |

새 release의 기본 systemd asset은 이 flag들을 `0`으로 둡니다. Application
배포는 migration, credential 변경이나 feature activation을 자동 승인하지
않습니다.

KBO는 정상 경기·공식 정정 schema, 외부 봇 개발자 허가와 공개 운영 gate가
확인될 때까지 세 flag를 모두 `0`으로 유지합니다. 이미 접수된 bet의 정산과
탈퇴·보존 생명주기는 신규 접수 flag와 분리합니다.

Production unit의 정확한 capability와 sandbox 설정은
[`deploy/systemd/waw-web.service`](deploy/systemd/waw-web.service)와
[`deploy/systemd/waw-bot.service`](deploy/systemd/waw-bot.service)를
확인합니다.

## 개발 workflow

### 작업 전 필수 읽기 순서

1. [`README.md`](README.md)
2. [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
3. [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md)
4. [`docs/product/policy.md`](docs/product/policy.md)
5. [`docs/operations/deployment-and-security.md`](docs/operations/deployment-and-security.md)
6. [`docs/ai/codex-workflow.md`](docs/ai/codex-workflow.md)
7. 작업과 관련된 [`docs/standards/`](docs/standards/)
8. 관련 Research, ADR, implementation plan과 runbook

충돌 시 우선순위는 현재 사용자 지시 → Accepted ADR → 제품 정책 → 운영·보안
정책 → 프로젝트 표준 → 승인된 구현 계획 → Research/Proposed ADR → 기존
구현입니다. 실제 충돌은 임의로 해석하지 않고 보고합니다.

### 작업 분류

| 요청 | 시작점 | 결과 |
|---|---|---|
| 정책·요구가 불명확 | Product policy | 제품 결정과 검증 가능한 요구사항 |
| 현실적 기술 후보가 불명확 | Research | 공식 자료 기반 비교와 미확인 사항 |
| 문서로 핵심 가설을 판단할 수 없음 | Spike | 폐기 가능한 최소 실험과 재현 증거 |
| 되돌리기 어렵거나 여러 component에 영향 | Proposed ADR | Owner가 승인할 결정안 |
| Accepted ADR을 구현해야 함 | Implementation plan | 작은 Task, 테스트, rollback |
| 승인된 Task가 있음 | Implementation | 한 번에 Task 하나 |
| 결함이 보고됨 | Bug workflow | 재현→root cause→회귀 테스트→최소 수정 |
| 배포 후보가 준비됨 | Release workflow | preflight, gate, rollback과 배포 판단 |

### 새 기능

```text
정책과 요구사항 확인
  ↓
공식·1차 자료 기반 Research
  ↓
문서로 부족한 가설만 Spike
  ↓
Proposed ADR 작성
  ↓
Owner 승인
  ↓
Accepted ADR
  ↓
Implementation plan 작성·승인
  ↓
Bounded Task 하나를 RED → GREEN으로 구현
  ↓
Targeted test → 관련 regression → build/audit
  ↓
문서·상태·CHANGELOG 갱신
  ↓
별도 Release gate와 production 승인
```

Research, 승인, architecture 선택과 넓은 구현을 한 작업으로 합치지 않습니다.
Proposed ADR은 승인된 결정이 아니며, Draft plan은 구현 권한이 아닙니다.

### 버그 수정

1. 증상과 재현 조건을 고정합니다.
2. 영향을 받는 caller와 같은 경계를 쓰는 sibling path를 찾습니다.
3. root cause가 드러나는 실패 테스트 또는 재현을 만듭니다.
4. 공통 경계에서 가장 작은 수정으로 해결합니다.
5. targeted test와 관련 regression을 실행합니다.
6. 운영·보안·데이터 영향과 rollback 필요성을 확인합니다.
7. `PROJECT_STATUS.md`, `CHANGELOG.md`와 관련 runbook을 갱신합니다.

증상마다 guard를 추가하지 않습니다. 모든 caller가 지나는 shared boundary에서
한 번 고치는 것이 원칙입니다.

### 한 Task의 완료 기준

- 승인된 정책, Accepted ADR과 plan 범위를 만족
- 실패·권한·timeout·중복·부분 실패 경로 검증
- 필요한 PostgreSQL, Unix permission 또는 browser 경계를 실제 fixture로 검증
- secret, Discord 원문과 불필요한 identifier가 log·DTO에 없음
- migration, backup, rollback과 feature flag 영향 확인
- 관련 문서와 상태 갱신
- 실행한 명령, PASS·FAIL·skip과 미검증 범위 보고

반드시 다음 완료 보고 형식을 사용합니다.

- 변경 파일
- 결정과 근거
- 가정과 미해결 항목
- 실행한 명령과 테스트
- 결과와 실패
- 갱신한 문서
- 권장 다음 prompt

반복 가능한 단계별 요청은 [`docs/prompts/`](docs/prompts/)에 있습니다.

## 배포 workflow

### Branch와 CI

- `develop`: 기본 integration branch. Push와 PR에서 CI를 실행합니다.
- `production`: production deploy authority branch. Push가 production
  workflow를 시작합니다.
- Production 승인의 기본 단위는 검토된 `develop`→`production` 승격입니다.
- Normal deployment는 exact `GITHUB_SHA` source archive를 만들고 SHA-256,
  pinned SSH host key와 전용 deploy key를 검증합니다.
- Production deploy는 concurrency group으로 직렬화합니다.

### Normal application deployment에 포함되는 것

- exact commit archive 전달
- isolated stage의 `npm ci`, typecheck와 build
- immutable release directory 생성
- service·timer·health preflight
- `current`/`previous` release 전환
- bounded readiness 확인
- 실패 시 application release와 unit rollback
- runner와 remote staging cleanup

### 별도 Owner gate가 필요한 것

- PostgreSQL migration
- application·backup credential 생성, 변경과 rotation
- Discord command 등록
- Riot/OpenAI provider나 game observation feature 활성화
- production 데이터 mutation·reset·restore
- DNS, firewall, TLS authority 변경
- journald vacuum
- 실제 사용자 계정이나 사건을 바꾸는 smoke test

Production 절차는
[`docs/operations/production-application-deployment-runbook.md`](docs/operations/production-application-deployment-runbook.md),
인증은 [`docs/operations/authentication-runbook.md`](docs/operations/authentication-runbook.md),
복구는 [`docs/operations/backup-restore-runbook.md`](docs/operations/backup-restore-runbook.md)를
따릅니다.
검거 대시보드 운영은
[`docs/operations/game-enforcement-dashboard-runbook.md`](docs/operations/game-enforcement-dashboard-runbook.md),
별도 production 승인 경계는
[`docs/operations/plan-0016-game-dashboard-production-gate-handoff-2026-08-01.md`](docs/operations/plan-0016-game-dashboard-production-gate-handoff-2026-08-01.md)를
따릅니다.

### Human production SSH

- 사람이 수행하는 정상 production SSH 운영은 Termius의 `waw-operator`
  account와 passphrase-protected human-only Ed25519 key를 사용합니다.
- Human key는 GitHub Actions deploy key와 account, rotation 및 revocation
  경계를 공유하지 않습니다.
- AI agent는 production SSH, CloudShell과 외부 서비스 terminal에 명령을
  입력하지 않고, 필요한 명령은 repository root의 Git-untracked
  `TEMP_*.md` handoff로만 제공합니다.
- Root SSH login과 SSH forwarding은 차단하고 password authentication은
  사용하지 않으며 fail2ban `sshd` jail을 유지합니다.
- SSH port는 기존 GitHub exact-commit deployment와 동일한 TCP 22를 유지합니다.
  Lightsail source restriction은 Owner 결정으로 적용하지 않으며 browser
  SSH와 CloudShell은 break-glass 경로로만 사용합니다.

## 문서와 의사결정 체계

| 문서 | 답하는 질문 |
|---|---|
| `AGENTS.md` | Agent가 무엇을 읽고 어떤 안전·완료 규칙을 따라야 하는가? |
| `README.md` | 프로젝트가 무엇이며 어떻게 개발·검증하는가? |
| `PROJECT_STATUS.md` | 어떤 작업이 언제 수행됐고 다음 gate와 blocker는 무엇인가? |
| `CHANGELOG.md` | 사용자에게 의미 있는 변경은 무엇인가? |
| `docs/product/policy.md` | 무엇을 만들어야 하며 무엇을 하면 안 되는가? |
| `docs/operations/` | 배포·보안·백업·복구를 어떻게 안전하게 운영하는가? |
| `docs/research/` | 후보, 사실, 추론, 실험과 남은 불확실성은 무엇인가? |
| `docs/adr/` | 어떤 기술 결정을 왜 선택·교체했는가? |
| `docs/implementation/` | 승인된 결정을 어떤 bounded Task로 구현하는가? |
| `docs/standards/` | 코드·테스트·로그·데이터·보안 품질 기준은 무엇인가? |
| `docs/prompts/` | Codex에 단계별 작업을 어떻게 요청하는가? |

문서 링크는 설명을 복제하기 위한 것이 아닙니다. README는 진입점이고, 정책·
결정·실행 증거의 source of truth는 각 전문 문서입니다.

## 프로젝트 용어집

### 문서와 의사결정

| 용어 | 이 프로젝트에서의 정확한 의미 |
|---|---|
| Policy | 제품·운영상 반드시 지켜야 할 규칙. 구현 편의를 위해 바꿀 수 없고 변경 자체가 별도 제품 결정입니다. |
| Requirement | 테스트나 관찰로 참·거짓을 판정할 수 있는 요구. ID를 바꾸지 않고 Research, ADR, plan과 test로 추적합니다. |
| `FUN-*` | 사용자 기능 요구사항 ID |
| `SEC-*` | 인증·인가·비밀·공급망 등 보안 요구사항 ID |
| `PRI-*` | 개인정보 최소 수집·원문 비저장·보존 요구사항 ID |
| `DAT-*` | 트랜잭션·무결성·migration·이식성·시간 요구사항 ID |
| `OPS-*` | 실행·관측·백업·복구·rollback 요구사항 ID |
| `DEP-*` | 도메인·환경 분리·배포 요구사항 ID |
| `INT-*` | Web↔bot 내부 통신과 노출 최소화 요구사항 ID |
| `QUA-*` | 시험성·실패 경로·설정 품질 요구사항 ID |
| `OWN-*` | Owner가 확정한 제품·운영 입력. 기술 선택과 구분합니다. |
| `ODR-*` | Research 중 Owner 답변이 필요했던 decision request. 확정되면 `OWN-*` 등 추적 가능한 결정으로 반영합니다. |
| `D-xx` | 기술 결정 영역 또는 조사 순서의 ID |
| `Dxx-Qxx`, `INT-Qxx` | 특정 조사에서 Owner에게 확인한 질문과 답 |
| `GAP-*` | 문서나 현재 증거로 닫히지 않은 지식·검증 공백 |
| Research | 요구·제약을 추출하고 현실적 후보를 공식·1차 자료로 비교하는 단계. 제품 코드와 최종 선택을 만들지 않습니다. |
| Spike | 문서로 판단할 수 없는 가설 하나를 최소한의 폐기 가능한 코드·자원으로 검증하는 실험. 성공해도 production 코드나 dependency로 자동 승격되지 않습니다. |
| Benchmark | 성능, 비용, 처리량, 지연이나 자원 사용량을 같은 조건에서 측정한 증거. Architecture 승인 자체는 아닙니다. |
| ADR | Architecture Decision Record. 되돌리기 어렵거나 여러 component에 영향을 주는 기술 결정의 맥락, 후보, 선택, 결과와 재검토 조건입니다. |
| Implementation plan | Accepted ADR을 작은 검증 가능한 Task로 나눈 실행 계획. 파일, 테스트, 위험, dependency와 rollback을 포함합니다. |
| Task | 한 번의 작업에서 구현·검증할 수 있는 bounded 단위. 다음 Task로 자동 확장하지 않습니다. |
| Runbook | 운영자가 배포, backup, restore, rotation, 진단과 rollback을 반복 수행하는 절차입니다. |
| Evidence | 명령, 결과, hash, read-back, 테스트 수치와 cleanup처럼 주장을 검증할 수 있는 기록입니다. |
| Source of truth | 충돌 시 권위를 갖는 문서나 상태. 우선순위는 `AGENTS.md`의 규칙을 따릅니다. |

### ADR와 plan 상태

| 상태 | 의미 |
|---|---|
| `Proposed` | 추천 결정안이 있으나 Owner가 승인하지 않음. 구현 근거로 사용할 수 없습니다. |
| `Accepted` | Owner가 승인해 현재 구현의 권위가 된 ADR |
| `Rejected` | 검토했지만 채택하지 않은 ADR |
| `Superseded` | 새 ADR이 결정을 대체함. 역사와 이전 이유는 보존합니다. |
| `Deprecated` | 더 이상 권장하지 않지만 아직 완전히 대체·제거되지 않았을 수 있음 |
| `Draft` | 구현 계획 초안. 실행 승인이 아닙니다. |
| `Approved` | Owner가 plan의 범위와 순서를 승인함. Production 변경은 plan에 별도 gate가 있으면 다시 승인받습니다. |
| `In Progress` | 승인된 Task 일부가 진행 또는 완료됐고 종료 조건이 남아 있음 |
| `Blocked` | 명시된 외부 조건이나 결정 없이는 계획을 진행할 수 없음 |
| `Complete` | 계획의 승인된 범위와 검증·문서가 완료됨 |
| `Local/Disposable Complete` | 로컬·폐기 환경 구현은 끝났지만 production migration, credential, activation 또는 실제 smoke는 승인되지 않음 |
| `Superseded plan` | 새 plan이 범위를 대체함. 이미 적용된 migration과 감사 증거는 삭제하지 않습니다. |

모든 ADR은 먼저 `Proposed`이며 Owner 승인 없이 `Accepted`로 바꾸지 않습니다.
모든 implementation plan은 먼저 `Draft`이며, ADR 승인과 plan 승인을 같은
행위로 간주하지 않습니다.

### 구현과 검증

| 용어 | 의미 |
|---|---|
| Success criteria | 작업을 완료로 판정할 수 있는 사전 정의된 관찰 조건 |
| Failure criteria / Stop condition | 실패 또는 예상 밖 상태에서 더 이상 mutation·retry하지 않고 중단할 조건 |
| RED | 결함이나 누락을 재현하는 테스트가 예상대로 실패하는 상태 |
| GREEN | 최소 구현 뒤 해당 테스트가 통과하는 상태 |
| Targeted test | 변경한 경계와 직접 관련된 가장 작은 테스트 집합 |
| Regression test | 같은 결함이 다시 생기거나 주변 기존 동작이 깨지는 것을 잡는 테스트 |
| Unit test | 외부 경계를 fake로 두고 작은 정책·계산·parser를 검증하는 테스트 |
| Integration test | PostgreSQL, Unix socket, filesystem permission 또는 HTTP처럼 실제 component 경계를 함께 검증하는 테스트 |
| Browser test | Chromium에서 UI, keyboard, axe와 작은 viewport overflow를 검증하는 테스트 |
| Smoke test | 배포된 핵심 경로가 최소 입력으로 실제 동작하는지 확인하는 제한된 검사 |
| End-to-end | 실제 시작점부터 최종 사용자 결과까지 전체 연결을 검증하는 검사 |
| Rehearsal | 장애·복구·rollback 절차를 안전한 대상에서 실제 순서대로 연습하는 실행 |
| Fixture | 테스트가 통제된 상태를 만들고 종료 시 모두 제거하는 합성 환경·데이터·process |
| Fake / Synthetic | 실제 사용자 데이터·credential·provider 대신 결정적인 가짜 입력과 결과를 사용하는 검증 |
| Canary | 유출·redaction 또는 failure path를 검증하기 위해 넣는 식별 가능한 합성 값 |
| Skip | 환경이나 명시적 범위 제외로 실행하지 않은 테스트. PASS와 같지 않습니다. |
| Fresh evidence | 이번 변경 뒤 실제로 다시 실행해 얻은 증거. 과거 PASS를 현재 PASS로 재사용하지 않습니다. |

### Release와 운영

| 용어 | 의미 |
|---|---|
| Gate | 다음 단계로 넘어가기 전에 충족하고 필요하면 Owner 승인을 받아야 하는 독립 조건 |
| Owner gate | Production, credential, 외부 계정, 실제 데이터처럼 영향이 큰 동작을 Owner가 exact 범위로 승인하는 경계 |
| Preflight | Mutation 전에 version, hash, credential metadata, backup, health, 권한과 rollback 대상을 읽기 위주로 확인하는 점검 |
| Candidate | 아직 production에 활성화하지 않은 검증 대상 commit 또는 release |
| Exact candidate | 전체 commit hash로 고정해 다른 source와 혼동할 수 없는 후보 |
| Immutable release | Build 후 쓰기 금지된 `/opt/waw/releases/<version>` directory. 수정하지 않고 새 release를 만듭니다. |
| Exact archive / tuple | Commit, archive SHA-256, byte 수, migration hash 등 함께 고정한 동일성 증거 |
| Stage | Candidate를 build·검증 가능한 위치에 준비하지만 active traffic에는 연결하지 않는 단계 |
| Rollout | Migration, release, 설정 또는 기능을 검증 gate에 따라 단계적으로 적용하는 전체 과정 |
| Activation | Staged release나 default-off 기능을 실제 runtime 경로에 연결하는 상태 변경 |
| Promotion | 검증된 source를 `develop`에서 production authority로 승격하는 행위 |
| Release | 배포 가능한 immutable application artifact와 그 version |
| `current` | Production service가 현재 실행하는 immutable release symlink |
| `previous` | Activation 실패 시 복구할 직전의 distinct immutable release symlink |
| Readiness | Process 시작 뒤 bounded 시간 안에 실제 요청을 처리할 준비가 됐는지 확인하는 상태 |
| Health | Web, storage, bot process와 Discord Gateway의 종합 상태 |
| `healthy` | 필수 component가 모두 정상 |
| `degraded` | Web과 storage는 동작하지만 Gateway 등 일부 component가 불완전 |
| `unavailable` | Web process 또는 canonical storage 등 필수 경계가 없음 |
| Rollback | 실패 시 사전에 고정한 application·unit·설정을 이전 상태로 되돌리는 절차 |
| Corrective forward | 적용된 migration을 파괴적으로 되돌리지 않고 새 migration으로 문제를 교정하는 방식 |
| Postcondition | 작업이 끝난 뒤 반드시 read-back해 확인할 상태 |
| Cleanup | Temporary credential, object, process, directory, container와 remote staging의 최종 부재 확인 |
| Break-glass | Normal CD가 불가능할 때만 쓰는 제한된 수동 복구 경로 |

### 데이터·신뢰성·보안

| 용어 | 의미 |
|---|---|
| Migration | 순서, 이름과 checksum이 고정된 재현 가능한 PostgreSQL schema 변경 |
| Migration ledger | 적용한 version, 이름과 checksum을 기록해 변경·중복 적용을 막는 원장 |
| Additive migration | 기존 data와 이전 release를 깨지 않도록 column/table/constraint를 추가하는 변경 |
| Forward-only | Production schema를 destructive down SQL로 되돌리지 않고 호환 release나 corrective migration으로 복구하는 정책 |
| RLS | PostgreSQL Row Level Security. DB role별 행 접근을 제한하지만 application authorization을 대체하지 않습니다. |
| Backup `published` | Dump, 암호화, upload와 byte/hash 검증이 끝난 상태. 복구 가능성은 아직 증명하지 않습니다. |
| Backup `verified` | Wrong identity 거부와 빈 target 실제 restore, schema·row·constraint 검증까지 통과한 상태 |
| RPO | Recovery Point Objective. 장애 시 허용 가능한 최대 데이터 손실 시간; 현재 목표는 24시간입니다. |
| RTO | Recovery Time Objective. 검증된 서비스 복구까지의 목표 시간; 현재 목표는 8시간입니다. |
| Trust boundary | 한쪽의 입력·identity·credential을 그대로 신뢰하지 않고 검증해야 하는 경계 |
| Capability | Process나 credential이 실제로 수행할 수 있는 권한의 집합 |
| Least privilege | 필요한 최소 capability만 주고 다른 읽기·쓰기·삭제를 거부하는 원칙 |
| Default deny | 명시적으로 허용되지 않은 actor, field, command, host와 상태를 거부하는 원칙 |
| Allowlist | 허용된 값·field·command만 열거하고 나머지를 거부하는 방식 |
| Fail closed | 외부 서비스, 권한 확인이나 결과가 불명확할 때 작업을 허용하지 않는 방식 |
| Redaction | Sensitive data를 출력 뒤 지우는 것이 아니라 log emitter의 입력 allowlist에서 처음부터 제외하는 처리 |
| Operational log | 장애 분석용 30일 journald event. 감사 원장이 아니며 secret·원문을 포함하지 않습니다. |
| Audit log | 누가 언제 어떤 명령·설정·관리 작업을 시도했고 결과가 무엇인지 기록하는 PostgreSQL 원장 |
| Correlation ID | 여러 log event를 한 요청·작업으로 연결하는 식별자 |
| Request ID | IPC 한 번의 request/response 왕복을 묶는 식별자 |
| Operation ID | Timeout·재전송 뒤에도 같은 논리 mutation과 영구 결과를 묶는 idempotency 식별자 |
| Idempotency | 같은 operation을 중복 전달해도 상태 변경이 한 번만 일어나는 성질 |
| Optimistic version | 사용자가 본 snapshot version과 현재 row version을 비교해 stale mutation을 거부하는 방식 |
| Reconciliation | Disconnect, timeout 또는 response 유실 뒤 provider·DB의 현재 상태를 다시 읽어 일치시키는 과정 |
| `outcome_unknown` | Deadline 안에 response를 못 받아 성공·실패를 단정할 수 없는 상태. 같은 operation ID의 결과만 조회합니다. |
| `unknown` evidence | Riot/Discord 증거가 부족해 위반·정상을 판정할 수 없는 상태 |
| Deadline | 작업 하나가 완료돼야 하는 최대 시간. 초과하면 명시된 실패·unknown 계약을 적용합니다. |
| TTL | Request가 유효한 최대 기간. 만료된 mutation은 실행하지 않습니다. |
| Bounded retry | 횟수와 전체 시간이 미리 제한된 재시도. 무제한 재시도는 하지 않습니다. |
| Singleton | Discord Gateway bot과 scheduler의 active owner를 하나로 제한하는 lease |
| Feature flag | 배포와 기능 활성화를 분리하는 설정. 이 프로젝트에서는 exact `1`만 enable입니다. |
| Default-off | 새 기능·provider를 release에 포함하되 명시적 별도 승인 전 flag `0`으로 비활성화하는 상태 |
| PUUID | Riot 계정의 안정된 내부 식별자. Browser와 operational log에 노출하지 않습니다. |
| Riot ID | 사용자가 보는 `gameName#tagLine`. 변경 가능한 표시 metadata입니다. |
| RSO | Riot Sign On. 현재 연결은 RSO 소유권 검증이 아니라 관리자 승인 방식입니다. |
| Go Live | Discord Voice State의 streaming 상태. Twitch 상태를 뜻하지 않습니다. |

## Troubleshooting

이 절은 일반적인 설치 FAQ가 아니라 프로젝트를 실제로 진행하면서 architecture,
외부 platform과 production 환경에서 막혔던 문제를 기록합니다. 단순 증상보다
잘못된 가정, 확인된 root cause, 해결 방법과 이후의 운영 원칙을 남기는 것이
목적입니다.

### 분리 배포 경계가 세 번 연속 실패

처음에는 Vercel dashboard와 자가 host bot을 안전하게 연결하려 했습니다.
익명 outbound tunnel, 공유 PostgreSQL request/result, 계정 고정 managed
tunnel을 각각 별도 Spike로 실행했습니다. 세 경로 모두 local 왕복은
성공했지만 Vercel function에서는 약 10초 뒤 timeout됐고 5초 현재 역할 조회
기준을 한 번도 통과하지 못했습니다.

- Root cause: Vercel egress, runtime fetch, tunnel 또는 DB driver 중 하나로
  더 좁히지 못했습니다. 모르는 원인을 임의로 확정하지 않았습니다.
- 해결: 공급자만 바꾸는 네 번째 Spike를 중단하고 web과 bot을 한 지속 host에
  배치했습니다. Public web→bot API 대신 권한 제한 Unix socket을 사용합니다.
- 남긴 원칙: 실패한 Spike도 architecture를 단순화하는 유효한 결과입니다.
  Local 성공을 외부 platform 성공으로 일반화하지 않습니다.
- 증거:
  [직접 경계](docs/research/spikes/boundary-roundtrip-default-deny/README.md),
  [공유 저장소](docs/research/spikes/shared-store-outbound-pull/README.md),
  [managed tunnel](docs/research/spikes/named-managed-tunnel/README.md)

### Discord summary가 세 단계에서 연속으로 실패

실제 `/요약` smoke는 단일 결함이 아니라 서로 다른 세 경계를 차례로
드러냈습니다.

1. `messages.fetch()`가 배열이 아니라 Map 계열 `Collection`을 반환했는데
   adapter와 test fixture가 배열로 가정했습니다. Iteration 결과가
   `[id, message]` tuple이 되어 모든 page가 malformed로 거부됐습니다.
2. Collection 처리를 고친 뒤에는 Discord Developer Portal의 Message Content
   Intent와 runtime intent가 모두 빠져 message metadata만 있고 본문은
   비어 있었습니다.
3. Intent를 고친 뒤에는 “선택 범위에 메시지가 없음”을 “본문 권한이 없음”으로
   잘못 분류해 사용자에게 엉뚱한 권한 안내를 보냈습니다.

해결은 각각 실제 Map-shaped fixture와 `.values()`, Portal·runtime intent의
동시 활성화, `summary_range_empty`와 `summary_content_unavailable`의 분리였습니다.
Quota 예약과 provider 호출은 본문이 확인된 뒤에만 수행하도록 이동했습니다.

- 남긴 원칙: Test double은 외부 SDK의 실제 자료구조를 닮아야 합니다. 같은
  “빈 결과”라도 빈 범위, 권한 부재와 provider 실패를 다른 상태로 보존합니다.
- 증거:
  [Collection 수정](docs/operations/summary-history-collection-fix-result-2026-07-28.md),
  [Message Content 수정](docs/operations/summary-message-content-activation-result-2026-07-28.md),
  [빈 범위 분리](docs/operations/summary-empty-range-guidance-result-2026-07-28.md)

### OpenAI Spike가 application code가 아니라 release permission에서 실패

Staged build는 root와 `umask 077`로 만들어졌습니다. Release manager는
immutable하게 만들려고 write bit만 제거했지만 service user가 읽고 directory를
traverse할 권한은 복구하지 않았습니다. Root preflight는 통과했으나 bot user의
compiled module import가 provider request 전에 실패했습니다.

- 해결: Secret이 없는 release tree를 먼저 `a+rX`로 정규화한 뒤 모든 write
  bit를 제거했습니다. Fixture도 root가 아니라 실제 다른 user의 import와
  traversal을 확인하도록 확장했습니다.
- 남긴 원칙: Root가 읽을 수 있다는 사실은 service가 실행할 수 있다는 증거가
  아닙니다. Immutable과 unreadable은 다른 속성입니다.
- 증거:
  [OpenAI marker Spike 결과](docs/operations/openai-summary-marker-spike-pass-2026-07-28.md)

### OpenAI 합성 evaluator와 prompt의 계약이 서로 달랐음

첫 credentialed synthetic request는 strict JSON parsing까지 성공했지만 marker
검증에서 실패했습니다. Evaluator는 각 marker의 정확히 한 번 보존과 section
귀속을 요구했지만 adapter prompt와 schema에는 그 요구가 없었습니다. Provider
오류가 아니라 시험 oracle과 제품 계약의 불일치였습니다.

- 해결: Prompt와 evaluator가 하나의 marker preservation contract를 공유하게
  하고 omission, duplicate, wrong-section, unmarked item을 응답 원문 없이
  각각 회귀 테스트했습니다.
- 남긴 원칙: 실패한 test가 항상 implementation 결함을 뜻하지 않습니다.
  Test oracle도 같은 수준으로 검토해야 합니다.

### 최초 GitHub Actions production 배포가 activation 직후 rollback

Exact archive stage, build와 activation은 성공했지만 service restart 직후
단 한 번의 loopback health probe가 약 0.3초 만에 connection refused를 받아
배포가 실패했습니다. 자동 rollback으로 기존 release는 복구됐습니다.

- Root cause: Process failure가 아니라 restart와 health probe 사이의 startup
  readiness race였습니다.
- 해결: 5초 간격, 최대 12회의 bounded readiness helper를 추가하고 delayed
  start 성공과 timeout rollback을 fixture로 검증했습니다.
- 남긴 원칙: Process가 시작됐다는 사실과 요청을 받을 준비가 됐다는 사실을
  구분합니다. Retry는 횟수와 전체 시간이 고정돼야 합니다.
- 증거:
  [최초 production 배포 결과](docs/operations/first-github-actions-production-deployment-result-2026-07-29.md)

### Rollback이 `current`는 복구했지만 `previous`를 덮어씀

첫 failed activation에서 release manager는 activation 전에 `previous`를 당시
`current`로 바꿨습니다. 실패 뒤 `current`만 복구해 두 symlink가 같은 release를
가리키게 됐고 다음 배포의 rollback target이 사라졌습니다.

- 해결: Controller가 mutation 전의 `current`와 `previous`를 모두 기록하고
  실패 시 둘을 함께 복구하도록 수정했습니다. 이미 손상된 `previous`는 exact
  marker와 별도 Owner 승인으로 symlink 하나만 원자 복구했습니다.
- 남긴 원칙: Rollback은 서비스 health뿐 아니라 rollback capability 자체의
  postcondition도 검증해야 합니다. 이름이 아니라 immutable marker와 hash로
  대상을 확인합니다.
- 증거:
  [release link repair](docs/operations/production-release-link-repair-approval-request-2026-07-29.md)

### Lightsail SSH와 CloudShell 전달 경계가 불안정했음

Temporary Lightsail SSH material을 다루는 동안 certificate를 일반 public key
형식으로 저장해 OpenSSH가 `error in libcrypto`로 거부했고, 긴 controller
command는 CloudShell terminal receiver에 실제 제출되지 않은 채 timeout처럼
보이기도 했습니다. Browser paste가 의도하지 않은 local clipboard text를
hidden input에 넣은 적도 있었습니다.

- 해결: AWS가 반환한 공식 `*-cert.pub` 형식을 그대로 사용하고, SSH option과
  timeout을 shared bounded library로 고정했습니다. 긴 실행은 access, transport,
  remote entry와 application stage로 잘게 분리해 fixed PASS/FAIL label만
  반환하고 첫 실패에서 재시도 없이 cleanup했습니다.
- Architecture 단순화: 단일 host 배포에 AWS OIDC와 temporary access control
  plane이 과도하다고 판단해 Owner 승인으로 전용 repository-secret SSH key와
  pinned known-host 경계로 교체했습니다.
- 남긴 원칙: UI automation에서 “명령을 보냈다”는 가정은 증거가 아닙니다.
  Remote entry label과 postcondition이 있어야 실행으로 인정합니다.

### Migration checksum이 line ending과 역사적 오기에 막힘

Production migration ledger에는 CRLF rendering checksum과 migration `0005`의
SHA-256 두 글자가 빠진 62자리 값이 남아 있었습니다. 새 runner가 canonical
source만 비교하자 migration resume가 안전하게 중단됐습니다.

- 해결: 새 ledger는 canonical LF checksum만 기록하고, 기존 row는 SQL 내용이
  동일한 LF/CRLF rendering만 허용했습니다. Version 5 오기는 exact version과
  canonical SQL이 모두 일치하는 경우에만 좁게 허용했습니다.
- 하지 않은 일: Production ledger나 이미 적용된 migration SQL을 “맞는 값”으로
  조용히 다시 쓰지 않았습니다.
- 남긴 원칙: Migration history는 수정 대상이 아니라 호환성 입력입니다.
  예외는 넓은 skip이 아니라 exact historical evidence에 묶습니다.

### Backup service는 성공했지만 marker가 invalid JSON이었음

Schema version query가 migration ledger의 `1`, `2` 두 행을 반환했고 shell
interpolation이 이를 `1\n2`로 기록했습니다. Backup service는 exit `0`이었지만
publication marker는 JSON이 아니어서 application rollout preflight가
중단됐습니다.

- 해결: `max(version)` 한 값만 읽고 positive integer, single-line, row count와
  JSON shape를 encryption·publication 전에 검증했습니다.
- 남긴 원칙: Job 성공과 artifact 유효성은 별도입니다. `published`도 실제 빈
  target restore 전에는 `verified`가 아닙니다.
- 증거:
  [backup·restore runbook](docs/operations/backup-restore-runbook.md)

### Gateway startup에서 전체 member fetch가 겹침

Bot startup member reconciliation이 아직 pending인데 game observation voice
adapter가 별도의 전체 member fetch를 즉시 시작했습니다. Discord
`RequestGuildMembers` rate limit 구간에서 두 경계가 함께 실패해 feature
activation이 readiness를 통과하지 못하고 rollback됐습니다.

- 해결: Observation adapter는 Gateway reconciliation이 `current`가 될 때까지
  최대 60초 bounded 대기한 뒤 attach합니다. Rate limit은 provider의
  `retry_after`를 검증해 사용하고 최종 attempt의 원본 오류를 보존합니다.
- 남긴 원칙: 같은 provider의 비싼 reconciliation을 startup에서 중복 실행하지
  않습니다. 고정 retry delay보다 provider가 준 bounded retry 정보를
  우선합니다.

### 오래된 Discord Voice cache가 여러 경기에서 새 관측처럼 재사용됨

2026-07-31 04:31 KST 검거 알림 전후를 익명으로 대조했을 때 네 번의 솔로랭크
경기는 Riot Spectator에서 각각 관측됐지만 검거 stack은 한 번만 증가했습니다.
Discord 방송은 실제로 켜지지 않았는데도 일부 후속 경기는 이전 `active` 상태를
계속 재사용해 compliant로 판정됐습니다.

- Root cause: Gateway event의 실제 source 관측 시각과 30초 poll 처리 시각을
  구분하지 않아 cached Voice State가 poll 때마다 최신 evidence처럼 저장됐습니다.
  또한 정상 Gateway에서는 bounded reconciliation을 하지 않았고, grace 안에
  Spectator에서 사라진 경기에는 violation을 확정할 post-grace evidence가
  없었습니다.
- 해결: Discord Voice evidence에 `source_observed_at`을 별도로 전달하고 3분을
  넘은 cached active는 `unknown`으로 처리합니다. 2분마다 대상 guild만
  reconciliation하며 single-flight, generation 기반 late-result 거부와
  실패·timeout의 `unknown` 처리를 적용합니다. Grace 안에서 끝난 경기는 자동
  검거하지 않고 향후 Match-V5 사후 검증 대상으로 분리합니다.
- 남긴 원칙: 처리 시각은 source 관측 시각의 대체물이 아닙니다. Freshness도
  evidence 계약의 일부이며, post-grace 증거가 없다는 이유만으로 violation을
  추론하지 않습니다.
- 증거:
  [ADR-0028](docs/adr/ADR-0028-fresh-discord-voice-evidence.md),
  [PLAN-0014](docs/implementation/PLAN-0014-fresh-discord-voice-evidence.md)

### Production merge가 승인 전에 자동 deploy를 시작함

PLAN-0014는 stage, migration과 activation을 별도 Owner gate로 진행했지만
production PR merge가 `push` 기반 `Deploy production` workflow를 즉시
시작했습니다. 승인 범위 밖이라 원격 build 중 취소했으며, read-only 확인에서
activation/restart는 없고 비활성 release와 임시 디렉터리만 남은 것을 확인해
정확한 대상만 제거했습니다.

- 임시 대응: 자동 run을 즉시 취소하고 current/previous, unit, PID, schema와
  health를 read-back한 뒤 승인된 staged candidate만 수동 activation했습니다.
- 남은 해결: Production push와 activation을 분리하도록 기존 GitHub deployment
  ADR을 재검토하고, manual dispatch 또는 required reviewer gate를 별도
  architecture decision으로 확정해야 합니다.
- 남긴 원칙: Branch merge 권한은 production activation 권한을 암묵적으로
  포함하지 않습니다. Workflow trigger도 승인 경계의 일부입니다.

### Activation verifier가 정상 Gateway를 journal 누락으로 실패 처리함

최종 activation 뒤 Gateway health는 240초 동안 다섯 번 모두 connected/FRESH
였지만 verifier가 Gateway 연결 완료 이후의 시각부터 journal을 조회해
`gateway.state` 행이 없다는 이유로 실패했습니다. Rollback 성공 출력과 실제
symlink read-back도 일치하지 않아 출력만으로 상태를 추정하지 않았습니다.

- 해결: 실제 current/previous를 별도 read-only로 확인하고, 이미 active인
  candidate를 다시 restart하지 않은 채 schema, effective settings, Gateway
  health와 두 reconciliation interval을 최종 검증했습니다.
- 남긴 원칙: Event가 검색 구간에 없다는 것은 실패 event가 아닙니다. Transition
  log와 current health snapshot을 구분하고 mutation 뒤에는 symlink를 직접
  read-back합니다.

### macOS에서만 Unix socket test가 `EINVAL`

기본 macOS temporary directory 경로가 길어 PostgreSQL·Unix socket path
상한을 넘었습니다. Application logic 결함은 아니었고 짧은 `/tmp`에서 동일
suite가 통과했습니다.

- 해결: Local full suite는 `TMPDIR=/tmp npm test`를 표준 명령으로 사용합니다.
  Linux permission·systemd·GNU tool 계약은 Ubuntu fixture와 CI에서 별도로
  검증합니다.
- 남긴 원칙: 환경 차이를 test skip이나 application workaround로 숨기지 않고
  어느 platform이 어떤 계약의 authority인지 명시합니다.

### 공통적으로 효과가 있었던 대응 방식

- 실패 즉시 같은 실행을 반복하지 않고 승인된 stop condition에서 중단했습니다.
- Provider 원문·credential·Discord content 대신 fixed reason code와 stage
  label만 기록했습니다.
- Read-only preflight와 mutation을 분리하고, mutation은 exact candidate,
  hash, backup, rollback target과 Owner 승인을 요구했습니다.
- Temporary credential, archive, container, CloudShell file과 socket은 같은
  실행에서 제거하고 최종 absence를 postcondition으로 확인했습니다.
- AI agent의 추론은 증거와 분리했습니다. 원인을 좁히지 못했으면 `UNKNOWN`으로
  남기고 architecture를 불필요하게 확장하지 않았습니다.

## 보안 원칙

- 최소 권한, 기본 거부, 서버 측 권한 검증
- 외부·browser·IPC·DB 경계의 exact schema와 입력 검증
- OAuth state, exact redirect URI, Secure/HttpOnly/SameSite cookie와 CSRF
- 고위험 작업의 15분 이내 OAuth, 현재 역할과 명시적 확인
- Web, bot, migration과 backup capability 분리
- Secret을 Git, log, chat, shell history, argv와 일반 environment에 저장 금지
- Discord 원문, generated summary, PUUID와 불필요한 identifier의 log 금지
- 감사 원장 1년과 operational journal 30일의 목적·권한 분리
- 암호화 off-site backup과 실제 restore rehearsal
- Production mutation, credential, migration과 activation의 별도 Owner gate

보안 문제를 발견하면 수정 범위를 좁히기 위해 통제 자체를 제거하지 않습니다.
자세한 기준은 [`docs/standards/security.md`](docs/standards/security.md),
[`docs/standards/logging.md`](docs/standards/logging.md)와
[`docs/standards/data.md`](docs/standards/data.md)를 따릅니다.
