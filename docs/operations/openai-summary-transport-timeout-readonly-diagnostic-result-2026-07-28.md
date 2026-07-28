# Production transport timeout read-only 진단 결과 — 2026-07-28

## 상태

**PASS — access, SSH connection, remote entry와 cleanup 모두 정상**

## 고정 대상

- Source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- Archive SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- Archive size: `656396` bytes
- Schema runner SHA-256:
  `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
- Transport controller SHA-256:
  `91cad98dedc7271ef758091463c4077ad6ceed9a06250f56869cdb05ade4138e`

실행 전 exact commit의 schema runner와 transport controller hash 및 Bash
문법을 다시 검증했다.

## Fixed result

```text
TRANSPORT_DIAGNOSTIC controller_start=PASS
TRANSPORT_DIAGNOSTIC access_acquisition=PASS
TRANSPORT_DIAGNOSTIC ssh_connection=PASS
TRANSPORT_DIAGNOSTIC remote_entry=PASS
TRANSPORT_DIAGNOSTIC cleanup=PASS transient_remainders=0
TRANSPORT_DIAGNOSTIC result=PASS
```

`ConnectTimeout=10`, `ConnectionAttempts=1`, SSH establishment deadline 15초,
remote-entry deadline 10초와 controller 전체 deadline 45초가 적용됐다.
Returned host keys, private key와 certificate만 사용한 master connection
수립과 control-socket check가 통과했다. 동일 connection에서 `sudo -n
/bin/sh -c 'exit 0'`만 실행해 remote shell entry가 통과했다.

## 판정

AWS read-only access acquisition, bounded SSH connection과 production remote
entry는 모두 정상이다. 선행 no-query 진단에서 stage label이 반환되지 않은
원인은 이 transport 구간이 아니라 **긴 controller command를 CloudShell
terminal receiver에 제출하는 UI/input 경계**였다. 이번에도 긴 payload를
입력한 뒤 terminal textbox를 직접 click하기 전까지 command가 prompt에
머물렀고, click 후 Enter에서 최초 실행되어 즉시 모든 fixed label이
반환됐다.

입력 receiver에 도달하지 않은 Enter는 controller 실행이나 retry가 아니다.
AWS access API, SSH master connection과 remote entry는 각각 정확히 한 번만
실행됐다.

## 유지된 경계

- AWS access acquisition: `1`
- SSH network connection: `1`
- SSH connection retry: `0`
- Remote entry: `1`
- Production diagnostic/application command: `0`
- Application/DB/OpenAI credential read: `0`
- DB connection/query와 row read/mutation: `0`
- Production file/config read/write: `0`
- Bridge/systemd/service 작업: `0`
- Release staging/activation: `0`
- OpenAI 호출: `0`
- CloudShell controller/access/control-socket remainder: `0`

Credential, host, username, IP와 AWS/SSH/sudo/provider 오류 본문은 출력하지
않았다.

## 다음 gate

Transport는 원인이 아님이 확인됐다. 기존 `schema_query` 원인을 계속 조사하려면
이 결과를 선행조건으로 삼아 이전 schema failure-stage no-query diagnostic의
**새 실행 승인**이 필요하다. 새 controller는 CloudShell textbox를 명시적으로
click한 뒤 Enter를 보내야 하며, transport와 DB connection 모두 retry 없이
각각 한 번만 허용해야 한다.
