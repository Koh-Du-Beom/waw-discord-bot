# systemd application deployment Spike

- 상태: Completed
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

## 실행 결과

2026-07-22 AWS CloudShell에서 서울 `ap-northeast-2`의 disposable Ubuntu 24.04 `micro_3_0` instance로 실행했다. 최종 실행에서 다음 marker를 모두 확인했다.

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

Web/bot은 서로의 root-owned `0640` environment file을 읽지 못했다. Web은 `SIGKILL` 뒤 다른 PID로 복구됐고, duplicate bot은 exit `73`으로 거부됐다. 실패 release는 health를 통과하지 못했으며 immutable v1 symlink rollback 뒤 health가 복구됐다. 두 service의 `MemoryMax`는 `128M`이었고 web socket은 `127.0.0.1:18080`에만 열렸다. Linux `boot_id`가 실제로 바뀐 뒤 두 service의 enabled/active 상태와 v1 health가 복구됐다.

첫 실행은 service 시작 직후 health readiness 경쟁 조건, 다음 두 실행은 reboot 시작 전 기존 SSH session을 새 boot로 오인한 경쟁 조건과 원격 grep 중첩 인용 오류를 각각 드러냈다. 각 실패 실행도 cleanup marker `0`을 확인한 뒤에만 runner를 수정해 재실행했다. 최종 runner는 initial health polling, 5초 SSH connect timeout, `boot_id` 전환과 reboot 후 service/health polling을 포함한다.

최종 성공 뒤 runner가 만든 instance와 imported key는 각각 matching count `0`이었다. 별도 read-back에서도 `final_instance_count=0`, `final_key_count=0`을 확인했고 CloudShell upload artifact도 삭제했다. Production host, DNS, Supabase, Discord/OAuth credential에는 접근하지 않았다.
