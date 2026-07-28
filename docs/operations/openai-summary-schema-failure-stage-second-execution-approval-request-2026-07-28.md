# Schema failure-stage no-query 재실행 승인 요청서 — 2026-07-28

## 승인 상태

**Owner 검토 대기 중이다. 이 문서는 실행 승인이 아니며 production/API/SSH,
application credential, DB connection/query와 OpenAI를 사용하지 않았다.**

## 검토할 핵심

이번 요청은 직전 transport PASS를 전제로 기존 `schema_query` 실패가 client,
URI parse, DB connection 중 어디에서 발생하는지만 구분한다. SQL은 보내지
않으며 `sql_dispatch`는 정적 계약 검증으로만 판정한다.

Owner는 아래 항목만 확인하면 된다.

- DB connection-only handshake를 정확히 1회 허용하는가
- Existing DB credential을 메모리에서 1회 읽고 URI 구조만 parse하는 범위가
  맞는가
- SQL query와 row read를 0회로 유지하는가
- Fixed label 밖의 credential·주소·사용자·오류 본문을 숨기는가
- 첫 실패에서 retry 없이 cleanup하고 중단하는가

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
- Transport result: controller, access acquisition, SSH connection, remote
  entry와 cleanup 모두 `PASS`

## 실행 전 별도 고정 조건

실제 schema diagnostic controller는 실행 전에 로컬에서 생성해 Bash 문법,
금지 명령 부재와 SHA-256을 검증한다. 그 exact SHA-256은 CloudShell 실행
직전 command에 함께 넣어 byte 불일치 시
`controller_start=FAIL`로 중단한다. 이 hash 검증은 승인된 계약의 구현 확인이며
아래 production 범위를 변경하지 않는다.

## Exact 순서와 횟수

### 1. Controller와 transport

- CloudShell terminal textbox를 **직접 click해 focus한 뒤 Enter**를 보낸다.
- `lightsail:GetInstanceAccessDetails`: 정확히 `1`회, deadline `15`초
- SSH connection: 정확히 `1`회, retry `0`
- `ConnectTimeout=10`, `ConnectionAttempts=1`
- SSH establishment deadline `15`초
- Returned host keys/private key/certificate만 사용
- Production remote script는 SSH stdin으로만 전달하며 production file을
  생성하지 않는다.
- Controller 전체 deadline: `60`초

### 2. Client execution

- `/usr/bin/psql`과 `/usr/bin/python3` 실행 가능 여부를 확인한다.
- PostgreSQL client major가 exact `17`인지 판정한다.
- Raw version stdout/stderr는 폐기한다.

### 3. URI parse

- Existing `/etc/waw-credentials/bot-database-url`을 root process memory에서
  정확히 한 번 읽는다.
- Credential을 생성, 변경, 복사, hash하거나 file/stdout/log/history에 쓰지
  않는다.
- OS Python 표준 URI parser로 scheme, host, username, database와 허용된
  query option 구조의 유효성만 확인한다.

### 4. DB connection-only handshake

- Parse한 개별 libpq field를 최소 child environment로만 전달한다.
- Full DB URL은 argv/environment/file/history/log에 넣지 않는다.
- `PGCONNECT_TIMEOUT=10`, process deadline `15`초를 적용한다.
- `/usr/bin/psql -X --no-password --command '\quit'`를 정확히 한 번 실행한다.
- `\quit`은 psql meta-command이며 SQL statement를 보내지 않는다.
- stdout/stderr와 libpq/provider error는 폐기한다.
- Connection retry와 failover는 `0`이다.

### 5. Static SQL dispatch contract

- Exact candidate의 schema runner SHA-256과 고정 query/argv/timeout 계약을
  byte-level로 검증한다.
- Runner와 query command는 실행하지 않는다.
- `sql_dispatch`는 반드시 `mode=STATIC_ONLY`로 표시한다.

## Fixed output allowlist

```text
SCHEMA_DIAGNOSTIC controller_start=PASS|FAIL
SCHEMA_DIAGNOSTIC access_acquisition=PASS|FAIL
SCHEMA_DIAGNOSTIC ssh_connection=PASS|FAIL
SCHEMA_DIAGNOSTIC remote_entry=PASS|FAIL
SCHEMA_DIAGNOSTIC client_execution=PASS|FAIL
SCHEMA_DIAGNOSTIC uri_parse=PASS|FAIL
SCHEMA_DIAGNOSTIC connection=PASS|FAIL
SCHEMA_DIAGNOSTIC sql_dispatch=PASS|FAIL mode=STATIC_ONLY
SCHEMA_DIAGNOSTIC query_total=0
SCHEMA_DIAGNOSTIC cleanup=PASS|FAIL transient_remainders=0|1
SCHEMA_DIAGNOSTIC result=PASS|FAIL
```

실행하지 않은 후속 단계는 출력하지 않는다. Credential, DB URL, host,
username, password, database 이름, IP, SQL text, row 내용과
AWS/SSH/sudo/parser/libpq/provider error는 출력·저장하지 않는다.

## Stop condition

- Exact tuple, runner 또는 controller hash 불일치
- Controller/access/SSH/remote/client/connection deadline 초과
- Host-key/identity 경계 불일치
- Client major 불일치
- Credential metadata/read/parse 실패
- Connection-only handshake 실패
- Static dispatch 계약 불일치
- Allowlist 밖 출력 또는 SQL/query/row 접근 징후
- Production state 변경 징후

첫 `FAIL`에서 후속 단계를 실행하지 않고 retry 없이 master connection,
controller/access material과 transient state를 exact path로 정리한 뒤
중단한다.

## 승인에서 제외하는 작업

- SQL dispatch/query와 DB row read: `0`
- DB mutation/migration: `0`
- Production file/config write: `0`
- Bridge 설치·삭제와 daemon-reload: `0`
- Service restart/reload: `0`
- Release staging/activation: `0`
- Credential 생성·변경·복사·출력: `0`
- OpenAI 호출: `0`
- Transport와 DB connection retry: `0`

## Owner 승인 문구

아래 문구를 그대로 승인할 때만 실행한다.

> Exact candidate `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`,
> archive SHA-256
> `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`,
> 크기 `656396` bytes, schema runner SHA-256
> `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
> 와 이 요청서의 schema failure-stage no-query 범위를 승인한다. CloudShell
> textbox를 직접 click한 뒤 controller를 한 번 제출하고, bounded transport,
> client execution, URI parse, 정확히 1회의 connection-only handshake와
> `mode=STATIC_ONLY` dispatch 계약 검증을 순서대로 수행하라. SQL/query와 row
> read는 0회, transport/DB retry는 0회로 유지하라. Fixed label 외에는
> 출력하지 말고 첫 실패에서 cleanup 후 즉시 중단하라. Production mutation,
> bridge/systemd/service 작업, staging/activation, credential 생성·변경·복사와
> OpenAI 호출은 승인하지 않는다.
