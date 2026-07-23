# journald 보존·redaction·경보 Spike

- 상태: Completed — successful disposable execution and final absence verified
- 일자: 2026-07-23
- 연결 결정: `ADR-0014`, `PLAN-0003` Task 2
- 가설: Ubuntu 24.04 systemd 255의 persistent journald가 축소한 time/size ceiling, source allowlist와 workload read deny를 제공하고 local fake webhook이 상태 전이·dedupe·recovery·bounded retry를 검증할 수 있다.
- 비범위: production host/data, 실제 Discord webhook, Lightsail alarm, DNS/TLS/firewall 변경, CloudWatch/remote journal, 실제 secret

## 성공 기준

- `Storage=persistent`, 16MiB/1GiB-free/2MiB-file/10초-file/축소 retention 설정을 effective config에서 읽고 reboot 전 marker를 reboot 후 조회한다.
- 30초 old marker는 rotate/vacuum 뒤 사라지고 new marker는 남으며, random log pressure 뒤 journal directory가 bounded ceiling 안에 있다.
- Synthetic web/bot/Caddy/backup unit은 fixed allowed JSON만 journal에 쓰고 source/runtime credential, 다른 workload journal과 system journal은 workload user가 읽지 못한다.
- Local fake webhook은 firing 1회, duplicate 억제, 6시간 reminder, recovery, 429 `Retry-After`, timeout과 monitor failure rollback을 검증한다.
- 실제 credential·webhook·production에는 접근하지 않고 remote unit/user/config/state/listener/process, Lightsail instance/key/static IP/disk/snapshot과 local temporary artifact가 모두 `0`이다.

## 실행 경계

[`run-journald-alerting-spike.sh`](./run-journald-alerting-spike.sh)는 owner가 로그인한 root AWS CloudShell에서 한 번 실행한다. Runner는 서울 `micro_3_0` Ubuntu 24.04 instance 하나와 one-off imported SSH key만 만들고, CloudShell egress `/32`에 SSH 22만 연다. Create 응답이 불명확하면 inventory 확인 전에 재제출하지 않는다.

Instance 안에서는 합성 credential과 loopback fake webhook만 사용한다. Python·bash·curl·systemd 기본 기능을 재사용하며 package를 설치하지 않는다. 축소 retention은 directive semantics를 검증할 뿐 실제 30일 경과를 증명하지 않는다.

## 실행 명령

```bash
chmod +x run-journald-alerting-spike.sh
./run-journald-alerting-spike.sh
```

Expected final markers:

```text
systemd_255_and_config_readback_passed
reboot_persistence_passed
failed_config_readback_rollback_passed
scaled_retention_passed
scaled_capacity_passed
emitter_allowlist_and_cross_read_deny_passed
fake_webhook_dedupe_recovery_rate_timeout_passed
forced_monitor_failure_rollback_passed
final_redaction_scan_passed
journald_alerting_spike_passed
remote_cleanup_unit_count=0
remote_cleanup_user_count=0
remote_cleanup_file_count=0
remote_cleanup_listener_count=0
remote_cleanup_process_count=0
remote_cleanup_config_count=0
runner_exit=0
cleanup_instance_count=0
cleanup_key_count=0
cleanup_static_ip_count=0
cleanup_disk_count=0
cleanup_instance_snapshot_count=0
cleanup_disk_snapshot_count=0
```

## 결과 기록

2026-07-23 root AWS CloudShell에서 서울 disposable Ubuntu 24.04 `micro_3_0` instance로 실행했다. 최종 실행에서 위 pass marker와 remote cleanup 6개 항목, outer cleanup 6개 Lightsail resource 유형의 `0`을 모두 확인했다. 별도 final inventory에서도 matching instance, key, static IP, disk, instance snapshot, disk snapshot이 모두 `0`이었다.

첫 실행은 fake webhook service가 만든 root-only 요청 로그를 unprivileged SSH user가 읽으려 해 line 286에서 실패했다. 이는 webhook delivery나 격리 계약 실패가 아니라 검증 harness 권한 오류였다. 해당 실행도 remote unit/user/file/listener/process/config와 Lightsail 6개 resource 유형의 cleanup count가 모두 `0`인 것을 확인한 뒤, 검증용 count/scan만 `sudo grep`으로 수정해 재실행했다.

최종 실행은 firing, duplicate 억제, 6시간 reminder, recovery, 429 `Retry-After`, 1초 timeout 2회와 exit `75`, 강제 monitor 실패 뒤 previous config 복구를 통과했다. `remote_spike_error_line` 두 줄은 timeout과 강제 service failure를 의도적으로 관측할 때 inherited `ERR` trap이 기록한 expected diagnostics이며, 이후 pass marker와 `runner_exit=0`으로 성공을 판정했다.

CloudShell의 uploaded runner/result를 삭제한 뒤 matching 파일 출력이 없음을 확인했고, 서울 CloudShell environment도 삭제해 console이 `No active tabs` 상태가 됐다. Local `/tmp/waw-journald-alert-spike.*`도 `0`건이었다. 실제 Discord webhook, Lightsail alarm, production host/data/credential에는 접근하지 않았다.

이 Spike는 축소한 seconds/MiB directive의 동작과 rollback을 증명한다. 실제 30일 경과, production 1GiB에서의 장기 journal 분포, 실제 Discord delivery와 external Lightsail status-check alarm은 Task 3 asset 검토와 별도 승인된 Task 4 증거가 필요하다.
