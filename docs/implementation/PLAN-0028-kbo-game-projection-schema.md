# 구현 계획: KBO canonical 경기 projection schema

- Status: Completed (source/local only)
- Related requirements: `FUN-021`, `FUN-022`, `FUN-025`~`FUN-029`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0026`, `PLAN-0027`
- Owner: Product owner

## 목표

외부 응답 형식을 베팅·정산 schema에 직접 퍼뜨리지 않도록 최소 canonical 경기와
불변 revision schema를 additive migration으로 만든다. 관찰되지 않은 설윤 정상
경기 parser와 production ingestion은 구현하거나 활성화하지 않는다.

## 범위

- 내부 경기 ID와 allowlist source의 안정적 경기 ID 매핑
- competition/season, 홈·원정 팀, 예정 시작 시각, 상태와 선택적 점수
- 현재 revision, market version, source/수집 시각과 parser version
- 정규화된 revision snapshot과 source message 중복 방지
- 기존 `kbo_bet.game_id` FK 추가
- RLS, bot/web 최소 권한, migration runner와 disposable PostgreSQL 검증

## 범위 제외

- 설윤 정상 경기 parser·Gateway listener와 production feature flag 활성화
- 팀 이름·경기 ID 추정, 정상 경기 fixture를 실제 관찰로 오인하는 처리
- 베팅 transaction, 정산·무효·정정 worker와 Discord UI
- Production migration·배포

## 선행 조건

1. 운영 ingestion은 정상 경기 schema·안정적 ID·허가 gate가 통과할 때까지 off다.
2. 원문 Components V2 payload는 저장하지 않고 정규화 필드와 fingerprint만 둔다.
3. 알 수 없는 상태를 허용된 정상 상태로 추정하지 않는다.
4. 새 dependency나 범용 provider abstraction을 추가하지 않는다.

## 작업

### Task 1: additive schema와 권한 검증

- 목적: bet과 lifecycle이 참조할 최소 경기·revision source of truth를 만든다.
- 변경 예상 파일: `migrations/0016_kbo_game_projection.sql`,
  `src/persistence/run-migration.ts`, 관련 migration/integration test,
  `PROJECT_STATUS.md`, 이 계획
- 테스트: 상태·점수 불변식, source ID/revision/message 중복, bet FK, RLS와
  bot/web mutation 권한, migration checksum
- 완료 기준: 대상 migration test, 전체 test, typecheck와 diff check 통과
- 위험: 실제 외부 schema가 안정적 경기 ID를 제공하지 않으면 row를 만들지 않고
  activation gate를 닫아야 한다.
- 롤백: application flag를 off로 유지하고 additive table/FK를 보존한다.

## 검증 계획

- `node --import tsx --test src/persistence/run-migration.test.ts`
- disposable PostgreSQL integration test
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

Source/local migration까지만 수행한다. Production 적용·Discord 등록·feature
활성화는 production 직전 preflight 뒤 별도 실행한다.

## 문서 갱신

- 구현 결과와 검증 evidence
- `PROJECT_STATUS.md`

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- additive `0016`에 정확한 설윤 application ID, 안정적 source game ID,
  competition/season, 팀·시작 시각·상태·점수, current revision/market version과
  source/수집 시각을 가진 canonical projection을 추가했다.
- 원문 없이 message ID, SHA-256 fingerprint와 parser version만 보존하는 불변
  revision table을 추가하고 기존 `kbo_bet.game_id`에 FK를 연결했다.
- web은 현재 game SELECT만, bot은 game SELECT·INSERT·UPDATE와 revision
  SELECT·INSERT만 가능하며 revision UPDATE/DELETE는 허용하지 않았다.
- Migration/PostgreSQL 대상 test `22/22`, 전체 test
  `325 pass / 7 기존 환경 skip / 0 fail`, typecheck와 diff check가 통과했다.
- 정상 경기 parser, runtime ingestion, Production migration과 feature 활성화는
  수행하지 않았다.
