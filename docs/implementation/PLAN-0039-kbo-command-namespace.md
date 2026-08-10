# PLAN-0039: KBO Discord command namespace

- Status: Source/local implemented; Production not registered
- Owner decision: 2026-08-10
- Scope: Discord command tree, interaction normalization and help text only

## Decision

세 KBO root command를 `/크보` 하나의 subcommand group tree로 합친다.

- `/크보 크레딧 내정보|받기`
- `/크보 베팅 가입|하기|경기|내역`
- `/크보 랭킹 크레딧|결과|점수|적중률`

Discord 입력 경계는 group과 subcommand를 기존 내부 command 이름으로 정규화한다.
Executor, audit 이름, schema, persistence와 feature flag 계약은 변경하지 않는다.
Legacy public root `/크레딧`, `/베팅`, `/랭킹`은 등록하지 않는다.

## Verification and rollout boundary

- Command tree가 root `크보`와 정확한 세 group만 포함한다.
- 모든 KBO interaction이 기존 내부 command와 ephemeral response로 dispatch된다.
- 도움말은 새 public path만 표시한다.
- 전체 suite의 기능 결과 `395 PASS / 7 existing environment skips`, typecheck, build와
  Production application asset 검사를 통과한다. macOS의 긴 default temp socket
  path는 `TMPDIR=/tmp` IPC 재실행으로 분리한다.
- Production Discord REST 등록 전 새 immutable release, CI, payload hash와 rollback
  JSON을 고정한다. KBO flags `0/0/0`은 유지한다.
