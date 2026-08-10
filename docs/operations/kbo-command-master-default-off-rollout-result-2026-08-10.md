# KBO command master default-off rollout result — 2026-08-10

- Result: **PASS; direct runtime flag read-back deferred to Gate C0**
- Maintenance window: `2026-08-10T09:45:00Z`~`2026-08-10T11:45:00Z`
- Observer: `Koh-Du-Beom`
- Production commit/release: `15052952358d24bf2bc8ec65ebecf574ec5a59ca`
- Previous Production commit: `79be3fc04c07d1ca69ba49b2e543cdc0bed81485`
- Tree: `a5959b8dc18ccb6ade77f7520a671cbfb33b417f`
- Archive SHA-256: `9453ac5b0f967251c4d58f6ac2ae9d79f6128cca5f19360e588387cd1f8db585`
- Deploy run: `31376248112` PASS

## Evidence

- PR #17의 exact bridge를 Production에 non-force fast-forward했다.
- Workflow가 archive를 stage하고 release `15052952358d`를 activate했다.
- Remote activation은 web/bot service와 bounded health 검사를 통과했다.
- `https://waw.dubeom.com/health` read-back은 `{"status":"healthy"}`였다.
- 배포된 exact unit은 `WAW_KBO_COMMANDS_ENABLED=0`을 포함한다.
- 배포 controller는 `/etc/waw/bot.env`, database schema, credential과 Discord
  application commands를 변경하지 않았다.
- Discord REST 호출, KBO command 호출과 네 KBO flag 활성화는 모두 `0`건이다.

## Read-back note

현재 Orca에 재사용 가능한 Production SSH session이 없어서 effective service
environment의 네 KBO flag를 `systemctl show`로 직접 재조회하지 않았다. 기존 세
KBO flag는 rollout 전 `0/0/0`이었고 이번 controller는 env file을 변경하지 않는다.
새 master flag는 설치된 unit의 exact `0` 기본값을 사용한다. Gate C0은 Discord PUT
전에 네 effective flag가 `0/0/0/0`인지 직접 확인하고 다르면 현장에서 수리하지 않고
중단한다.

## Rollback boundary

Application rollback은 previous immutable release `79be3fc04c07`로만 수행한다.
Schema `1..19`, ledger와 user data는 down-migrate, restore, rewrite 또는 삭제하지
않는다. Discord command rollback은 아직 필요하지 않다.
