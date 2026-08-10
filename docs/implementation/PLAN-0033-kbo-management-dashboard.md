# 구현 계획: KBO 관리 dashboard

- Status: Completed
- Related requirements: `FUN-029`, `FUN-030`, `SEC-001`~`SEC-009`
- Related ADRs: `ADR-0017`, `ADR-0029`
- Depends on: `PLAN-0032`
- Owner: Product owner

## 목표

canonical production domain dashboard의 administrator 전용 KBO 탭에서 account,
지급·베팅·정산·정정·랭킹 성격의 집계와 공급 상태를 조회하고 고위험 크레딧
조정을 실행한다.

## 범위

- active/departed opaque account의 balance, debt, version과 최소 표시명
- 일일 지급, pending/settled/void/correction, 적중 수와 관리자 조정 집계
- 최신 canonical game source/수집 시각과 상태
- administrator-only read API와 15분 OAuth·CSRF·confirmation adjustment API
- exact IPC dispatch, stale refresh, 접근성 있는 표·폼·결과 알림

## 범위 제외

- generic ledger browser, raw Discord ID와 원문 외부 message
- debt 변경, batch 조정과 Production 배포·기능 활성화

## 선행 조건

1. dashboard canonical domain은 `https://waw.dubeom.com`이다.
2. adjustment API는 현재 administrator, exact Origin/CSRF, 최근 OAuth와
   `confirmation: true`를 모두 요구한다.
3. operator와 unauthenticated 요청은 KBO 관리 DTO를 받지 못한다.
4. 조정 뒤 stale version을 다시 읽어 화면을 갱신한다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- Administrator 전용 aggregate read DTO/API와 dashboard 탭, 공급 상태, 접근성 있는
  표·조정 폼을 구현했습니다. Operator와 미인증 사용자는 KBO 관리 DTO를 받지
  못합니다.
- Signed adjustment는 기존 exact Origin·CSRF·최근 OAuth·confirmation·현재 관리자
  검증을 재사용하며 `credit_account_adjust` IPC 뒤 stale version을 다시 읽습니다.
- 실제 PostgreSQL query와 HTTP/UI/browser API 계약을 포함해 전체 test
  `356 pass / 7 기존 환경 skip / 0 fail` 및 PostgreSQL `29/29`가 통과했습니다.
- Production migration·Discord 등록·배포·기능 활성화는 수행하지 않았습니다.
