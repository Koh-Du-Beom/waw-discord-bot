# 구현 계획: 관측된 몰랭 위반 자동 확정

- Status: Production activation in progress
- Related requirements: FUN-010, FUN-013, FUN-015
- Related ADRs: ADR-0016, ADR-0027
- Owner: Product owner

## 목표

최초 `violation` 관측을 같은 transaction에서 `confirmed` 사건으로 확정해 공개
알림, 상세 현황과 1스택 집계를 일치시킨다.

## 범위

- 최초 위반의 `open → confirmed` 전이
- 종료를 포함한 후속 관측에서 확정 판정 보존
- PostgreSQL 통합 회귀와 기존 알림 회귀
- 상태 및 운영 문서 갱신
- exact release에 묶인 read-only production preflight와 reversible 활성화

## 범위 제외

- Match-V5 사후 경기 복구
- 기존에 덮어써진 과거 사건의 일괄 복원
- process restart를 견디는 알림 outbox
- 실제 솔로랭크 사용자 smoke

## 선행 조건

- ADR-0016과 ADR-0027 Accepted
- production 변경은 별도 배포 승인과 read-back 필요

## 작업

### Task 1: 사건 전이와 회귀

- 목적: 최초 위반을 확정하고 후속 종료 관측의 downgrade를 차단한다.
- 변경 예상 파일: observation store와 PostgreSQL integration test
- 테스트: violation 전이, 후속 inactive, 한 스택, 중복 알림
- 완료 기준: 동일 사건이 `confirmed/violation`과 1스택을 유지한다.
- 위험: 기존 open incident와의 호환
- 롤백: store 변경만 되돌리고 기존 데이터는 보존

### Task 2: 문서와 전체 검증

- 목적: 미구현으로 남아 있던 자동 전이 상태와 남은 운영 gate를 정정한다.
- 변경 예상 파일: `PROJECT_STATUS.md`, `CHANGELOG.md`, 관련 계획
- 테스트: 전체 test, typecheck, build, diff check
- 완료 기준: 결과와 미검증 production 범위가 문서에 일치한다.
- 위험: 운영 활성화를 구현 완료로 오인
- 롤백: 코드 rollback과 별개로 실제 상태를 문서에 유지

### Task 3: Production 배포와 활성화

- 목적: exact production release와 Discord alert 권한을 읽기 전용으로 확인한
  뒤 관측 flag만 reversible systemd drop-in으로 활성화한다.
- 변경 예상 파일: owner-dispatched workflow, remote manager와 고정 출력 verifier
- 테스트: synthetic manager fixture, Discord permission self-test, CI, deployment
  health와 activation read-back
- 완료 기준: exact release가 배포되고 flag `1`, alert channel View/Send 권한,
  bot/Gateway/canonical health가 확인된다.
- 위험: bot restart, Riot/Discord 외부 장애, 공개 알림 전송 실패
- 롤백: activation drop-in 제거, daemon reload, bot restart와 health 재검증

## 검증 계획

- 임시 PostgreSQL 17에서 migrations 0001–0010을 적용해 실제 transaction과
  stack query를 검증한다.
- fake scheduler로 첫 위반 1회만 공개 알림을 요청하는 기존 회귀를 유지한다.
- 전체 test, typecheck와 build를 실행한다.

## 배포 및 마이그레이션

스키마 변경은 없다. Normal production workflow로 exact release를 먼저 배포한
뒤 별도 owner-dispatched workflow가 현재 release와 rollback, service/timer,
local/canonical health, Riot credential 존재, alert channel의 guild/type과
View/Send 권한을 읽기 전용으로 검증한다. 그 다음에만
`WAW_GAME_OBSERVATION_ENABLED=1` drop-in을 설치한다.

## 문서 갱신

- ADR-0027
- 이 계획
- `PROJECT_STATUS.md`
- `CHANGELOG.md`

## 승인

- Owner decision: 진단과 제안된 교정 경로를 확인한 뒤 작업 진행을 지시함.
- Approved date: 2026-07-30
- Owner amendment: exact production read-only preflight, application 배포,
  관측 flag와 alert channel 검증 후 활성화를 승인함. 실제 솔로랭크 smoke는
  사용자가 별도로 수행함.

## 진행 결과

- 임시 PostgreSQL 17에서 `grace/open → violation/confirmed`, 기존
  `open/violation` 호환 전이, 후속 active·inactive 관측의 확정 판정 보존과
  사용자 1스택을 검증했다.
- 공개 알림과 scheduler 대상 회귀 `8/8`이 통과했다.
- `TMPDIR=/tmp npm test`는 `289 pass / 7 explicit PostgreSQL skips / 0 fail`,
  typecheck, server/web build와 `git diff --check`가 통과했다.
- 기본 macOS 임시 경로에서는 Unix socket 길이 제한으로 무관한 IPC 테스트
  1건이 `EINVAL`로 실패했으며 짧은 `/tmp` 경로 재실행에서 통과했다.
- Production 배포, 관측 flag·알림 채널 변경과 실제 Discord/Riot smoke는
  수행하지 않았다.
