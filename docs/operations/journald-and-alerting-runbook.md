# journald 보존·redaction·경보 runbook

- Status: Ubuntu 24.04/systemd 255 production rollout verified; first vacuum not approved
- Scope: `ADR-0014`, `PLAN-0003` Tasks 3~4
- Production domain: `https://waw.dubeom.com`

## Assets and boundaries

- `deploy/journald/60-waw-retention.conf`: persistent 30일/1GiB/4GiB-free ceiling과 forwarding off
- `deploy/systemd/waw-monitor.service`·`.timer`: 1분 evaluator와 file-based Discord webhook credential
- `deploy/monitoring/config.json`: unit, loopback health, backup marker와 certificate monitoring의 non-secret 설정
- `src/operations/run-monitor.ts`: 기존 deterministic evaluator를 호출하고 이벤트별 한국어 Discord embed만 전송
- `deploy/install-journald-monitoring-assets.sh`: exact target이 없거나 동일할 때만 install하며 다른 owner config를 덮어쓰지 않는 reversible installer

Monitor는 root service로 system unit, backup marker, journal suppression과 filesystem state만 읽는다. Raw journal line, provider body, hostname, actor/guild/channel ID와 credential 값은 payload나 state에 넣지 않는다. Webhook은 `/etc/waw-credentials/monitor-discord-webhook`에서 `LoadCredential=`로만 읽으며 unit argument·일반 environment·Git에 두지 않는다.

Discord 경보는 서비스·애플리케이션·백업·인증서·로그 저장 공간·시스템 로그 분기별 한국어 제목과 원인, 문제/복구 상태, 심각도, Discord 현지화 시간을 색상 embed로 표시한다. 등록되지 않은 안전한 alert/reason code는 기술 식별자를 보존한 기본 문구로 표시한다. `allowed_mentions.parse=[]`, 1,800-byte payload ceiling과 raw input 제외 계약은 그대로 유지한다.

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

## `journal.dropped` false-critical hotfix

The production source currently has SHA-256
`abb861d0fe5b5a5be5ad38e599b9afeb19d9be327d524de53b0a3f7af725d44d`.
The reviewed local fix has SHA-256
`b3eb58186142b462c89f5d849edd5490e4871e1619eccf3a4613e15a3c29e3dc`.
Owner-approved production deployment completed on 2026-07-24.

The bounded deployment changes only
`/opt/waw/current/src/operations/run-monitor.ts`. It must not run the monitoring
asset installer, restart journald, alter retention, touch the webhook credential,
reset `/var/lib/waw-monitor/state.json`, or run a vacuum.

After owner approval:

1. Reconfirm the source hash, monitor/backup service results, active/enabled timers,
   journald state and Lightsail alarm.
2. Transfer only the reviewed source to a root-only temporary path and verify the
   fixed hash on the host.
3. Stop `waw-monitor.timer`, wait until `waw-monitor.service` is inactive, preserve
   the old exact-hash source as the rollback copy, and atomically rename the staged
   file into place with owner `root:root` and mode `0644`.
4. Run one `waw-monitor.service` invocation, require exit status `0`, then start the
   timer and read back active/enabled plus the installed hash. Keep the existing
   alert state so ten clear observations produce one resolved notification.
5. Confirm backup service/timer, journald and the Lightsail alarm remain unchanged.
   Remove transfer keys, staged files and the rollback copy only after the
   observation window and owner acceptance.

Rollback stops only the monitor timer, atomically restores the exact old source,
runs one monitor invocation, restarts the timer and rechecks the same inventory.
The old behavior will restore the known false critical; backup, journald, webhook,
alarm and state remain untouched.

Production read-back matched the reviewed fixed hash. The one-shot service returned
`success`/`0`; the existing state reached ten consecutive clear observations and
sent one resolved notification at `2026-07-24T08:59:07.035Z`. Monitor and backup
timers remained active/enabled, both services remained successful, journald stayed
active and the Lightsail alarm stayed `OK`. The staged source, ephemeral SSH
material and rollback copy were removed. No journald setting, retention, webhook,
state file or vacuum was changed.

