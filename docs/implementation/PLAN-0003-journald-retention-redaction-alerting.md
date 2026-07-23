# PLAN-0003: journald 보존·redaction·경보 구현

- Status: Draft — `ADR-0014` acceptance 전 실행 금지
- Date: 2026-07-23
- Related requirements: `FUN-001`~`FUN-002`, `FUN-017`, `PRI-001`~`PRI-003`, `OPS-003`~`OPS-004`, `OWN-004`
- Related ADRs: [`ADR-0011`](../adr/ADR-0011-systemd-direct-application-deployment.md), [`ADR-0012`](../adr/ADR-0012-caddy-https-ingress.md), [`ADR-0013`](../adr/ADR-0013-systemd-application-credentials.md), Proposed [`ADR-0014`](../adr/ADR-0014-journald-retention-redaction-alerting.md)
- Owner: Project owner

이 계획은 사용자가 ADR과 함께 요청해 검토 가능한 Draft로 작성했다. Repository workflow에 따라 Proposed `ADR-0014`가 owner 승인으로 Accepted되기 전에는 어떤 Task도 구현하거나 production에 적용하지 않는다.

## 목표

Ubuntu 24.04 systemd host에서 operational journal을 30일/1GiB/4GiB-free ceiling으로 운영하고, forbidden data를 저장 전에 차단하며, application·backup·certificate·disk 실패를 deduplicated Discord alert와 외부 Lightsail host alarm으로 전달한다.

## 범위

- Fastify/application operational log allowlist와 forbidden-field tests
- Alert input/state transition, debounce, dedupe, reminder, recovery와 safe payload contract
- journald production drop-in과 disposable scaled retention/capacity Spike
- 별도 Discord webhook systemd credential, monitor service/timer와 rollback runbook
- Lightsail `StatusCheckFailed` alarm 및 recovery email
- Effective config, access deny, redaction, delivery와 cleanup 검증

## 범위 제외

- Audit·설정 변경·명령 원장의 journald 이전 또는 1년 journal 보존
- CloudWatch Agent, remote journal backend, WAW journal namespace와 새 production dependency
- Raw journal의 dashboard/public API 노출
- Caddy request access log 활성화
- Production DNS, public certificate issuance, firewall 또는 application feature 배포
- 실제 secret을 사용하는 redaction fixture와 journal backup

## 선행 조건

1. `ADR-0014` owner 승인과 Accepted 전환.
2. Task 2 disposable AWS resource 생성·삭제 window의 별도 owner 승인. 합성값과 local fake webhook만 사용한다.
3. Task 4 전에 owner가 alert 전용 Discord channel/webhook과 Lightsail email contact를 승인한다. Webhook URL/token은 채팅·Git·일반 environment·journal에 기록하지 않는다.
4. Production 최초 vacuum, journald restart와 failure injection의 maintenance window를 별도로 승인한다.
5. Production config read-back과 rollback artifact는 secret을 포함하지 않으며 기존 user change와 host service를 먼저 inventory한다.

## 작업

### Task 1 — local log·alert 계약

- 목적: Host나 credential 없이 allowed operational envelope와 deterministic alert state machine을 고정한다.
- 변경 예상 파일: `src/operations/`의 작은 TypeScript module과 co-located `*.test.ts`
- 테스트:
  - timestamp/correlation/event/outcome/reason/duration/version allowlist와 normalized route
  - OAuth code, Authorization/Cookie, session, raw Discord message, query, IP/User-Agent, provider body와 secret canary가 output 전체에 없음
  - unit failure, health unavailable/degraded debounce, backup 20h/24h, certificate 21d/14d, journal 80%와 free-space threshold
  - 동일 key dedupe, 6시간 reminder, recovery, clock boundary와 stale/invalid input의 safe failure
  - alert payload fixed fields, `allowed_mentions.parse=[]`와 raw journal/user input 부재
- 완료 기준: Node standard library만으로 deterministic tests가 통과하고 invalid/stale input을 healthy로 승격하지 않으며 prohibited value가 error path를 포함한 output에 없다.
- 위험: Generic logging abstraction이나 transport interface를 미리 만들면 redaction surface가 커질 수 있다.
- 롤백: 추가한 local module/test만 제거한다. 기존 runtime behavior와 production은 바뀌지 않는다.

### Task 2 — disposable Ubuntu 24.04 journald·delivery Spike

- 목적: Production 값을 장시간 기다리지 않고 동일 directive의 축소 fixture로 rotation/retention/access와 alert delivery semantics를 검증한다.
- 변경 예상 파일: `docs/research/spikes/journald-retention-redaction-alerting/README.md`, 단일 runner script
- 테스트:
  - disposable Ubuntu의 systemd 255와 effective config preflight
  - seconds/MiB로 축소한 `Storage`, `SystemMaxUse`, `SystemKeepFree`, `MaxFileSec`, `MaxRetentionSec` fixture의 rotate/vacuum과 reboot persistence
  - synthetic web/bot/Caddy/backup unit의 allowed JSON, forbidden canary 전체 journal 부재와 workload/cross-service read deny
  - local fake HTTP receiver에서 firing/dedupe/reminder/recovery, timeout, 429 `Retry-After`와 bounded retry
  - forced monitor/service failure와 previous state/config rollback
  - unit, user, config, state, listener, instance/key/static IP/disk/snapshot과 local transfer artifact final count `0`
