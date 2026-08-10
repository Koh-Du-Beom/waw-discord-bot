# 구현 계획: KBO 공개 랭킹

- Status: Completed
- Related requirements: `FUN-028`, `OWN-045`, `OWN-048`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0031`
- Depends on: `PLAN-0029`, `PLAN-0030`
- Owner: Product owner

## 목표

active 가입자만 대상으로 현재 보유 크레딧과 competition/season별 결과·정확
점수·적중률 랭킹을 공동 순위와 bounded page로 공개한다.

## 범위

- 현재 available balance와 관리자 조정 포함 표식
- canonical settlement 기반 결과·정확 점수 적중 수와 유효 정산 수
- 무효 제외, 적중률 최소 10건, competition/season 분리와 공동 순위
- 현재 display label·본인 여부만 포함하는 10행 page
- `/랭킹 크레딧|결과|점수|적중률`과 default-off runtime gate

## 범위 제외

- season 종료 snapshot과 외부 KBO 순위
- 관리자 dashboard와 크레딧 조정
- Discord REST 등록·Production 배포·기능 활성화

## 선행 조건

1. raw Discord ID, account/operation/ledger/settlement ID와 correction debt는
   공개 DTO에 포함하지 않는다.
2. departed 계정은 현재·과거 season 랭킹 모두에서 즉시 제외한다.
3. 사용자 표시명은 mention과 Markdown을 neutralize한다.
4. 기능·권리 flag가 모두 exact `1`일 때만 조회한다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- `/랭킹 크레딧|결과|점수|적중률`을 10행·최대 100페이지로 연결하고 공동 순위를
  안정적인 표시명 정렬과 분리했습니다.
- active 가입자와 canonical settlement만 사용하며 무효 제외, 적중률 10건,
  competition/season 분리, departed 즉시 제외를 query에서 고정했습니다.
- 대상 PostgreSQL test `26/26`, 전체 test
  `344 pass / 7 기존 환경 skip / 0 fail`, typecheck, production build와 diff
  check가 통과했습니다.
- Discord REST 등록과 Production flag 활성화는 수행하지 않았습니다.
