# KBO Gate C0 Discord registration result — 2026-08-10

- Result: **PASS; `/크보` registered, all KBO features default-off**
- Maintenance window: `2026-08-10T09:45:00Z`~`2026-08-10T11:45:00Z`
- Observer: `Koh-Du-Beom`
- Production commit/release: `d26e7fb1b25d917ae3e00f70730cefd455709d0d`
- Tree: `d89ccb64656fce22c2861d0e68e9e62060eece77`
- Archive SHA-256: `54a5a7a186548a370b91dcd84b119bcaa69029d47896886077669bf1fe7ec613`
- Payload SHA-256: `9222fee3b18f6c231ff0c90735a1d85897cab7cbd86c08acb782806e63223c6a`

## Evidence

- PR #21 exact candidate was non-force fast-forwarded to Production. Deploy run
  `31378157569` passed exact archive staging, release activation, remote health and
  credential cleanup.
- Registration run `31378239884` read effective
  `commands/data-rights/rankings/betting=0/0/0/0`, registered five roots
  (`도움말`, `요약`, `라이엇계정`, `몰랭검거`, `크보`) and passed exact GET read-back.
- Orca invoked `/크보 베팅 가입 동의:true` once. The bot returned the fixed
  master-off response `KBO 명령은 아직 운영 환경에서 사용할 수 없습니다.`
- Postflight run `31378359152` reverified the five-root payload, effective flags
  `0/0/0/0`, canonical health and KBO core table row delta `0`, then removed the
  root-only rollback material retained for the smoke window.

## Recovered first attempt

Run `31377282188` stopped on `command_schema_mismatch` after Discord omitted the
optional `required:false` default from read-back. Automatic restoration of the
previous four roots passed. PR #20 changed only the semantic comparison for that
documented default while retaining strict roots, names, types, option/choice lengths
and values; its PR and merged-develop CI passed before the exact release was made.

## Remaining boundary

Discord registration does not authorize KBO operation. No KBO flag was enabled and
no enrollment, credit, game, bet, settlement or retention row was added. Gate 0
external rights, observed normal-game/correction schemas, policy approvals and the
subsequent staged flag activations remain separate owner gates.
