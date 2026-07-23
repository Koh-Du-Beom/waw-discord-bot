# journald 보존·redaction·경보 runbook

- Status: Ubuntu 24.04/systemd 255 production rollout verified; first vacuum not approved
- Scope: `ADR-0014`, `PLAN-0003` Tasks 3~4
- Production domain: `https://waw.dubeom.com`

## Assets and boundaries

- `deploy/journald/60-waw-retention.conf`: persistent 30일/1GiB/4GiB-free ceiling과 forwarding off
- `deploy/systemd/waw-monitor.service`·`.timer`: 1분 evaluator와 file-based Discord webhook credential
- `deploy/monitoring/config.json`: unit, loopback health, backup marker와 certificate monitoring의 non-secret 설정
- `src/operations/run-monitor.ts`: 기존 deterministic evaluator를 호출하고 fixed Discord payload만 전송
- `deploy/install-journald-monitoring-assets.sh`: exact target이 없거나 동일할 때만 install하며 다른 owner config를 덮어쓰지 않는 reversible installer

Monitor는 root service로 system unit, backup marker, journal suppression과 filesystem state만 읽는다. Raw journal line, provider body, hostname, actor/guild/channel ID와 credential 값은 payload나 state에 넣지 않는다. Webhook은 `/etc/waw-credentials/monitor-discord-webhook`에서 `LoadCredential=`로만 읽으며 unit argument·일반 environment·Git에 두지 않는다.

## Production preflight — Task 4 owner gate

다음 항목을 값 자체가 아닌 path/name/count로 inventory한 뒤 owner 승인을 받는다.

1. Existing `/etc/systemd/journald.conf*`, effective config, journal disk usage와 oldest/newest UTC.
2. Actual `waw-web.service`, `waw-bot.service`, `caddy.service`, `waw-backup.timer`, loopback `/health` port와 backup marker path.
3. `/opt/waw/current/src/operations/run-monitor.ts`와 Node 24 availability.
4. Canonical public certificate가 이미 유효한지. 없으면 `certificateHost`는 `null`로 유지한다.
5. Alert 전용 Discord channel/webhook과 Lightsail recovery-email contact.
6. Existing Lightsail alarms, firewall와 unexpected public application ports.

실제 webhook 생성, credential 입력, Lightsail alarm 생성, journald restart, failure injection과 vacuum은 이 문서만으로 승인되지 않는다.

### 2026-07-23 production inventory

Owner-approved rollout의 실제 host는 backup-only다. `waw-backup.timer`만 expected unit이며 runtime health와 certificate monitoring은 각각 `null`이다. Web/bot/Caddy unit과 application release는 preflight 시 없었고 canonical DNS/certificate도 아직 준비되지 않았다. 이 범위는 application 배포 뒤 별도 bounded change로 확장한다.

## Production-free verification

Ubuntu 24.04/systemd 255 clean root에서 다음을 실행한다.

```bash
bash deploy/test-journald-monitoring-assets.sh
node --test src/operations/run-monitor.test.ts
```

첫 명령은 temporary root에 install을 두 번 실행하고 production-sized journald read-back, service/timer `systemd-analyze verify`, unrelated drop-in 보존, rollback과 conflicting exact target default-deny를 확인한다. 두 번째 명령은 synthetic snapshot과 file credential, loopback fake webhook만 사용해 429 bounded retry, no mentions, 1,800-byte payload ceiling과 delivery failure 시 state 미승격을 확인한다.

2026-07-23 final dry run에서 두 검증이 통과했다. Disposable host와 imported key는 same-run 삭제되었고 matching instance, key, static IP, disk와 두 snapshot 유형의 별도 final inventory가 모두 `0`이었다. CloudShell와 local transfer artifact도 `0`으로 확인한 뒤 CloudShell environment를 삭제했다. 실제 webhook, alarm, production host와 production credential은 사용하지 않았다.

## Owner-approved install and read-back

Task 4에서 preflight가 template 가정과 일치할 때만 repository root에서 실행한다.

```bash
sudo deploy/install-journald-monitoring-assets.sh install
sudo systemd-analyze cat-config systemd/journald.conf
sudo systemd-analyze verify waw-monitor.service waw-monitor.timer
sudo systemctl daemon-reload
```

Read-back은 exact `1G`, `4G`, `1day`, `30day`와 네 forwarding `no`를 요구한다. Config/unit path가 이미 있고 asset과 다르면 installer는 `install_target_conflict`로 중단하며 파일을 보존한다. 실제 host의 unit name, health port 또는 marker path가 다르면 template을 먼저 review하고 bounded commit으로 수정한다.

Webhook URL은 owner가 root-only temporary input으로 source file에 설치하고 command line, shell trace와 journal에 출력하지 않는다. Synthetic firing/recovery가 승인된 channel에 각각 한 번 도달한 뒤에만 timer를 enable한다. `certificateHost`는 canonical public certificate가 발급·검증된 뒤 `waw.dubeom.com`으로 바꾼다.

2026-07-23 production 적용에서 `service.waw-backup.timer`의 synthetic critical firing과 resolved recovery가 `NEW NEO WAWRIOUS`의 `waw-discord-bot` channel에 도달했다. Credential은 root-owned mode `0600` source와 systemd runtime alias로만 사용한다. Webhook URL이 UI/terminal에 노출되면 해당 webhook을 즉시 삭제하고 terminal echo를 끈 입력 경로로 새 webhook을 설치한 뒤 endpoint의 channel ID만 read-back한다.

## Rollback

```bash
sudo systemctl disable --now waw-monitor.timer
sudo systemctl stop waw-monitor.service
sudo deploy/install-journald-monitoring-assets.sh rollback
sudo systemctl daemon-reload
```

Installer asset과 exact match하지 않는 operator-modified target은 `rollback_target_changed`로 남긴다. Webhook source와 `/var/lib/waw-monitor/state.json` 제거, provider-side webhook revoke는 Task 4 rollback checklist에서 별도로 확인한다. Journald drop-in을 적용해 daemon을 restart했다면 pre-change copy를 복구하고 effective config를 다시 읽는다.

## Forbidden-value incident and first vacuum

Forbidden value가 보이면 emitter 중지 → 실제 secret 가능 시 revoke/rotate → metadata-only incident 기록 → fixed synthetic scan → rotate/vacuum 순서로 처리한다. `journalctl --vacuum-*`는 unrelated archived file도 삭제하고 복구할 수 없으므로, 최초 production vacuum 전에 oldest/newest UTC와 usage를 기록하고 별도 owner-approved maintenance window를 받아야 한다.

## External host alarm

Local monitor가 실행되지 않는 host/system failure는 Lightsail `StatusCheckFailed` alarm과 recovery email이 담당한다. CPU/burst alarm, CloudWatch Agent, remote journal과 AWS runtime credential은 현재 범위 밖이며 새 근거와 승인 없이는 추가하지 않는다.
