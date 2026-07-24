# systemd application secret 주입과 회전 선택지

- 상태: Research complete — owner decision required
- 확인일: 2026-07-22
- 연결 결정: D-07, D-10, D-11, `ADR-0007`, `ADR-0011`
- 연결 요구사항: `SEC-007`~`SEC-010`, `OPS-003`~`OPS-004`, `DEP-002`

## 고정 제약

- 서울 Lightsail Ubuntu 24.04 한 대에서 web, bot과 backup을 별도 systemd service/Linux user로 실행한다.
- Web은 bot token과 backup/migration credential을, bot은 browser session/OAuth secret과 owner recovery identity를 읽지 않는다.
- Secret 값은 repository, unit file, process argument, journal, 채팅과 배포 산출물에 넣지 않는다.
- Rotation 중에도 한 개의 bot process만 실행하며, 실패하면 검증된 구 credential로 bounded rollback할 수 있어야 한다.
- 첫 MVP는 운영자가 한 명이고 월 3만 원 예산 목표다. 외부 secret manager는 실제 blast-radius 감소가 bootstrap credential과 운영면보다 커야 한다.

## 대안 비교

| 대안 | 서비스 경계 | 저장·전달 | 회전과 복구 | 주요 위험 |
|---|---|---|---|---|
| systemd `LoadCredential=` + root-owned source file | PID 1이 activation 때 service 전용 credential directory를 만들고 kernel file permission을 매 접근마다 검사한다. Mount namespacing을 함께 쓰면 다른 service에서 runtime directory를 숨길 수 있다. | Application은 `$CREDENTIALS_DIRECTORY` 아래 파일을 읽는다. 값은 environment나 argument에 넣지 않는다. 다만 plaintext source file의 at-rest 보호는 root ownership, host/disk 통제에 의존한다. | 새 root-only file을 stage·검증하고 atomic rename 뒤 해당 service만 restart한다. 새 credential 기능 확인 후 provider에서 구 credential을 revoke한다. | Host root 침해와 source disk 탈취를 막지 못한다. Application/library가 file path 입력을 지원하도록 adapter가 필요하다. |
| systemd `LoadCredentialEncrypted=` | runtime 격리는 동일하고 activation 때만 복호화한다. | TPM2와 host key, host key 단독 또는 TPM2 단독으로 AES-256-GCM 보호할 수 있다. | Ciphertext를 다시 만들어 restart한다. Hardware/OS에 결합하면 clean-host 복구 때 같은 방식으로 복호화할 수 없다. | 현재 Lightsail TPM2 가용성·clean-host key custody를 검증하지 않았다. Host key만 같은 disk에 있으면 offline theft 완화는 제한적이다. |
| root-owned `EnvironmentFile=` | Linux file permission으로 service별 source를 나눌 수 있다. | 값이 process environment로 들어가 child process에 상속될 수 있다. Binary/크기와 accidental dump 경계도 약하다. | 파일 교체와 restart는 단순하다. | 최소 구현이지만 systemd가 명시한 environment 전달 문제를 그대로 가진다. |
| AWS Parameter Store/Secrets Manager | IAM resource/action으로 secret별 read를 제한하고 KMS, version/audit 또는 managed rotation을 쓸 수 있다. | Service가 AWS API에서 값을 받아야 한다. Lightsail은 service role을 지원하지 않아 별도 bootstrap AWS credential 또는 외부 federation이 필요하다. | Parameter Store는 lightweight/non-rotating 값에, Secrets Manager는 automatic rotation에 더 적합하다. | 새 AWS credential, SDK/network/KMS dependency와 outage가 생긴다. 장기 bootstrap key를 host에 두면 핵심 문제를 이동시킨다. |

## 공식 근거

