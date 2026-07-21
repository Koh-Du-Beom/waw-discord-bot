# 구현 계획: 단일 지속 server 경계 기초 계약

- Status: Draft
- Related requirements: `OWN-034`, `OWN-026`~`OWN-033`, `OPS-001`~`OPS-008`, `SEC-007`~`SEC-010`
- Related ADRs: [`ADR-0001`](../adr/ADR-0001-single-persistent-server-boundary.md), [`ADR-0004`](../adr/ADR-0004-typescript-node-discordjs.md), [`ADR-0005`](../adr/ADR-0005-single-server-host-candidates.md), [`ADR-0006`](../adr/ADR-0006-supabase-free-postgresql-storage.md)
- Owner: Project owner

## 목표

첫 MVP의 web·bot을 하나의 지속 server 배포 경계에 둘 수 있도록 local boundary 계약, 권한 분리와 health/복구 관측의 최소 기초를 구현한다. 이 계획은 host, runtime, SDK, 저장소와 운영 배포를 선택하지 않는다.

## 범위

- web 요청이 호출할 수 있는 local role-query와 command service의 명시적 계약
- browser session과 bot token 접근 권한을 분리하는 process/module 경계 문서와 테스트 fixture
- operation id, authorization 결과, dedupe 결과와 timeout/error의 감사 가능한 최소 구조
- `/health`와 bot Gateway lifecycle의 상태를 혼동하지 않는 health contract
- 선택 host의 crash/restart 검증에 사용할 관측 명령과 acceptance criteria

## 범위 제외

- Discord Gateway 실제 credential, OAuth client secret과 운영 데이터
- Node/Python/SDK 최종 선택과 production dependency 추가
- host/provider/OS, TLS certificate 발급, DNS 변경과 운영 배포
- backup 저장소 선택과 실제 복구 실행
- KBO 기능과 Riot Production/RSO 연동

## 선행 조건

- D-08 ADR-0001 Accepted
- D-04 runtime/SDK clean-install 및 Gateway disconnect/Resume Spike 결과
- D-09 host capacity Spike와 비용·복구 결과
- D-05 ADR-0006 Accepted
- D-07 session·workload 인증 후보에 대한 별도 Accepted 결정
- 테스트에서 사용할 비밀 없는 합성 Discord role/event fixture

## 작업

### Task 1

- 목적: local boundary의 request/response schema, authorization, idempotency와 error contract를 정의한다.
- 변경 예상 파일: `docs/contracts/`, `docs/implementation/`의 계약 문서와 선택 runtime의 schema test
- 테스트: 합성 request의 허용/거부, 만료, replay, duplicate operation과 malformed payload
- 완료 기준: public endpoint 없이 같은 host에서 계약 테스트가 반복 통과하고, 각 failure가 감사 가능한 결과를 만든다.
- 위험: local call이라는 이유로 trust-boundary 검증이 생략될 수 있음
- 롤백: 새 계약 파일과 테스트만 revert; 기존 연구·ADR은 변경하지 않음

### Task 2

- 목적: web·bot process/module 권한 매트릭스와 secret 접근 경계를 구현 가능한 설정으로 변환한다.
- 변경 예상 파일: 선택 host/process 설정, `docs/operations/` 권한 표와 runbook
- 테스트: web fixture가 bot token을 읽지 못함, bot fixture가 필요한 local operation만 수행함, 로그 redaction
- 완료 기준: 최소 권한 검사가 자동화되고 secret·Discord 원문이 테스트 출력에 남지 않는다.
- 위험: process 분리가 단일 host 장애를 줄이지 않으므로 crash/restart 시험이 필요함
- 롤백: 권한 설정을 직전 버전으로 복원하고 새 process를 중지

### Task 3

- 목적: `/health`, Gateway lifecycle, process restart와 singleton 관측을 하나의 운영 검증 절차로 연결한다.
- 변경 예상 파일: `docs/operations/`, 선택 runtime의 health adapter와 검증 script
- 테스트: 정상, Gateway disconnect/Resume, bot crash, web-only failure, duplicate start와 stale heartbeat 합성 시험
- 완료 기준: health가 dependency 상태를 과장하지 않고, duplicate bot process가 실패하며, 재시작·복구 시간이 기록된다.
- 위험: 실제 Discord Gateway credential 없는 fixture 결과를 운영 보장으로 오해할 수 있음
- 롤백: 관측 adapter와 script를 제거하고 기존 health endpoint로 복원

## 검증 계획

각 Task를 독립 커밋으로 구현하고, 먼저 합성·단위 시험을 실행한다. 선택 runtime/host가 Accepted된 뒤 clean install, 실제 Gateway disconnect/Resume, crash/restart, backup restore와 비용 검증을 별도 승인 범위에서 실행한다. 실패 시 결과를 버리지 않고 조건과 재현 명령을 연구 문서에 기록한다.

## 배포 및 마이그레이션

이 Draft 단계에서는 운영 배포나 DNS/network 변경을 수행하지 않는다. Accepted 이후에도 preview 또는 폐기 가능한 host에서 단일 bot singleton과 health를 검증한 뒤에만 운영 배포 계획을 별도로 작성한다.

## 문서 갱신

- `PROJECT_STATUS.md`: 각 Task의 상태, 증거, 미해결 decision gate
- D-04/D-09 research: capacity·SDK·Gateway 결과와 한계
- `docs/operations/deployment-and-security.md`: process 권한, health, restart와 secret 경계
- ADR-0001: 조건 변경 시에만 superseding ADR 작성

## 승인

- Owner decision: Pending — D-04/D-09 및 D-05/D-07 선행 결과 확인 후 이 구현 계획 승인 필요
- Approved date: Pending
