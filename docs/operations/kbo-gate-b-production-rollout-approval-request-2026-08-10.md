# KBO Gate B Production rollout 승인 요청 — 2026-08-10

- Status: **Gate B rollout PASS — administrator dashboard read PASS; operator deny unverified (operator account unavailable)**
- Production changes in this preparation: **0**
- Candidate commit: `60a61e1e720e55450df51e77ce74aeace6b76020`
- Release ID: `60a61e1e720e`
- Source archive SHA-256:
  `aec25750f73d9d4e42fccc99c9af86ab24215d65fec6c3aa43755e39a0d3693a`
- Source archive bytes: `1066653`
- `package-lock.json` SHA-256:
  `8bff2efcaf1b006bbd8f3868bd80f49263a60af2489df7e3b2d55e405f9e158d`
- Develop CI: runs `31351158707` and PR #11 run `31366347346` PASS
- Canonical dashboard: `https://waw.dubeom.com`

B1은 위 reviewed candidate를 사용했다. B2는 기존 Production merge ancestry가
reviewed `develop` merge commit의 조상이 아님을 Git server가 non-fast-forward로
거부한 뒤, force push 없이 두 이력을 연결한 exact bridge candidate로 정정했다.

- B2 release commit: `79be3fc04c07d1ca69ba49b2e543cdc0bed81485`
- B2 release ID: `79be3fc04c07`
- B2 tree: `a1637ab4c9131c7d0e0692a01479e2609ff5be01`
  (`60a61e1e720e55450df51e77ce74aeace6b76020`과 동일)
- B2 source archive SHA-256:
  `c5d921f8d76e62ec94978b21ec21c3df05ce7bba172d37c4b1f4a1ca8a925342`
- B2 archive bytes: `1066641`
- B2 CI: run `31367383152` PASS

이 문서는 owner decision의 입력이며 Production 실행 명령이 아니다. 승인 문구,
maintenance window와 담당자가 확정되기 전에는 migration, release stage, production
branch 갱신, service restart를 실행하지 않는다.

## Gate A 5/5 증거

2026-08-10 human read-only preflight와 owner-operated restore rehearsal에서 다음을
확인했다.

| 경계 | 결과 |
| --- | --- |
| Exact candidate | 두 번 생성한 archive가 byte-identical; 위 SHA-256/bytes와 일치 |
| CI/source-local | PR #10 merged; develop CI PASS; migration asset 19개와 KBO flag `0/0/0` |
| Release rollback | current `0c83785b0882`, previous `568522974a8f`, 서로 다른 유효 release |
| Host/service | Ubuntu 24.04; web, bot, Caddy, journald, backup/monitor timer active; failed unit 0; health healthy |
| PostgreSQL | PostgreSQL 17; schema/ledger versions `1..11`; migration `0012..0019` 미적용 |
| DB security | PUBLIC table grant 0; workload grants와 RLS가 승인된 schema-11 계약과 일치; KBO relation 0 |
| Backup publication | completed `2026-08-10T03:02:32Z`; schema 11; 181,662 bytes; row count 406; constraints invariant |
| Empty-target restore | disposable PostgreSQL 17; schema 11; row count 406; invalid constraint/FK 0; elapsed 7초 |
| Lightsail | Owner read-back으로 instance running, 승인된 22/80/443 rules와 alarm `OK` 확인 |
| Cleanup | local archive/manifest, restore container/temp 제거; offline `identity.age` 보존; Production mutation 0 |

Backup archive SHA-256은
`d6ce17aaa4d8a59642943090901ac996789d789798d507983847593368caf63a`다.
두 번의 잘못된 passphrase 입력은 평문 dump 없이 실패했고, identity/passphrase 단독
검증 뒤 같은 archive의 restore가 최종 PASS했다.

## Gate B 실행 현황

- B0 host preflight: `PASS`, mutation `0`. 첫 RLS fixture 판정은 migration runner가
  소유하는 `waw_schema_migration`을 baseline fixture에서 누락한 검사 결함이었고,
  Production 17개 relation의 승인 hash
  `4d1c0e03a9e17658b1216ef522749821a5fc855a43da20fff78f5459369cc4a3`를
  read-only로 재확인해 해소했다.
