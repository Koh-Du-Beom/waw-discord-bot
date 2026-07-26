# 구현 계획: Riot ID 자동 조회 승인

- Status: Approved
- Date: 2026-07-27
- Related ADR: ADR-0020

## 목표

Dashboard에서 PUUID 입력을 제거하고 bot이 pending KR Riot ID를 Account API로
조회한 뒤에만 기존 원자 승인 mutation을 수행한다.

## Bounded tasks

1. 관리자 HTTP/IPC 승인 payload에서 PUUID와 link ID를 제거한다.
2. bot-only adapter에 bounded Riot ID lookup과 identifier-free failure를 추가한다.
3. operation ID에서 내부 link ID를 결정적으로 생성하고 기존 stale/duplicate
   transaction 경계를 보존한다.
4. Dashboard를 승인 버튼만 있는 UI로 변경한다.
5. unit/integration/browser 회귀, immutable release, Gate C/D를 수행한다.

## Rollback

이전 immutable release로 전환한다. Personal key와 기존 연결·pending 요청은
변경하지 않는다.

## Approval

Product owner approved implementation and production continuation on 2026-07-27.
