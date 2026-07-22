# ADR-0013: systemd credential로 application secret 주입

- Status: Proposed
- Date: 2026-07-22
- Owners: Project owner
- Related requirements: `SEC-007`~`SEC-010`, `OPS-003`~`OPS-004`, `DEP-002`
- Related research: `docs/research/technology-options/systemd-application-secret-options.md`
- Supersedes: None
- Superseded by: None

## Context

Accepted `ADR-0011`은 서울 Lightsail Ubuntu 24.04에서 web과 bot을 별도 Linux user/systemd service로 실행한다. Web, bot과 backup에 서로 다른 Discord, OAuth/session, database와 S3 capability를 주입하면서 secret 값을 repository, unit, process argument, environment 상속과 journal에서 제외할 구체 경계가 필요하다.

## Decision drivers

- 같은 host에서 service별 최소 secret capability와 cross-read default deny
- 값이 process environment, argument, log와 release artifact로 전파되지 않는 전달 방식
- 한 명의 운영자가 검증·rollback할 수 있는 작은 rotation 절차
- Bot singleton과 bounded downtime 보존
- Clean-host 복구와 외부 secret manager 전환 가능성

## Considered options

### Option A: systemd `LoadCredential=`와 root-owned source file

PID 1이 service activation 때 source를 service 전용 runtime credential file로 제공하고 application이 `$CREDENTIALS_DIRECTORY`에서 읽는다.

### Option B: systemd encrypted credential

`LoadCredentialEncrypted=`와 TPM2/host key로 at-rest ciphertext를 activation 때 복호화한다.

### Option C: root-owned `EnvironmentFile=`

Service별 file permission은 나누되 값을 process environment로 주입한다.

### Option D: AWS Parameter Store 또는 Secrets Manager

KMS/IAM/version/rotation을 사용하고 service가 AWS API로 credential을 가져온다.

## Proposed decision

첫 MVP application secret은 **root-owned source file에서 systemd `LoadCredential=`로 service별 주입**한다.

- Unit file에는 secret literal을 두지 않고 credential name과 root-owned source path만 선언한다.
- Application은 `$CREDENTIALS_DIRECTORY`의 file을 시작 시 읽으며 secret 값을 environment나 command argument로 변환하지 않는다.
- Web, bot과 backup unit은 필요한 credential만 allowlist하고 filesystem/mount namespace sandbox를 사용한다.
- Source directory는 root-only write/read를 기본으로 하고 application release, database/S3 backup과 source control에서 제외한다.
- Rotation은 new credential 생성, root-only stage와 atomic replace, 해당 service restart, health/최소 허용 작업과 cross-read/redaction 확인, old credential revoke 순서다.
- 실패하면 source를 직전 version으로 되돌려 restart하고 새 credential을 revoke한다. Bot service는 singleton guard를 유지한다.
- Audit에는 actor, credential 종류, 대상 service, 시각, 결과/reason code만 남기고 값·hash·식별 가능한 prefix를 남기지 않는다.

`LoadCredentialEncrypted=`는 TPM2/host-key와 clean-host recovery를 함께 검증하기 전 도입하지 않는다. AWS Parameter Store/Secrets Manager는 Lightsail에 service role이 없어 bootstrap AWS credential이 추가되므로 첫 MVP에는 도입하지 않는다.

## Rationale

`LoadCredential=`는 이미 선택한 systemd lifecycle 안에서 service user별 runtime file access를 제공하고 값의 environment 상속을 피한다. Root-owned plaintext source는 host root/disk 보호에 의존하지만 이 한계를 명시하면 현재 작은 운영면에서 secret 전달 blast radius를 줄인다.

Encrypted systemd credential은 at-rest 보호를 강화할 수 있으나 hardware/OS 결합과 clean-host recovery가 아직 검증되지 않았다. AWS managed service는 rotation/audit 기능이 강하지만 Lightsail workload role 부재 때문에 별도 bootstrap credential과 network dependency를 만든다.

## Consequences

### Positive

- Web, bot과 backup의 runtime credential directory와 capability를 명시적으로 분리한다.
- Secret 값이 unit, environment와 command line에 들어가지 않는다.
- 기존 systemd deployment/restart/rollback 운영면을 재사용한다.
- External secret manager 없이 credential-free synthetic Spike가 가능하다.

### Negative

- Application과 사용 library가 file-based credential loading을 지원하도록 adapter가 필요하다.
- Plaintext source의 at-rest 보호는 root permission과 host/disk security에 의존한다.
- Rotation은 provider별 create/revoke와 기능 확인을 운영자가 수행해야 한다.

### Risks

- Root compromise는 모든 source credential을 읽거나 바꿀 수 있다.
- Atomic replace 후 service restart가 실패하면 새/구 provider 상태가 어긋날 수 있다.
- Library가 secret을 오류/log에 출력하면 전달 경계만으로 유출을 막지 못한다.
- Clean-host restore 문서에 source credential 재발급 순서가 없으면 RTO를 지연한다.

## Validation

- Synthetic web/bot source와 runtime credential의 cross-user deny
- Process environment, arguments와 journal의 synthetic secret absence
- Stop 뒤 runtime credential absence
- Atomic rotation의 new success/old deny와 injected-failure rollback
- Bot singleton, service restart와 same-run cleanup

## Rollback or migration

직전 root-owned source version을 atomic restore하고 해당 service만 restart한 뒤 실패한 새 provider credential을 revoke한다. External secret manager로 이전할 때 application의 file-reading contract는 유지하고 provisioning step만 remote fetch 또는 workload identity 기반 materialization으로 교체한다.

## Conditions for reconsideration

- Host root/disk threat가 root-owned plaintext source를 허용하지 않는다.
- Lightsail에서 검증 가능한 hardware-bound encryption과 clean-host recovery가 모두 성립한다.
- Workload role을 제공하는 compute로 이전한다.
- Managed automatic rotation, centralized audit 또는 다수 운영자 승인 흐름이 필수가 된다.
- Provider가 overlap 없는 rotation만 허용해 bounded rollback이 불가능하다.

## Approval

- Owner decision: Pending