- Lightsail alarm: owner read-back `OK`.
- B1: `PASS`. Exact inactive release `60a61e1e720e`를 stage하고 migration
  `0012..0019`를 순서대로 적용했다. PostgreSQL 17, schema/ledger `1..19`, invalid
  constraint `0`, KBO RLS `9`, policy `27`, KBO row `0`을 read back했으며 one-shot
  credential을 제거했다. `current`는 `0c83785b0882`로 유지됐다.
- B2: 최초 PR #11 exact-head CI는 PASS했지만 Git server가 현재 Production history와
  `develop`의 ancestry 분기를 non-fast-forward로 거부해 deployment mutation 없이
  중단했다. PR #11은 closed했다.
- Replacement PR [#12](https://github.com/Koh-Du-Beom/waw-discord-bot/pull/12)은
  첫 parent가 expected Production `0c83785b...`, 둘째 parent가 reviewed candidate
  `60a61e1e...`이고 tree는 reviewed candidate와 동일하다. Reproducible archive 두
  개가 byte-identical했고 위 hash/bytes와 일치하며 CI run `31367383152`가 PASS했다.
- `production`은 non-force fast-forward로 exact release commit
  `79be3fc04c07d1ca69ba49b2e543cdc0bed81485`를 가리킨다. Deploy production run
  [`31367546617`](https://github.com/Koh-Du-Beom/waw-discord-bot/actions/runs/31367546617)은
  archive hash 검증, stage, activation, web/bot restart, bounded health와 runner SSH
  credential cleanup을 40초 안에 PASS했다. Workflow log의 release/archive tuple은
  위 B2 tuple과 일치하고 canonical `/health`도 `healthy`다.
- Human read-only host postflight도 PASS했다. Termius가 출력 직후 one-shot session을
  닫아 최종 stdout은 보존되지 않았지만, 전송 SHA-256이 일치했고 remote helper는
  release/current·previous, units/services, KBO effective flag `0/0/0`, 기존 admin
  IPC/game observation `1/1`, loopback/canonical health, schema/ledger `1..19`, KBO
  RLS/grant/row, backup freshness와 deployment transient 검사가 모두 성공한 뒤에만
  실행되는 마지막 self-unlink를 완료했다. 재접속 read-back은
  `POSTFLIGHT_SCRIPT_REMOVED_AFTER_PASS`였다. Production state mutation은 `0`이다.
- Canonical dashboard의 administrator KBO read-only smoke는 `PASS`다. `관리자 전용`,
  수집 경기 `0건`, 최근 경기 상태 `관측 없음`, 등록 KBO 계정 없음이 표시됐고
  mutation은 실행하지 않았다. 별도 operator OAuth 계정이 없어 operator deny는
  Production에서 검증하지 못했다. 관리자 역할 변경, session 위조 또는 기존 계정
  권한 변경으로 이를 대체하지 않았다.

Final promotion은 PR #12 증거를 보존한 채 `production` ref를 B2 release commit
`79be3fc04c07d1ca69ba49b2e543cdc0bed81485`로 non-force fast-forward한다. Force,
merge/squash/rebase 재작성과 source 변경은 금지한다. Expected old SHA
`0c83785b08821e81fb5b939829564919d1681771`이 달라지면 갱신하지 않는다.

Gate B 실행 직전 이 증거의 freshness와 host drift를 다시 읽는다. Backup이 24시간을
넘었거나 schema/release/service/grant가 달라졌으면 이 승인 범위로 새 backup을 만들거나
drift를 수리하지 않고 중단한다.

## 요청하는 승인 범위

다음 작업만 순서대로 승인하도록 요청한다.

### B0 — mutation 직전 재확인

1. Candidate commit, archive SHA-256/bytes, lockfile hash와 CI PASS를 다시 확인한다.
2. Production current/previous가 위 Gate A 값과 같고 서로 다르며 schema/ledger가
   정확히 `1..11`인지 읽는다.
3. Backup/monitor, journald, Caddy, web/bot, Gateway, loopback/canonical health와
   Lightsail alarm이 healthy인지 확인한다.
4. Gate A restore evidence가 24시간 freshness 안에 있고 migration `0012..0019`,
   KBO relation과 KBO workload grant가 여전히 없는지 확인한다.

Mismatch는 현장에서 고치지 않는다. B0가 PASS하기 전 Production branch를 갱신하거나
candidate를 stage하지 않는다.

### B1 — exact archive stage와 migrations `0012..0019`

1. 위 exact archive만 비활성 immutable release로 stage하고 archive marker,
   lockfile과 source/dist migration 19개의 byte 일치를 확인한다.
2. Root-owned one-shot migration identity를 기존 최소 권한 경계로 materialize한다.
   Connection string과 credential 값은 argv, environment 출력, journal, chat 또는
   문서에 남기지 않는다.
3. Exact staged release의 migration runner를 한 번 실행해 pending migration
   `0012`부터 `0019`까지 순서대로 적용한다.
4. Schema/ledger `1..19`, 아래 checksum, invalid constraint 0, RLS와 web/bot grant를
   read back한다.
5. `purge_expired_kbo_accounts`는 bot EXECUTE만 허용되고 web/PUBLIC은 거부되는지,
   KBO table DELETE가 workload role에 부여되지 않았는지 확인한다.
6. One-shot migration credential과 staging transient를 제거한다.

Production은 마지막 확인 기준 schema 11이며 과거 PLAN-0016의 migration 0012
실행이 중단된 상태다. 따라서 KBO checklist의 `0013..0019` 앞에 prerequisite
`0012_game_incident_admin_result.sql`을 포함한다. Migration 0012는 기존 game/admin
command constraint를 현재 accepted allowlist로 확장하며 KBO migration과 같은 exact
runner에서 적용한다.

| Version | Migration | Canonical SHA-256 |
| --- | --- | --- |
| 0012 | `0012_game_incident_admin_result.sql` | `188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c` |
| 0013 | `0013_kbo_credit_ledger_foundation.sql` | `4eb665a50a6e369c76b8d1f9a2ba97e9d0c65c63969a5a7f921096423d41967a` |
| 0014 | `0014_kbo_daily_credit_claim.sql` | `a9efebb8d2933dc2442168de0cc50e2c8298735c5256ddcb2196453ae5348950` |
| 0015 | `0015_kbo_bet_foundation.sql` | `6b4f912a6c232e34bf22f3657427096a5be973dd9bd1a7ee492e93bf49dbf242` |
| 0016 | `0016_kbo_game_projection.sql` | `f55b1292c7ad402ed593d1316ac250de1ae9cf0ac8dbf5b1c47d68a3f105df81` |
| 0017 | `0017_kbo_settlement_schema.sql` | `ac3121ca18cbec116c0e965812fe47425b8ba72e74becff91d705b2ce26bbeb3` |
| 0018 | `0018_kbo_admin_credit_adjustment.sql` | `2b93d41b15d076c5f1266a8c5de05c6eefcf82f25d0d19ad53a3ddd93ceec199` |
| 0019 | `0019_kbo_retention_purge.sql` | `be330005390403c7d6e189338a2094f6ccdb9e973b65d0f7998e1bc51143ba74` |

### B2 — exact release default-off rollout

1. B1 PASS 뒤에만 reviewed `develop` commit을 `production`으로 승격한다. 현재
   production push가 deployment workflow를 시작하므로 merge는 release activation
   승인과 같은 mutation으로 취급한다.
2. GitHub Actions의 dedicated deploy identity, pinned known-host, serialization과
   exact `GITHUB_SHA` archive 경계를 그대로 사용한다.
3. Release `60a61e1e720e`만 activate하고 approved bounded readiness/rollback
   controller로 web/bot을 재시작한다.
4. 다음 KBO flag의 **effective value**가 모두 정확히 `0`인지 activation 전후에
   확인한다.
   - `WAW_KBO_DATA_RIGHTS_AUTHORIZED=0`
   - `WAW_KBO_RANKINGS_ENABLED=0`
   - `WAW_KBO_BETTING_ENABLED=0`
5. 기존 admin IPC와 game observation의 승인된 effective state는 이 Gate에서
   변경하지 않는다. Web/bot credential, Discord token, OAuth와 provider 설정도
   변경하지 않는다.
6. Current release가 `60a61e1e720e`, previous가 pre-state current
   `0c83785b0882`인지 read back한다. Web/bot singleton, Gateway/storage,
   loopback/canonical health, Caddy, backup/monitor와 failed unit 0을 확인한다.
7. Administrator KBO dashboard의 empty aggregate read와 operator deny만
   non-mutating smoke한다. 가입, 지급, game ingestion, bet, settlement, credit
   adjustment와 retention purge는 실행하지 않는다.

## 명시적 비범위

이 승인은 다음을 포함하지 않는다.

- KBO Gate 0의 외부 봇 개발자 허가, 정상 경기/정정 schema와 법률·등급·Discord 증거
- Discord application command 등록·변경 또는 시험 guild command smoke
- 외부 KBO message ingestion, parser 실행과 canonical game 생성
- 세 KBO flag 중 하나라도 `1`로 변경
- 사용자 가입, 일일 지급, bet, settlement, 정정, 관리자 credit adjustment와 purge
- 새 credential, provider key, IAM/S3, firewall, DNS, TLS 또는 OAuth 변경
- Production 원본 DB restore, down migration, ledger/checksum rewrite와 수동 data correction
- Gate C 또는 public KBO 기능 활성화

Gate 0가 미완료이므로 schema와 application이 배포돼도 KBO ingestion, rankings와
betting은 계속 fail-closed다.

## 중단 조건

- Candidate tuple, CI, current/previous, schema `1..11`, checksum, Gate A freshness,
  grant/RLS, capacity 또는 service/alarm이 다르면 mutation 전에 중단한다.
- Migration 하나라도 실패하거나 `1..19` ledger/checksum, constraint, RLS/grant,
  function EXECUTE/deny가 다르면 credential을 제거하고 release activation 전에
  중단한다.
- Migration 뒤 기존 web/bot, Gateway, admin IPC, game observation, backup/monitor
  또는 canonical health가 나빠지면 release를 activate하지 않는다.
- Production promotion이 exact candidate가 아니거나 workflow serialization,
  host-key, archive hash 검증이 실패하면 activation하지 않는다.
- Activation 뒤 KBO effective flag가 하나라도 `0`이 아니거나 singleton/health가
  실패하면 즉시 application rollback을 실행한다.
- Secret, connection string, Discord content나 불필요한 사용자 식별자가 출력되면
  증거를 보존하지 않고 중단한다.

## Rollback

- B1 전 실패: Production 상태를 바꾸지 않고 중단한다.
- Stage 실패: current/previous와 service를 유지하고 exact incomplete staged artifact만
  별도 확인 후 제거한다.
- Migration 실패: down SQL, original DB restore와 ledger rewrite를 금지한다. 성공한
  additive migration 상태를 보존하고 corrective-forward 또는 별도 restore decision을
  요청한다.
- Activation 실패: pre-state current `0c83785b0882`, previous `568522974a8f`와 기존
  unit state를 controller가 복원한다. Migration `0012..0019`와 생성된 빈 KBO schema는
  유지한다.
- Rollback 뒤 current/previous를 직접 read back하고 web/bot, Gateway, admin IPC,
  game observation, canonical health, backup/monitor와 KBO flag `0/0/0`을 재검증한다.

## 실행 책임과 승인 시 채울 값

- Maintenance window: **2026-08-10T06:45:00Z~2026-08-10T08:45:00Z**
- Human migration executor: **Koh-Du-Beom / Termius `waw-operator`**
- Release executor: **GitHub Actions exact-commit workflow**
- Observer: **Koh-Du-Beom**
- Rollback owner: **Koh-Du-Beom**
- AI external-terminal input: **금지**

## 요청하는 owner decision

다음 exact 범위만 승인 또는 거절한다. 아래 문구에 maintenance window와 observer를
채운 명시적 답변 없이는 실행 승인이 아니다.

> Gate B production mutation을 candidate
> `60a61e1e720e55450df51e77ce74aeace6b76020`, archive SHA-256
> `aec25750f73d9d4e42fccc99c9af86ab24215d65fec6c3aa43755e39a0d3693a`,
> migrations `0012..0019`의 위 checksum과 KBO effective flags `0/0/0`에 한해
> 승인한다. Maintenance window는 `<UTC 시작>~<UTC 종료>`, observer는 `<이름>`이다.
> B0 drift 재확인, B1 migration/read-back과 credential cleanup이 모두 PASS한 뒤에만
> exact release rollout을 진행한다. Discord command 등록, KBO ingestion과 flag
> activation은 승인하지 않는다. 어떤 stop condition에서도 즉시 중단하고 Production
> 원본 restore나 down migration을 실행하지 않는다.

## Owner decision record

- Decision: **Approved for the exact scope above**
- Approved at: `2026-08-10T06:51:56Z`
- Maintenance window:
  `2026-08-10T06:45:00Z~2026-08-10T08:45:00Z` (KST 15:45~17:45)
- Observer and rollback owner: `Koh-Du-Beom`
- Execution order: B0부터 시작하고 각 stage의 PASS 전에는 다음 mutation으로 진행하지
  않는다.
- Production changes made when recording this decision: `0`
