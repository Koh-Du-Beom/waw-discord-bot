# Schema query 실패 단계 read-only 진단 승인 요청서 — 2026-07-28

## 승인 상태

**승인 대기 중이다. 이 문서는 실행 승인이 아니며, 아직 production 접속,
credential 읽기, DB connection 또는 query를 수행하지 않았다.**

## 고정 대상

- Source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- Archive SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- Archive size: `656396` bytes
- Schema runner:
  `scripts/check-production-schema-version.sh`
- Schema runner SHA-256:
  `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
- 직전 결과: 승인된 query 1회가 `schema_query=FAIL`로 끝났고, retry 없이
  bridge rollback과 transient cleanup이 완료됐다.

## 목적

DB row를 읽거나 SQL을 서버에 보내지 않고 직전 실패가 다음 네 경계 중 어디에서
발생하는지만 구분한다.

1. PostgreSQL client 실행
2. 기존 credential의 URI 구조 해석
3. DB protocol connection 수립
4. query 직전 SQL dispatch 계약의 정적 일치

민감값과 오류 본문은 보존하거나 출력하지 않는다.

## 중요한 범위 해석

`SQL_DISPATCH`의 실제 성공 여부는 SQL을 서버에 전송해야만 확인할 수 있으므로
“query를 실행하지 않는다”는 이번 승인 경계 안에서는 증명할 수 없다. 따라서
이번 진단의 `sql_dispatch`는 **실제 dispatch가 아니라 정적 pre-dispatch
검증**만 뜻한다. 승인된 runner의 hash, 고정 SQL, client argv와 timeout 계약이
예상값과 일치하면 `PASS`, 아니면 `FAIL`이다. 어떤 SQL도 DB server로 보내지
않는다.

`connection`은 정확히 한 번의 libpq handshake만 허용한다. `psql -X
--no-password --command '\quit'`를 사용해 startup file을 읽지 않고, 접속 직후
psql meta-command로 종료한다. `\quit`은 SQL이 아니며 DB row를 읽거나 변경하지
않는다.

## 요청하는 exact 실행 순서

각 단계는 앞 단계가 `PASS`일 때만 한 번 실행한다. 첫 `FAIL`에서 즉시 정리하고
중단한다.

### 1. Client 실행

- production OS의 `/usr/bin/psql`과 `/usr/bin/python3`만 사용한다.
- `psql --version` 실행 가능 여부와 required major `17`만 판정한다.
- stdout/stderr는 폐기하고 fixed label만 출력한다.

### 2. URI parse

- 기존 root-only DB credential을 메모리에서 정확히 한 번 읽는다.
- credential을 복사, hash, 변경하거나 임시 파일에 쓰지 않는다.
- OS Python 표준 URI parser로 scheme과 required component 존재 여부만
  검증한다.
- credential, DB URL, host, username, password, database 이름과 parse 오류
  본문은 출력하지 않는다.

### 3. Connection

- parse한 값을 root-owned child process environment로만 전달한다. 완전한 URI는
  argv, environment, history, log 또는 파일에 넣지 않는다.
- `PGCONNECT_TIMEOUT=10`, 외부 process timeout `15`초를 적용한다.
- `/usr/bin/psql -X --no-password --command '\quit'`를 정확히 한 번 실행한다.
- stdout/stderr와 provider/libpq error는 폐기한다.
- retry, failover, SQL query와 row read는 모두 `0`이다.

### 4. SQL dispatch 정적 검증

- 승인된 schema runner의 SHA-256을 다시 검증한다.
- runner의 고정 read-only SQL, argv, timeout, single-query 계약을 expected
  asset과 byte-level로 비교한다.
- runner 자체와 `psql` query command는 실행하지 않는다.
- 이 단계는 반드시 `mode=STATIC_ONLY`로 표시한다.

## 출력 allowlist

아래 fixed label 외에는 출력하지 않는다. 값은 명시된 enum 또는 count만
허용한다.

```text
SCHEMA_DIAGNOSTIC client_execution=PASS|FAIL
SCHEMA_DIAGNOSTIC uri_parse=PASS|FAIL
SCHEMA_DIAGNOSTIC connection=PASS|FAIL
SCHEMA_DIAGNOSTIC sql_dispatch=PASS|FAIL mode=STATIC_ONLY
SCHEMA_DIAGNOSTIC query_total=0
SCHEMA_DIAGNOSTIC cleanup=PASS|FAIL transient_remainders=0|1
SCHEMA_DIAGNOSTIC result=PASS|FAIL
```

실행하지 않은 후속 단계는 label을 출력하지 않는다. Credential, DB URL, host,
username, provider error, parser error, SQL text, row 내용과 raw command
stdout/stderr는 출력·저장하지 않는다.

## Stop condition과 cleanup

- exact tuple 또는 runner hash 불일치
- required binary/version 불일치
- credential metadata, read 또는 parse 실패
- connection handshake 실패 또는 timeout
- 정적 dispatch 계약 불일치
- allowlist 밖 출력 가능성이 발견됨
- SQL/query 실행 징후
- production 파일·unit·service·DB 상태 변경 징후

어느 조건이든 발생하면 재시도하지 않는다. 메모리 참조와 root-owned transient
script/access material을 제거하고 remainder count만 확인한 뒤 중단한다.

## 명시적으로 승인 요청에서 제외하는 작업

- SQL dispatch와 DB query: `0`
- DB row read와 DB mutation/migration: `0`
- bridge 설치·재설치·삭제와 daemon-reload: `0`
- service restart/reload: `0`
- release staging/activation과 symlink 변경: `0`
- credential 생성·변경·복사·출력: `0`
- OpenAI 호출: `0`
- 실패 단계 retry: `0`

## Owner 승인 문구

아래 문구를 그대로 승인할 때만 실행한다.

> Exact candidate `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`,
> archive SHA-256
> `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`,
> 크기 `656396` bytes와 schema runner SHA-256
> `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
> 를 대상으로 이 요청서의 production read-only/no-query 진단을 승인한다.
> Client 실행, URI parse, 정확히 1회의 connection-only handshake와
> `mode=STATIC_ONLY` SQL dispatch 계약 검증을 순서대로 수행하라. Fixed
> PASS/FAIL label 외에는 출력하지 말고, SQL/query는 0회로 유지하라. 실패 시
> 재시도하지 말고 transient/access material을 정리한 뒤 즉시 중단하라.
> Production mutation, bridge 재설치, daemon-reload, service restart,
> staging/activation, credential 생성·변경·복사, DB row read/mutation과
> OpenAI 호출은 승인하지 않는다.