## 한국어 Discord embed 전환

- Status: reviewed procedure; not deployed
- Branch: `feat/korean-discord-alert-embeds`
- Implementation commit: `383ca86`
- Display-branch test commit: `07a4c60`
- Candidate `run-monitor.ts` SHA-256:
  `ebb81df5b96e0fa9f4160f9fb5030ffce734fc31c3bcc161e8504eccc2cb2174`
- Expected predecessor when no newer approved monitor source exists:
  `b3eb58186142b462c89f5d849edd5490e4871e1619eccf3a4613e15a3c29e3dc`

이 전환은 Discord payload 표현만 바꾼다. Alert threshold, debounce, dedupe,
reminder, recovery state, webhook credential, monitoring config, systemd unit,
journald와 backup은 변경하지 않는다. Exact predecessor hash가 다르면 newer
approved source 여부를 먼저 조사하고 배포를 중단한다. Candidate로 무조건
덮어쓰지 않는다.

### Read-only preflight

아래 검사는 production mutation 승인이 없어도 실행할 수 있지만 credential
내용과 raw journal line을 출력하지 않는다.

```bash
sudo sha256sum /opt/waw/current/src/operations/run-monitor.ts
readlink -f /opt/waw/current
node --version
sudo stat -c '%U:%G %a %n' \
  /opt/waw/current/src/operations/run-monitor.ts \
  /etc/waw-credentials/monitor-discord-webhook \
  /var/lib/waw-monitor/state.json
sudo systemctl is-active waw-monitor.timer waw-backup.timer systemd-journald.service
sudo systemctl is-enabled waw-monitor.timer waw-backup.timer
sudo systemctl show waw-monitor.service waw-backup.service \
  --property=Result,ExecMainStatus,ExecMainStartTimestamp
sudo systemctl cat waw-monitor.service waw-monitor.timer
sudo journalctl --disk-usage
sudo node -e "const fs=require('node:fs');const p='/var/lib/waw-monitor/state.json';const s=JSON.parse(fs.readFileSync(p,'utf8'));for(const [k,v] of Object.entries(s)){console.log(JSON.stringify({alert_key:k,severity:v.severity,candidate:v.candidate,candidate_count:v.candidateCount,reason_code:v.reasonCode,last_observed_at:v.lastObservedAt,last_notified_at:v.lastNotifiedAt}))}"
```

Operator는 별도 read-only provider inventory에서 Lightsail status-check alarm이
`OK`인지 확인하고, Discord UI에서 webhook이 승인된 `waw-discord-bot` channel을
가리키는지만 확인한다. Webhook URL은 출력하거나 API argument에 넣지 않는다.

다음을 모두 만족해야 배포 gate를 열 수 있다.

1. Candidate branch가 clean이고 관련 monitor tests, typecheck와
   `git diff --check`가 통과한다.
2. Installed source hash가 expected predecessor와 일치한다. 다르면 배포를
   중단하고 installed source와 candidate를 review한다.
3. Monitor/backup timer가 active+enabled이고 최근 oneshot result/status가
   `success`/`0`이다.
4. Journald가 active이고 Lightsail alarm이 `OK`다.
5. Credential은 root-owned mode `0600`이며 내용을 읽거나 교체하지 않는다.
6. State file이 parse 가능하고 기존 firing/candidate 상태와 마지막 알림 시각을
   metadata-only로 기록한다.
7. 기존 Discord critical이 있다면 `alert_key`, `reason_code`, `first_observed_at`,
   `last_observed_at`만 기록해 신규 장애와 6시간 reminder를 구분한다.
8. Owner가 한 파일 교체, 합성 firing/resolved 각 1건과 observation window를
   명시적으로 승인한다.

### Bounded rollout and acceptance

