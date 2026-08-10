# 구현 계획: KBO 최종 베팅 반환액 계산

- Status: Completed
- Related requirements: `FUN-025`, `FUN-026`
- Related ADRs: `ADR-0028`, `ADR-0029`
- Owner: Product owner

## 목표

공급자·Discord·DB와 무관한 순수 domain 함수 하나로 최종 경기의 홈 승·무승부·
원정 승 예측을 0배, 2배 또는 3배 반환액으로 계산한다.

## 현재 구현 상태

- `src/`와 migrations에 KBO domain, command, persistence 또는 schema가 없다.
- Accepted `ADR-0029`가 반환 규칙과 불변 원장 경계를 결정했지만 구현 계획은 없다.
- 기존 TypeScript와 Node test runner를 그대로 재사용할 수 있다.
- 실제 공급자 ingestion은 Accepted `ADR-0028`과 충돌하는 `ADR-0031`이 Proposed인
  동안 구현하지 않는다. 합성된 최종 점수만 이 작업의 입력으로 사용한다.

## 범위

- 최종 홈·원정 점수에서 실제 결과를 홈 승·무승부·원정 승으로 분류
- 결과 실패 0배, 결과 적중 2배, 결과와 정확한 점수 적중 3배 계산
- 예상 점수를 입력하지 않은 결과 적중은 2배로 제한
- 음수·비정수 점수, 양수가 아닌 금액, 예상 점수 한쪽만 있는 입력 거부
- 표 기반 단위 테스트

## 범위 제외

- 가입, 일일 지급, 베팅 접수와 한도
- PostgreSQL migration, 원장, 잔액 projection과 멱등 정산 transaction
- 무효·연기·취소·서스펜디드와 공식 정정
- Discord 명령, 외부 봇 parser, Gateway listener와 운영 feature flag
- 범용 provider 또는 settlement abstraction

## 선행 조건

- `ADR-0028`과 `ADR-0029` Accepted 상태 유지
- 정상 경기 schema Spike는 필요하지 않음: 테스트는 합성 점수만 사용

## 작업

### Task 1: 최종 경기 반환액 계산과 단위 테스트

- 목적: 원장에 기록할 반환액의 최소 순수 계산 계약을 고정한다.
- 변경 예상 파일: `src/kbo/bet-return.ts`, `src/kbo/bet-return.test.ts`
- 테스트: 홈 승·무승부·원정 승 각각의 실패·2배, 정확 점수 3배, 예상 점수 없음,
  잘못된 금액·점수·부분 예상 점수 거부
- 완료 기준: 모든 표본에서 `classification`, `multiplier`, `returnAmount`가
  정책과 일치하고 잘못된 입력은 명시적으로 실패한다.
- 위험: 이후 provider 상태를 이 함수에 섞어 범위가 커질 수 있음
- 롤백: 두 새 파일만 제거하며 DB와 운영 데이터 영향 없음

## 검증 계획

- 새 단위 테스트 실행
- 전체 test와 typecheck 실행
- `git diff --check`

## 배포 및 마이그레이션

배포와 migration은 없다. 함수는 어떤 runtime path에도 연결하지 않는다.

## 문서 갱신

- 구현 시 이 계획의 진행 결과와 `PROJECT_STATUS.md` 갱신

## 승인

- Owner decision: Approved — Task 1만 구현하고 전체 test와 typecheck를 실행
- Approved date: 2026-08-07

## 진행 결과

- `calculateFinalBetReturn`이 합성 최종 점수에서 홈 승·무승부·원정 승을 판정하고
  실패 0배, 결과 적중 2배, 정확 점수 적중 3배의 원금 포함 반환액을 계산한다.
- 금액과 점수는 안전한 정수로 검증하며 음수·부분 예상 점수와 안전한 정수 범위를
  넘는 반환액을 거부한다.
- 대상 테스트 `2/2`, 전체 test `292 pass / 7 PostgreSQL 환경 skip / 0 fail`,
  typecheck와 `git diff --check`가 통과했다.
- DB, migration, Discord, provider, runtime 연결과 dependency 변경은 없다.
