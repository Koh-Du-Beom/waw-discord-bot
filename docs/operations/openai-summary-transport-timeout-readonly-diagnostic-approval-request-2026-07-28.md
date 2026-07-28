# Production transport timeout read-only 진단 승인 요청서 — 2026-07-28

## 승인 상태

**승인 대기 중이다. 이 문서는 실행 승인이 아니며, production 접속, application
credential 읽기, DB connection/query와 production mutation을 수행하지 않았다.**

## 고정 대상과 선행 결과

- Source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- Archive SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- Archive size: `656396` bytes
- Schema runner SHA-256:
  `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
- 선행 no-query 진단은 production stage label을 반환하지 못한 채 controller
  transport timeout으로 중단됐고 cleanup은 PASS였다.

## 목적

Application과 DB 경계에 진입하지 않고 선행 timeout이 아래 네 단계 중 어디에서
발생하는지만 구분한다.

1. Controller 시작
2. AWS ephemeral SSH access material 획득
3. SSH connection 수립
4. Production remote shell entry

## 요청하는 exact 실행 계약

모든 단계는 순차적으로 정확히 한 번만 실행한다. 첫 `FAIL`에서 후속 단계를
실행하지 않고 cleanup 후 중단한다.

### 1. Controller start

- CloudShell에서 root-owned가 아닌 caller-private `0700` transient directory를
  하나 만든다.
- 실행 자산의 고정 hash와 output allowlist를 검증한다.
- Controller 자체의 전체 deadline은 `45`초다.

### 2. Access acquisition

- `lightsail:GetInstanceAccessDetails` read-only API를 정확히 한 번 호출한다.
- API deadline은 `15`초다.
- 반환된 private key, SSH certificate와 host keys는 `0600` transient
  material로만 유지한다.
- 값, hash, host, username과 AWS/provider error는 출력하지 않는다.
- Application/DB/OpenAI credential은 찾거나 읽지 않는다.

### 3. SSH connection

- Returned host keys만 사용하는 strict host-key checking을 강제한다.
- Returned private key와 certificate만 사용하고 agent/추가 identity 사용을
  금지한다.
- OpenSSH master connection을 remote command 없이 한 번만 수립한다.
- 다음 bound를 고정한다.

```text
ConnectTimeout=10
ConnectionAttempts=1
ServerAliveInterval=5
ServerAliveCountMax=1
overall SSH establishment deadline=15 seconds
```

- Master control socket에 대한 `ssh -O check`가 성공할 때만
  `ssh_connection=PASS`다.
- SSH stdout/stderr와 provider error는 폐기한다.

### 4. Remote entry

- 이미 수립한 동일 master connection을 재사용한다. 새 network connection이나
  retry를 만들지 않는다.
- Remote command는 `sudo -n`으로 shell entry 가능 여부만 확인하고 즉시
  종료한다.
- Production에서는 file read/write, environment dump, process/service 조회,
  application command와 DB client를 전혀 실행하지 않는다.
- Remote entry deadline은 `10`초다.

## Fixed output allowlist

아래 label 외에는 출력하거나 보존하지 않는다.

```text
TRANSPORT_DIAGNOSTIC controller_start=PASS|FAIL
TRANSPORT_DIAGNOSTIC access_acquisition=PASS|FAIL
TRANSPORT_DIAGNOSTIC ssh_connection=PASS|FAIL
TRANSPORT_DIAGNOSTIC remote_entry=PASS|FAIL
TRANSPORT_DIAGNOSTIC cleanup=PASS|FAIL transient_remainders=0|1
TRANSPORT_DIAGNOSTIC result=PASS|FAIL
```

실행하지 않은 후속 단계의 label은 출력하지 않는다. Credential, private key,
certificate, host key, host, username, IP, provider/AWS/SSH/sudo error와 raw
stdout/stderr는 출력·저장하지 않는다.

## Cleanup

- Master connection이 생성됐다면 동일 control socket으로 종료 요청을 한 번
  보낸다.
- Controller script, access response, key, certificate, known-hosts와 control
  socket을 exact path로 제거한다.
- Exact transient directory가 비었을 때만
  `cleanup=PASS transient_remainders=0`을 출력한다.
- Cleanup failure는 retry하거나 범위를 넓히지 않고
  `cleanup=FAIL transient_remainders=1`로 끝낸다.

## Stop condition

- Exact tuple 또는 실행 자산 불일치
- Controller/access/SSH/remote-entry deadline 초과
- Access response의 required material 부재
- Host-key 또는 identity 경계 불일치
- 예상하지 않은 stdout/stderr나 allowlist 밖 출력 가능성
- 새 SSH connection/retry 시도 징후
- Production command가 entry 확인을 넘어서는 징후
- Application credential, DB 또는 OpenAI 접근 징후
- Production state 변경 징후

어느 조건이든 발생하면 원문 오류를 출력하지 않고 해당 stage를 `FAIL`로
표시한 뒤 cleanup하고 즉시 중단한다.

## 명시적으로 제외하는 작업

- Production diagnostic과 application file/config read: `0`
- Application/DB/OpenAI credential read·생성·변경·복사: `0`
- DB connection과 SQL query: `0`
- DB row read/mutation/migration: `0`
- Bridge/systemd/service 작업: `0`
- Release staging/activation: `0`
- OpenAI 호출: `0`
- SSH connection retry: `0`

## Owner 승인 문구

아래 문구를 그대로 승인할 때만 실행한다.

> Exact candidate `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`,
> archive SHA-256
> `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`,
> 크기 `656396` bytes와 이 요청서의 transport-only 범위를 승인한다.
> Controller start, read-only access acquisition, bounded SSH connection과
> remote shell entry를 순서대로 정확히 한 번 실행하라.
> `ConnectTimeout=10`, `ConnectionAttempts=1`, SSH establishment deadline
> `15`초, remote-entry deadline `10`초와 controller 전체 deadline `45`초를
> 유지하라. Fixed PASS/FAIL label 외에는 출력하지 말고 첫 실패에서 retry 없이
> cleanup하고 중단하라. Production diagnostic, application credential read,
> DB connection/query, production mutation, bridge/systemd/service 작업,
> staging/activation과 OpenAI 호출은 승인하지 않는다.