배포는 기존 hotfix와 같은 한 파일 atomic replacement 절차를 사용한다.
`/var/lib/waw-monitor/run-monitor.ts.pre-korean-embed`를 rollback copy의 exact
path로 사용하고 그 hash가 preflight predecessor와 일치하는지 확인한다.
Timer를 중지하고 active oneshot이 없을 때만 candidate를 같은 target directory의
staged file에 mode `0644`, owner `root:root`로 설치한 뒤 atomic rename한다.

Candidate 설치 뒤 한 번의 monitor invocation이 `success`/`0`이어야 한다.
기존 state는 초기화하지 않는다. Timer를 다시 시작하기 전에 승인 channel에
metadata-only 합성 critical/resolved embed를 각각 한 건만 보내 다음을
확인한다.

- 한국어 title과 description
- critical red, resolved green 및 textual severity
- 최초 감지/최근 확인 Discord timestamp
- technical alert key와 service version footer
- mention 부재와 raw journal/credential 부재

Timer를 active+enabled로 복구한 뒤 최소 10분 관찰한다. Monitor/backup result,
journald와 Lightsail alarm이 preflight와 같고 예상하지 않은 duplicate alert가
없어야 acceptance다. 그 전에는 rollback copy를 삭제하지 않는다.

### Exact rollback

다음 중 하나면 즉시 rollback한다.

- candidate hash 불일치
- monitor oneshot non-zero 또는 payload delivery 실패
- Discord embed 누락, 잘못된 channel, mention 또는 금지값 노출
- 기존 alert state 손상
- backup timer, journald 또는 Lightsail alarm의 예상하지 않은 상태 변화

Rollback은 monitor source만 복원한다. 아래 명령 전에 rollback copy hash가
preflight에서 기록한 predecessor hash와 정확히 일치해야 한다.

```bash
sudo systemctl stop waw-monitor.timer
sudo systemctl stop waw-monitor.service
sudo test -f /var/lib/waw-monitor/run-monitor.ts.pre-korean-embed
sudo sha256sum /var/lib/waw-monitor/run-monitor.ts.pre-korean-embed
sudo install -o root -g root -m 0644 \
  /var/lib/waw-monitor/run-monitor.ts.pre-korean-embed \
  /opt/waw/current/src/operations/.run-monitor.ts.rollback
sudo mv -f \
  /opt/waw/current/src/operations/.run-monitor.ts.rollback \
  /opt/waw/current/src/operations/run-monitor.ts
sudo sha256sum /opt/waw/current/src/operations/run-monitor.ts
sudo systemctl start waw-monitor.service
sudo systemctl show waw-monitor.service --property=Result,ExecMainStatus
sudo systemctl start waw-monitor.timer
sudo systemctl is-active waw-monitor.timer waw-backup.timer systemd-journald.service
sudo systemctl is-enabled waw-monitor.timer waw-backup.timer
```

복원된 source hash, monitor `success`/`0`, timer active+enabled, backup/journald와
Lightsail alarm 불변을 확인한다. `/var/lib/waw-monitor/state.json`,
`/etc/waw-credentials/monitor-discord-webhook`, monitoring config, systemd unit과
journal은 수정·삭제하지 않는다. 잘못된 channel 또는 금지값 노출이 원인이면
source rollback 뒤 webhook revoke/rotation을 별도 credential incident로
처리한다. Rollback copy는 owner가 복구 결과를 승인한 뒤에만 삭제한다.

## Forbidden-value incident and first vacuum

Forbidden value가 보이면 emitter 중지 → 실제 secret 가능 시 revoke/rotate → metadata-only incident 기록 → fixed synthetic scan → rotate/vacuum 순서로 처리한다. `journalctl --vacuum-*`는 unrelated archived file도 삭제하고 복구할 수 없으므로, 최초 production vacuum 전에 oldest/newest UTC와 usage를 기록하고 별도 owner-approved maintenance window를 받아야 한다.

## External host alarm

Local monitor가 실행되지 않는 host/system failure는 Lightsail `StatusCheckFailed` alarm과 recovery email이 담당한다. CPU/burst alarm, CloudWatch Agent, remote journal과 AWS runtime credential은 현재 범위 밖이며 새 근거와 승인 없이는 추가하지 않는다.
