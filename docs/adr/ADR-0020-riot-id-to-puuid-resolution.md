# ADR-0020: Riot ID 기반 PUUID 자동 조회

- Status: Accepted
- Date: 2026-07-27
- Owner: Product owner
- Supersedes in part: ADR-0018의 “Riot ID에서 PUUID를 찾는 사용자 입력 경로” 범위 제외

## Context

관리자가 Dashboard에 PUUID를 직접 입력하는 현재 흐름은 일반 사용자가 알 수
없는 내부 식별자를 요구하고 오입력 위험이 있다. Discord 요청에는 이미 KR
Riot ID의 game name과 tag line이 저장된다.

## Decision

- 사용자는 `/라이엇계정 연결 계정:<이름#태그>`에 화면에 표시되는 Riot ID만
  입력한다. Discord slash command가 이름 없는 위치 인자를 지원하지 않으므로
  `연결` subcommand와 `계정` option label은 유지한다.
- bot process만 Personal API key를 사용해 ASIA Account API의 Riot ID lookup을
  호출한다.
- HTTP 200의 bounded JSON에서 PUUID와 요청한 game name/tag line이 일치할
  때만 승인 mutation을 계속한다.
- 404는 존재하지 않는 계정, 그 밖의 provider/형식/timeout 실패는 fail-closed
  unavailable로 처리한다.
- web, browser DTO, 관리자 IPC 요청, 운영 로그와 감사에는 PUUID를 싣지 않는다.
- Dashboard에는 PUUID 입력란을 두지 않고 명시적인 승인 버튼만 제공한다.
- 결과는 계속 `admin_approved_unverified`이며 소유권 인증으로 표현하지 않는다.

## Consequences

승인 UX와 오입력 위험은 개선되지만, Riot ID lookup도 계정 존재만 확인하며
Discord 사용자의 소유권은 증명하지 않는다. Personal key 한도와 private
community 범위를 유지한다.

## Approval

Owner approved the described automatic lookup and approval-button flow in the
2026-07-27 conversation before implementation. The owner subsequently approved
the single display Riot ID input contract in the same conversation.
