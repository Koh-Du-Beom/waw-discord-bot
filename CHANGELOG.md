# 변경 이력

사용자에게 의미 있는 변경사항을 기록합니다.

## Unreleased

### Added

- 프로젝트 정책 및 AI 개발 워크플로우
- 연구, Spike, ADR, 구현, 버그 수정, 검토와 배포 프롬프트
- 코딩, 테스트, 로그, 데이터와 보안 기준
- 관리자 대시보드 운영 도메인 `waw.dubeom.com`
- backup-only PostgreSQL credential, `age` encrypted S3 publication scripts, Put-only writer/exact-object restore reader policies와 일일 systemd scheduler
- production logical dump의 byte/hash continuity와 disposable PostgreSQL 17 restore 검증 절차
- 30일/1GiB journald drop-in, file-credential Discord monitor service/timer, reversible installer와 alerting runbook
- Supabase/OAuth/Fastify·React/Gateway/systemd·Caddy production 구현을 7개 owner-gated Task로 나눈 `PLAN-0004` Draft
- Transactional PostgreSQL migration runner, workload RLS/grants, session·OAuth·role-cache·operation/audit persistence adapter와 systemd database credential loader
- Production legacy version 1 fingerprint adoption과 forward `0002` application persistence migration
- PLAN-0004의 production 중단점, offline identity handoff와 단일 재개 프롬프트
- Strict Fastify dashboard API, accessible React dashboard states, fake
  Gateway lifecycle, singleton lease와 discord.js signal adapter
- Separate web/bot systemd units, `LoadCredential=` isolation, immutable release
  fixture, conflict-safe Caddy assets와 disposable AWS integration runner
- MFA·서울 region·exact instance ARN으로 제한한 production operator IAM
  policy template, deterministic renderer/test와 Task 6 deployment runbook
- Separate systemd users 사이의 current-role 강제 재조회를 credential 공유나
  TCP listener 없이 제공하는 Unix socket IPC Proposed ADR
- Production web/bot entrypoints, dashboard setting/audit migration, staged
  loopback health/Caddy assets and immutable release stage/activate/rollback
  tooling

### Changed

- Authentication can now use a fail-closed, versioned local current-role reader
  without receiving Discord member or role payloads in the web process.
- Dashboard setting mutations now carry the authenticated actor and operation
  correlation into one PostgreSQL setting/operation/audit transaction.
- Production backup publication now selects and validates one latest migration
  version before serializing JSON; the malformed multi-row marker discovered
  during G5 preflight was replaced by a valid schema-version-2 encrypted
  publication.
- `PLAN-0002` Tasks 1~3을 실제 production publication·restore rehearsal 증거로 완료
- `PLAN-0003` Tasks 1~4를 local contract, disposable Spike, production-free assets와 backup-only production monitoring rollout 증거로 완료
- 현재 계약 구현과 실제 미구현 adapter/route/runtime 경계를 명시하고 production operator, DB size·backup freshness 경보와 non-zero restore rehearsal gate를 계획에 추가
- `PLAN-0004`를 승인하고 Task 1 local/disposable PostgreSQL RED→GREEN을 완료하되 G1 production migration은 별도 owner gate로 유지
- Production read-only preflight에서 legacy version 1 schema를 확인하고 migration을 baseline `0001` + forward `0002`로 교정
- Owner-approved G1에서 새 encrypted pre-migration archive를 publish하고, offline owner identity가 필요한 empty-target restore 전 migration을 정지
- Dashboard API, UI와 bot runtime 병렬 결과를 단일 local integration으로 통합
- G4 owner-approved Ubuntu 24.04/1GB integration에서 PostgreSQL health,
  credential/process isolation, singleton, crash/storage failure, rollback과
  reboot recovery를 검증하고 AWS/CloudShell artifact를 전부 정리
- G5 전 단계에서 production operator allowlist를 inventory와 temporary SSH
  access로만 제한하고 IAM/S3/DNS/snapshot/firewall/lifecycle 권한을 제외
- Owner-approved production console read-only inventory에서 exact host의
  state/capacity/network/firewall/alarm baseline을 기록하고 변경 없이 종료
- Root CloudShell read-only 조회로 exact Lightsail UUID를 확정하고 production
  operator policy의 exact-target rendering/hash/allowlist를 로컬 검증

### Fixed

- Current-role IPC rejects unknown/oversized frames, request mismatches,
  unavailable sockets, and unsafe stale regular-file or symlink targets.
- Production systemd units no longer start disposable integration fixtures;
  the G4 installer uses separate fixture-only units.
- Fresh Caddy package default takeover, service-readable immutable release mode,
  PostgreSQL peer role, runtime credential inspection과 crash health readiness
  경합을 disposable host evidence에 맞게 보정
