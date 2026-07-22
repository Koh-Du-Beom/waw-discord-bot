# systemd application deployment Spike

- 상태: Approved — execution pending
- 일자: 2026-07-22
- 연결 결정: `ADR-0011`
- 가설: disposable Ubuntu 24.04 1GB host에서 별도 systemd web/bot service가 cross-secret read를 거부하고 crash/reboot를 복구하며 failed release를 이전 immutable release로 rollback할 수 있다.
- 비범위: production host, Supabase/Discord/OAuth credential, canonical DNS/TLS, product code, Docker 설치

## 성공 기준

- `waw-web`과 `waw-bot`은 자기 synthetic secret만 읽고 상대 secret read는 거부된다.
- Web process `SIGKILL` 뒤 새 PID로 재시작하고 localhost health가 복구된다.
- 두 번째 synthetic bot process는 singleton lock 때문에 exit `73`으로 거부된다.
- 실패 release health가 성공으로 승격되지 않고 symlink rollback 뒤 v1 health가 복구된다.
- Web/bot `MemoryMax=128M`, task limit와 localhost-only listen이 read-back된다.
- Host reboot 뒤 두 service가 enabled/active이고 v1 health가 복구된다.
- Instance public firewall은 CloudShell egress `/32`의 SSH 하나뿐이다.
- 성공·실패와 무관하게 tagged instance/key/local SSH material을 same-run 제거하고 matching count `0`을 확인한다.

## 실행 경계

[`run-systemd-deployment-spike.sh`](./run-systemd-deployment-spike.sh)는 AWS CloudShell에서 한 번 실행한다. 시작 전 matching resource count `0`과 active Ubuntu 24.04/1GB bundle을 read-back한다. Create 호출 뒤 UI 오류가 보이더라도 inventory 확인 전 재제출하지 않는다. Root 또는 broad session을 사용하더라도 runner 밖의 resource를 변경하지 않는다.

Runner는 서울 `micro_3_0` fixture 하나와 one-off SSH key만 만들고 static IP, disk, snapshot, backup, DNS와 22 외 public port를 만들지 않는다. 최대 예상 실행은 15분이고 목표 증분 비용은 USD 1 미만이다.

## 실행 명령

```bash
chmod +x run-systemd-deployment-spike.sh
./run-systemd-deployment-spike.sh
```

Expected terminal markers:

```text
cross_secret_deny_passed
crash_restart_passed
singleton_duplicate_denied
failed_release_rollback_passed
cgroup_and_local_port_passed
reboot_recovery_passed
systemd_deployment_spike_passed
cleanup_instance_count=0
cleanup_key_count=0
```

Secret이나 private key content는 출력하지 않는다. Runner의 synthetic secret은 fixture 문자열이며 실제 credential이 아니다.
