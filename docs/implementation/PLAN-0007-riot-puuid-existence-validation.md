# 구현 계획: Riot PUUID existence validation

- Status: Approved
- Related requirements: OWN-007, OWN-015, PRI-002
- Related ADRs: `ADR-0018` (Accepted)
- Owner: Product owner

## 목표

승인된 Riot Personal application의 Account API를 bot 전용 credential로
연결하고, 관리자 승인 mutation을 소유권 오표현 없이 fail-closed로 검증한다.

## 범위

- Account API PUUID 존재 검증 adapter
- bot main 조립과 systemd `riot-api-key` credential
- 단위·통합·redaction·systemd 검증
- immutable release candidate와 Gate D 검증

## 범위 제외

- RSO 또는 공식 소유권 검증
- Riot ID에서 PUUID를 찾는 사용자 입력 경로
- Spectator/Match polling 활성화
- 공개 서비스 또는 Personal-key 한도 증액

## 선행 조건

- ADR-0018 Accepted
- owner가 Personal API credential의 production bot 전용 배치를 승인
- 실제 승인 mutation에는 owner가 승인한 본인 테스트 요청과 PUUID 사용

## 작업

### Task 1 — adapter 계약

- 목적: bounded fetch와 normalized failure semantics 구현
- 변경 예상 파일: `src/riot/riot-puuid-validator.ts`, 대응 test
- 테스트: match, mismatch, 404, platform, provider failures, timeout,
  redirect, malformed/oversized body, secret/identifier canary
- 완료 기준: 유효한 exact match만 normalized PUUID 반환
- 위험: identifier 포함 URL의 오류 반사
- 롤백: adapter 제거

### Task 2 — bot credential 조립

- 목적: `riot-api-key`를 bot process에만 주입
- 변경 예상 파일: `src/bot/main.ts`, `deploy/systemd/waw-bot.service`,
  credential/isolation tests와 운영 문서
- 테스트: missing/invalid credential fail-closed, web/cross-user read denial,
  environment/argument/journal canary
- 완료 기준: web은 credential을 받지 않고 bot만 adapter 사용
- 위험: 시작 실패가 Gateway 가용성에 영향
- 롤백: unit credential 항목과 adapter 조립 제거

### Task 3 — release와 Gate D

- 목적: immutable 후보 배포와 관리자 mutation/reconciliation 검증
- 변경 예상 파일: rollout evidence와 project status
- 테스트: source/archive hash, unit verify, health, invalid/valid/stale/
  duplicate/reconciliation, audit allowlist, identifier-free logs
- 완료 기준: 승인 mutation이 `admin_approved_unverified`를 생성하고 durable
  result가 재조회되며 rollback 경로가 검증됨
- 위험: 잘못된 실제 요청 승인
- 롤백: 이전 release 전환, bot restart, credential source 보존 또는 revoke

## 검증 계획

- `npm run typecheck`
- adapter와 admin application 관련 test
- 전체 `npm test`
- `systemd-analyze verify`
- production metadata-only preflight, Gate C, Gate D, final health

## 배포 및 마이그레이션

DB migration은 없다. root-only source credential을 atomic install하고 bot
unit에만 `LoadCredential=`로 전달한다. 이전 release와 credential-free unit을
rollback 대상으로 유지한다.

## 문서 갱신

- admin command IPC production rollout
- deployment/security credential inventory
- PROJECT_STATUS와 CHANGELOG
- production rollout evidence

## 승인

- Owner decision: Approved for implementation, production bot-only credential
  placement, release candidate creation, and Gate C/D validation using only an
  owner-approved test request.
- Approved date: 2026-07-27
