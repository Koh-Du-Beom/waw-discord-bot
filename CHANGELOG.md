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

### Changed

- `PLAN-0002` Tasks 1~3을 실제 production publication·restore rehearsal 증거로 완료
- `PLAN-0003` Tasks 1~3을 local contract, disposable Spike와 production-free Ubuntu 24.04 dry-run 증거로 완료

### Fixed

- 없음
