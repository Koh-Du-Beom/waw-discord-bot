# 구현 계획: KBO 탈퇴 계정 보존 만료 purge

- Status: Completed
- Related requirements: `FUN-028`, `SEC-001`~`SEC-009`
- Related ADRs: `ADR-0029`
- Depends on: `PLAN-0034`
- Owner: Product owner

## 목표

탈퇴 시각과 마지막 KBO 원장 시각 중 늦은 때부터 1년이 지난 opaque 사용자
단위 데이터를 법적 보존·분쟁 hold와 열린 bet을 보존하면서 삭제한다.

## 범위

- additive retention hold와 좁은 security-definer purge 함수
- terminal account의 claim, bet, settlement, ledger, 관련 operation/audit/result 삭제
- bot의 daily bounded invocation, 중복 tick 결합과 고정 진단
- active/recent/pending/hold 제외와 실제 PostgreSQL 삭제·권한 검증
- backup에는 기존 30일 lifecycle을 그대로 적용하는 운영 절차

## 범위 제외

- 재식별 가능한 삭제 통계와 자동 legal hold 생성
- backup lifecycle 변경, Production migration·timer 활성화

## 결정

1. bot role에 table DELETE를 추가하지 않고 migration owner 함수의 exact EXECUTE만
   허용한다.
2. 함수는 active, 1년 미경과, pending bet, hold 계정을 fail-closed로 제외한다.
3. 한 번에 100개만 처리하고 bot process의 기존 생명주기 안에서 하루 한 번 호출한다.
4. hold 추가·해제는 migration 권한 운영자가 runbook의 exact transaction으로만
   수행한다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- Additive `0017`에 운영자 전용 legal/dispute hold와 pinned `search_path`의
  `purge_expired_kbo_accounts` security-definer 함수를 추가했습니다.
- 함수는 departed, 1년 경과, pending bet 없음, hold 없음인 계정만 `SKIP LOCKED`로
  최대 100개 삭제합니다. Bot은 table DELETE 없이 exact function EXECUTE만 받습니다.
- Bot 시작 및 24시간 주기의 non-overlap 호출, 식별자 없는 고정 실패 진단과 종료
  대기를 구현하고 hold/pending/recent 보존, terminal graph 삭제, web 거부/bot 허용을
  실제 PostgreSQL로 검증했습니다.
- 전체 test `356 pass / 7 기존 환경 skip / 0 fail`, PostgreSQL `29/29`, typecheck,
  17개 migration build와 production asset test가 통과했습니다. Production migration·
  timer 활성화는 수행하지 않았습니다.
