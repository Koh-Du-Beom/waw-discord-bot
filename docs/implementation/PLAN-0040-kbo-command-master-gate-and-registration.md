# PLAN-0040: KBO command master gate와 안전한 Discord 등록

- Status: Source complete
- Related requirements: `/크보` 전체를 등록 전에 fail-closed로 만들 것
- Related ADRs: ADR-0029, ADR-0032
- Owner decision: 2026-08-10 기술 선택과 production 직전 구현 승인

## 목표

Discord에 `/크보` command tree를 등록해도 별도 master flag 승인 전에는 가입,
일일 크레딧과 조회를 포함한 모든 하위 명령이 persistence 접근 전에 차단된다.
등록은 exact payload와 현재 root를 확인하고 실패하면 이전 payload를 복원한다.

## 범위

- exact `WAW_KBO_COMMANDS_ENABLED=0|1` parser와 공통 router gate
- Production systemd default `0`과 asset 계약
- secret 비출력 Discord guild command register/verify/restore 도구
- 회귀, CI와 activation 문서

## 범위 제외

- Production release/flag/Discord REST 변경
- 관찰되지 않은 외부 KBO 정상 경기·정정 schema의 추측 구현
- Gate 0의 데이터 권리·Discord 정책·법률 승인 대체

## 완료 기준

- master `0`에서 모든 KBO 내부 command가 delegate/store 호출 없이 같은 고정 오류다.
- master `1`에서 기존 credit/betting/ranking routing이 유지된다.
- 등록 도구가 current roots와 desired SHA-256을 검증하고 PUT 후 exact read-back 실패 시
  root-only rollback payload를 즉시 복원한다.
- 전체 test, typecheck, build, Production asset과 diff check가 통과한다.
- PR CI가 통과한 immutable source candidate를 기록한다.

## 롤백

Source rollback은 master gate commit을 revert한다. Discord 등록 rollback은 등록 직전
저장한 payload를 같은 도구의 `restore` action으로 PUT하고 exact read-back한다.
