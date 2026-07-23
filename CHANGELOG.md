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

### Changed

- `PLAN-0002` Tasks 1~3을 실제 production publication·restore rehearsal 증거로 완료
- `PLAN-0003` Tasks 1~4를 local contract, disposable Spike, production-free assets와 backup-only production monitoring rollout 증거로 완료
- 현재 계약 구현과 실제 미구현 adapter/route/runtime 경계를 명시하고 production operator, DB size·backup freshness 경보와 non-zero restore rehearsal gate를 계획에 추가
- `PLAN-0004`를 승인하고 Task 1 local/disposable PostgreSQL RED→GREEN을 완료하되 G1 production migration은 별도 owner gate로 유지
- Production read-only preflight에서 legacy version 1 schema를 확인하고 migration을 baseline `0001` + forward `0002`로 교정
- Owner-approved G1에서 새 encrypted pre-migration archive를 publish하고, offline owner identity가 필요한 empty-target restore 전 migration을 정지

### Fixed

- 없음