- 완료 기준: 실제 credential·Discord·production 없이 모든 pass marker와 same-run cleanup/final absence가 기록되고, 실패 run도 cleanup trap을 통과한다.
- 위험: Journald는 active file과 archived file을 다르게 처리하므로 축소 fixture가 production 30일을 시간적으로 증명하지는 않는다.
- 롤백: Runner cleanup으로 disposable host와 local artifact를 제거한다. Production에는 접속하지 않는다.

### Task 3 — production-free deployment assets와 dry run

- 목적: Spike 결과를 review 가능한 config/unit/runbook으로 만들되 외부 service나 production host를 변경하지 않는다.
- 변경 예상 파일: deployment config template, monitor service/timer, alert sender, `docs/operations/journald-and-alerting-runbook.md`, 관련 tests
- 테스트:
  - monitor unit/timer의 `systemd-analyze verify`, journald fixture의 `systemd-analyze cat-config` read-back에서 exact 1G/4G/1day/30day 및 forwarding off
  - temp root에서 install/read-back/rollback idempotence와 기존 config 보존
  - file-based webhook credential만 읽고 process argument/environment/journal에 synthetic value가 없음
  - offline fake receiver delivery와 failure state, no mentions, bounded payload size
  - no new runtime dependency, package lock과 production environment unchanged
- 완료 기준: Clean disposable root/host에서 install→verify→rollback이 재현되고 production change 없이 operator checklist와 destructive vacuum gate가 문서화된다.
- 위험: Production unit name, backup marker path와 Caddy state가 template 가정과 다를 수 있다.
- 롤백: Generated config/unit/runbook을 revert한다. Host/API mutation은 없다.

### Task 4 — owner-approved production rollout

- 목적: 실제 host의 기존 state를 보존하면서 journald ceiling, local alert delivery와 external host alarm을 단계적으로 활성화한다.
- 변경 예상 파일: Task 3 asset의 host installation, non-secret execution evidence, `PROJECT_STATUS.md`, operations runbook
- 테스트:
  - pre-change disk/journal usage, oldest/newest timestamp, effective config, unit/user/group와 existing alarm inventory
  - journald drop-in install/restart/read-back 후 reboot persistence와 `journalctl --verify`
  - 별도 webhook `LoadCredential=` permission, test firing/recovery delivery와 journal/process/environment secret absence
  - synthetic one-unit failure, degraded debounce, backup/certificate/disk fixture threshold와 dedupe; production data·real backup publication·certificate를 손상하지 않음
  - Lightsail `StatusCheckFailed` alarm과 recovery email config read-back
  - previous config/unit rollback rehearsal 뒤 final desired config 재적용
- 완료 기준: 실제 firing/recovery가 owner-approved channel에 한 번씩 도달하고, local/host-external 두 경로가 read-back되며, raw forbidden data와 unexpected AWS resource가 없다.
- 위험: Journald restart/vacuum은 log 손실, 잘못된 unit failure injection은 service 중단, webhook test는 외부 message mutation이다.
- 롤백: Monitor timer/service disable, webhook revoke, previous journald drop-in restore와 daemon restart. Replacement가 없으면 Lightsail host alarm은 유지한다. Vacuum된 archived log는 복구 불가하므로 vacuum은 마지막 별도 gate다.

## 실패 처리와 관측

- 각 Task는 독립 commit이며 다음 Task의 credential/external mutation 권한을 암묵적으로 부여하지 않는다.
- Evaluator가 stale/invalid input을 받으면 healthy가 아니라 `unknown`/firing reason으로 남긴다.
- Webhook delivery 실패는 성공으로 기록하지 않고 fixed reason code와 last-attempt UTC만 local state/journal에 남긴다.
- Journal volume이 1GiB ceiling 때문에 30일 미만으로 줄면 redaction 완화나 silent truncation 대신 경보와 owner decision을 요구한다.
- Forbidden value가 보이면 해당 test/run을 실패시키고 실제 secret 가능성이 있으면 revoke를 journal cleanup보다 먼저 수행한다.

## 검증 계획

각 Task에서 먼저 targeted Node tests와 shell syntax/static checks를 실행하고 마지막에 repository 전체 test suite를 실행한다. Systemd 동작은 macOS에서 모사해 완료 처리하지 않고 Task 2의 disposable Ubuntu 24.04 증거를 요구한다. Task 4는 pre/post inventory, exact effective config, actual alert/recovery와 rollback read-back 없이는 완료하지 않는다.

## 배포 및 마이그레이션

Task 1~3은 production-free다. Task 4에서 config snapshot→drop-in install→journald restart/read-back→monitor credential/unit→fake alert→external alarm 순으로 적용한다. 최초 vacuum은 모든 다른 gate가 통과한 뒤 별도 확인한다. CloudWatch/namespace로의 migration은 `ADR-0014` reconsideration 조건이 충족될 때 새 ADR로 결정한다.

## 문서 갱신

- `docs/research/technology-options/journald-retention-redaction-alerting-options.md`: Spike/production evidence와 한계
- `docs/adr/ADR-0014-journald-retention-redaction-alerting.md`: owner 승인 시에만 Accepted 전환
- `docs/operations/journald-and-alerting-runbook.md`: read, incident purge, rotation, alert test와 rollback
- `PROJECT_STATUS.md`: 각 Task evidence, external resource와 unresolved delivery gap

## 승인

- Owner decision: Pending — `ADR-0014` acceptance 전 실행 금지
- Approved date: Pending
