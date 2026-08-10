# 구현 계획: Discord KBO 베팅 접수 명령

- Status: Completed
- Related requirements: `FUN-025`, `OWN-041`, `OWN-044`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0029`
- Owner: Product owner

## 목표

기존 `/베팅 가입`을 유지하면서 `/베팅 하기`의 경기 ID·결과·금액·선택 점수를
정규화해 원자 registration store로 전달하고 호출자에게만 고정 결과를 응답한다.

## 범위

- Discord slash definition과 interaction normalization
- 베팅 command executor와 기존 가입 executor의 작은 composite
- 기능·권리 exact flag가 모두 `1`일 때만 접수 허용
- 고정된 성공·거부·실패 응답과 기존 command audit
- local fake Discord/runtime 조립과 테스트

## 범위 제외

- Discord REST 실제 등록, production feature flag 활성화
- 경기 목록/autocomplete, 외부 parser와 game ingestion
- 정산·무효·정정·랭킹

## 선행 조건

1. client 금액·날짜·market version·잔액을 신뢰하지 않는다.
2. 점수는 둘 다 입력하거나 둘 다 생략한다.
3. `WAW_KBO_BETTING_ENABLED=1`과 `WAW_KBO_DATA_RIGHTS_AUTHORIZED=1`이 모두
   있어야 store를 호출하고 나머지는 default-off다.
4. option 값은 command audit·운영 log에 저장하지 않는다.

## 작업

### Task 1: slash command와 source/local runtime 연결

- 목적: 검증된 registration store까지의 사용자 경로를 완성한다.
- 변경 예상 파일: command definition/handler/executor, `src/bot/main.ts`, 대상 test,
  `PROJECT_STATUS.md`, 이 계획
- 테스트: option normalization, 성공, 각 고정 denial, malformed 입력, 두 flag의
  default-off/invalid 값, fake Discord 조립
- 완료 기준: 대상 test, 전체 test, typecheck, build와 diff check 통과
- 위험: canonical game ID를 사용자가 알아야 하므로 경기 조회 command 전에는
  production flag를 켜지 않는다.
- 롤백: 두 flag를 off로 유지하고 `/베팅 하기` 등록을 제외한다.

## 검증 계획

- 대상 unit/fake Discord test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## 배포 및 마이그레이션

없다. Discord REST 등록·Production 배포·flag 활성화는 수행하지 않는다.

## 문서 갱신

- 구현 결과와 검증 evidence
- `PROJECT_STATUS.md`

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- `/베팅 가입`을 유지하면서 `/베팅 하기`의 경기 ID, 결과, 금액과 선택 점수를
  Discord interaction에서 정규화해 기존 원자 registration store로 전달합니다.
- 두 production gate가 exact `1`일 때만 store를 호출하며, 누락·오입력·비활성
  상태는 모두 default-off입니다.
- 대상 test `15/15`, 전체 test `332 pass / 7 기존 환경 skip / 0 fail`,
  typecheck, production build와 diff check가 통과했습니다.
- Discord REST 등록, Production 배포·migration과 feature 활성화는 수행하지
  않았습니다.
