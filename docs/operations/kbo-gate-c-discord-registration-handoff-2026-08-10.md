# KBO Gate C Discord registration handoff — 2026-08-10

- Status: **Superseded by `/크보` namespace change — new immutable candidate required**
- Production baseline release: `79be3fc04c07d1ca69ba49b2e543cdc0bed81485`
- Production baseline tree: `a1637ab4c9131c7d0e0692a01479e2609ff5be01`
- Replacement candidate: not created
- Canonical guild: existing `WAW_DISCORD_GUILD_ID` only
- KBO effective flags: `0/0/0` 유지

## Preconditions and current read-back

- Gate A restore rehearsal: PASS.
- Gate B migrations `0012`~`0019`, exact release rollout and host postflight: PASS.
- Administrator KBO empty aggregate read: PASS.
- Operator deny: 미검증. 별도 operator OAuth 계정이 없으며 이 항목 때문에 관리자
  역할이나 기존 계정을 변경하지 않는다.
- Orca Discord application details의 read-only 확인에서 현재 등록 명령은
  `도움말`, `요약`, `라이엇계정`, `몰랭검거`이고 KBO 명령은 아직 없다.

## Exact desired command payload

Owner가 KBO 공개 명령을 하나의 `/크보` root와 세 subcommand group으로 통일했다.
아래 값은 현재 source/local payload이며 새 immutable candidate가 이 source와
byte-identical하다는 CI 증거가 생기기 전에는 Production에 등록하지 않는다.

- Names: `도움말,요약,라이엇계정,몰랭검거,크보`
- Count: `5`
- `/크보` groups: `크레딧,베팅,랭킹`
- Compact `JSON.stringify` bytes: `6003`
- SHA-256: `9222fee3b18f6c231ff0c90735a1d85897cab7cbd86c08acb782806e63223c6a`
- Targeted command/interaction regression: `11/11 PASS`
- Full suite: `395 PASS / 7 existing environment skips / 0 functional failures`; macOS의
  긴 default temp socket path에서 난 IPC `EINVAL`은 `TMPDIR=/tmp` 재실행 `5/5`로
  환경 원인을 확인했다.
- Production application asset check: `PASS`

## Authorized bounded execution shape

새 candidate CI와 default-off rollout이 별도 승인 범위에서 PASS한 뒤, 새 maintenance
window에서 Production host의 기존 bot credential 경계 안에서만 다음을 순서대로
수행한다.

1. Current release가 새 `/크보` candidate이고 health와 KBO effective flags가
   `0/0/0`인지 read back한다.
2. Discord application identity와 configured guild를 확인하되 ID나 token을 출력하지
   않는다.
3. 현재 guild command JSON을 root-only temporary rollback material로 보관한다.
4. Exact desired 5-command payload를 한 번 PUT한다.
5. Guild commands를 다시 GET하고 count, names와 desired field subset이 exact payload와
   일치하는지 검증한다.
6. Temporary rollback material과 helper를 제거하고 flags `0/0/0`, bot singleton과
   canonical health를 다시 확인한다.

이 단계에서는 command를 호출하지 않는다. 가입, 지급, bet, ranking, ingestion,
settlement, credit adjustment와 retention mutation은 모두 `0`이다.

## Stop and rollback

- Release/tree, flags, guild, current command read, desired payload hash 또는 health가
  다르면 PUT 전에 중단한다.
- PUT 뒤 exact read-back이 실패하면 보관한 이전 command JSON을 즉시 복원하고 다시
  read back한다.
- Token, authorization header, command raw response 또는 사용자 식별자가 출력되면
  증거를 보존하지 않고 중단한다.
- 실행에는 Production credential 접근을 위한 human `sudo`가 필요하다. Passphrase나
  password는 채팅, 문서, shell history에 입력하지 않는다.

## Gate C 이후에도 금지되는 것

Gate 0의 외부 데이터 권리, 정상 경기·정정 schema와 ingestion smoke가 완료되기 전에는
`WAW_KBO_DATA_RIGHTS_AUTHORIZED`, `WAW_KBO_RANKINGS_ENABLED`,
`WAW_KBO_BETTING_ENABLED` 중 어느 것도 `1`로 바꾸지 않는다.