- systemd credential은 activation 때 획득해 deactivation 때 폐기하며, service user만 읽는 immutable file로 `$CREDENTIALS_DIRECTORY`에 제공한다. Environment와 달리 process tree로 값이 전파되지 않고, mount namespacing으로 다른 service에서 runtime directory를 숨길 수 있다. [systemd System and Service Credentials](https://systemd.io/CREDENTIALS/)
- `SetCredential=` literal은 unit file과 D-Bus에서 보이므로 민감값에 사용하면 안 된다. `LoadCredential=`은 file/socket/system credential을, `LoadCredentialEncrypted=`은 암호화된 credential을 activation 시 복호화해 전달한다. [systemd System and Service Credentials](https://systemd.io/CREDENTIALS/)
- systemd encrypted credential은 TPM2, `/var/lib/systemd/credential.secret` 또는 둘을 조합할 수 있다. 기본 hardware+OS 결합은 다른 clean host에서 준비하거나 복호화할 수 없으므로 recovery 설계가 먼저 필요하다. [systemd credential encryption](https://systemd.io/CREDENTIALS/#encryption)
- AWS Parameter Store SecureString은 KMS encryption, IAM, version history를 제공한다. Standard tier는 값당 4KB이고 추가 Parameter Store 요금이 없지만 AWS는 automatic rotation·cross-account·fine-grained audit가 필요한 credential에는 Secrets Manager를 권장한다. [AWS Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), [SecureString KMS encryption](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)
- AWS Secrets Manager는 rotation schedule과 Lambda rotation function을 제공한다. 이 기능은 provider credential 자체의 rotation을 자동화할 때 유리하지만 application의 AWS authentication을 별도로 해결해야 한다. [AWS Secrets Manager rotation schedules](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_schedule.html)
- Lightsail은 federated user 등의 temporary credential 사용은 지원하지만 instance workload에 붙이는 service role은 지원하지 않는다. 따라서 EC2 instance profile과 같은 credential-free AWS API 접근을 Lightsail에 가정할 수 없다. [Lightsail IAM roles](https://docs.aws.amazon.com/lightsail/latest/userguide/security_iam_service-with-iam.html#security_iam_service-with-iam-roles)

## 잠정 결론

첫 MVP application secret은 **root-owned source file에서 systemd `LoadCredential=`로 service별 주입**하는 것이 가장 작은 올바른 경계다. Unit에는 값이 아니라 credential 이름과 source path만 두며 application은 `$CREDENTIALS_DIRECTORY` 아래 파일을 시작 시 읽는다. Web, bot과 backup은 각자 필요한 credential만 선언하고 `PrivateMounts=` 또는 이를 포함하는 filesystem sandbox를 켠다.

이 선택은 host root 또는 disk compromise를 해결한다고 주장하지 않는다. Source directory는 root만 쓰고 읽을 수 있게 하며 backup과 release archive에서 제외한다. `LoadCredentialEncrypted=`는 disposable Ubuntu에서 TPM2/host-key 동작과 clean-host recovery가 함께 통과할 때만 후속 강화로 검토한다.

Parameter Store/Secrets Manager는 EC2 instance profile 같은 workload identity를 쓸 수 있는 host로 이전하거나, managed rotation·central audit 요구가 Lightsail bootstrap credential을 정당화할 때의 strongest alternative다. Lightsail에 장기 AWS access key 하나를 추가해 remote secret을 가져오는 구성은 현재 추천하지 않는다.

## 제안 회전 계약

1. Provider에서 기존 credential을 즉시 폐기하지 않고 최소 권한의 새 credential을 만든다. 가능한 provider는 current/next overlap을 사용한다.
2. 운영자 terminal의 echo/history를 피하는 root-only 입력 경로로 같은 filesystem의 staging file을 만들고 mode/owner와 비어 있지 않음을 값 출력 없이 검사한다.
3. Staging file을 canonical source path로 atomic rename하고 해당 service만 restart한다. Bot은 singleton guard를 먼저 확인한다.
4. Local health와 provider의 최소 허용 작업을 확인하고, 다른 service가 새 credential을 읽지 못하며 journal/redaction scan에 값이 없음을 synthetic fingerprint로 검증한다.
5. 성공 후 구 provider credential을 revoke하고 재사용 실패를 확인한다. 실패하면 source path를 구 version으로 되돌리고 service를 restart한 뒤 새 credential을 revoke한다.
6. Actor, credential 종류, service, 시작/종료 시각, 결과와 reason code만 감사하고 값·hash·prefix는 기록하지 않는다.

Rotation 주기는 provider expiry/incident 요구와 함께 implementation plan에서 정한다. 유출 의심, 담당자 변경, 권한 확대 또는 환경 혼용은 정기 주기와 무관한 즉시 rotation 사유다.

## 승인 후 credential-free Spike

Disposable Ubuntu 24.04 또는 local systemd fixture에서 합성값만 사용한다.

1. Web/bot 별도 user와 root-owned source file을 만들고 각 unit에 자기 credential만 `LoadCredential=`한다.
2. Application fixture가 environment 값이 아닌 credential file path로 읽으며 `/proc/<pid>/environ`, command line과 journal에 값이 없음을 확인한다.
3. Cross-user/source/runtime-directory read를 거부하고 service stop 뒤 runtime credential file 부재를 확인한다.
4. Atomic replacement와 단일-service restart로 new success/old deny, injected failure rollback과 bot singleton을 검증한다.
5. Source, unit, user, journal fixture와 temporary host를 same-run cleanup하고 최종 absence를 확인한다.

Production Discord/OAuth/DB credential은 이 Spike에 사용하지 않는다. `LoadCredentialEncrypted=`와 external secret manager는 이 ADR 승인만으로 배포하지 않는다.

## Owner decision

`ADR-0013의 systemd LoadCredential 기반 application secret 주입과 회전 계약을 검토해. 승인하면 합성 credential만 사용하는 disposable Ubuntu 24.04 격리·rotation·rollback Spike를 진행해.`
