# systemd application credential Spike

- 상태: Completed
- 일자: 2026-07-23
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

Owner 지시에 따라 root console CloudShell에서 서울 disposable Ubuntu 24.04 `micro_3_0` fixture를 실행했다. 첫 실행은 `/proc` redirection이 `sudo` 전에 평가되고 root-only source 비교를 일반 user가 수행하는 결함을 발견해 instance/key count `0` 정리 뒤 보정했다. 두 번째 실행은 rollback service가 active가 된 직후 singleton lock 획득 전 검사하는 경쟁 조건을 발견해 count `0` 정리 뒤 bounded lock polling과 MainPID 불변 검사로 보정했다.

최종 실행은 모든 expected marker와 `runner_exit=0`을 확인했다. 별도 inventory 조회에서 matching instance, key pair, static IP, disk와 instance snapshot이 모두 `0`이었다. CloudShell runner/result와 로컬 전송 directory를 제거하고 eu-north-1 및 의도치 않게 열린 us-east-1 CloudShell environment를 삭제했다. 임시 customer-managed IAM policy를 `waw-spike-operator`에서 분리·삭제하고 exact-name 검색 `0`건을 확인했으며 저장소의 `temporary-cloudshell-policy.json`도 삭제했다.

이 결과는 systemd credential 격리·rotation·rollback 가설을 지지한다. 최종 실행 identity는 owner가 명시한 root였으므로 `waw-spike-operator` CloudShell 실행 경계 자체는 검증하지 않았다. Synthetic 값, host IP와 SSH material은 기록하지 않았다.
