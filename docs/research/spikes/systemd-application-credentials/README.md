# systemd application credential Spike

- 상태: Ready to run
- 일자: 2026-07-22
- 연결 결정: `ADR-0013`
- 가설: disposable Ubuntu 24.04 host의 systemd `LoadCredential=`가 web/bot synthetic credential을 runtime file로 격리하고 값 없는 rotation·rollback 절차를 제공한다.
- 비범위: production host/credential, Discord/OAuth/Supabase/S3 API, `LoadCredentialEncrypted=`, external secret manager, DNS/TLS

## 성공 기준

- Source file은 root-only이고 service user도 직접 읽지 못하지만 각 service는 자기 runtime credential만 읽는다.
- Web user는 bot runtime credential을, bot user는 web runtime credential을 읽지 못한다.
- Synthetic 값은 process environment, command line과 journal에 없다.
- Service stop 뒤 해당 runtime credential directory/file이 사라진다.
- Web credential atomic rotation은 new success/old deny가 되고 bot PID에는 영향을 주지 않는다.
- Bot invalid rotation은 시작 실패 뒤 직전 source로 rollback되고 singleton process 하나만 복구된다.
- 성공·실패와 무관하게 tagged instance/key/local SSH material을 same-run 제거하고 matching count `0`을 확인한다.

## 실행 경계

[`run-systemd-credential-spike.sh`](./run-systemd-credential-spike.sh)는 AWS CloudShell에서 한 번 실행한다. 시작 전 prefix resource count `0`, active Ubuntu 24.04 blueprint와 서울 1GB bundle을 read-back한다. Create 응답이 불명확하면 inventory를 확인하기 전에 재제출하지 않는다.

Runner가 만드는 것은 unique tagged `micro_3_0` instance 하나와 one-off SSH key뿐이다. Public firewall은 실행 CloudShell egress `/32`의 SSH만 허용하고 static IP, disk, snapshot, DNS, S3/IAM principal과 production credential은 만들거나 읽지 않는다. Synthetic 값과 SSH private key content는 출력하지 않는다.

## 실행 명령

```bash
chmod +x run-systemd-credential-spike.sh
./run-systemd-credential-spike.sh
```

Expected markers:

```text
source_and_runtime_isolation_passed
process_and_journal_absence_passed
stop_runtime_absence_passed
atomic_rotation_passed
failed_rotation_rollback_passed
singleton_after_rollback_passed
systemd_credential_spike_passed
cleanup_instance_count=0
cleanup_key_count=0
```

## 결과 기록

실행 뒤 marker, 발견된 실패와 최종 AWS/local resource absence만 기록한다. Synthetic 값, host IP와 SSH material은 기록하지 않는다.
