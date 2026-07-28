# Schema query 실패 단계 read-only 진단 결과 — 2026-07-28

## 상태

**STOPPED — controller transport timeout, stage 판정 없음, cleanup PASS**

## 고정 대상

- Source commit:
  `78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`
- Archive SHA-256:
  `fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`
- Archive size: `656396` bytes
- Schema runner SHA-256:
  `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`

실행 전 exact commit 안의 runner를 다시 hash해 승인값과 일치함을 확인했다.

## 관찰 결과

CloudShell controller를 한 번 제출했으나 허용된 관찰 시간 안에 production
stage label이나 terminal prompt가 반환되지 않았다. 따라서 같은 진단을
재실행하지 않고 별도 CloudShell terminal에서 exact controller/SSH process만
종료한 뒤 controller와 access transient 경로를 제거했다.

확인된 fixed output은 다음과 같다.

```text
SCHEMA_DIAGNOSTIC query_total=0
SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0
SCHEMA_DIAGNOSTIC result=FAIL
```

`client_execution`, `uri_parse`, `connection`, `sql_dispatch` label은 하나도
반환되지 않았다. 그러므로 네 단계의 PASS/FAIL과 production remote script
도달 여부는 `UNKNOWN`이다. 이것은 기존 `schema_query` 실패의 원인을 판정한
결과가 아니다.

## 유지된 경계

- 재실행/retry: `0`
- SQL query: `0`
- DB row read/mutation/migration: `0`
- bridge 설치·재설치·삭제: `0`
- daemon-reload와 service restart/reload: `0`
- release staging/activation: `0`
- credential 생성·변경·복사·출력: `0`
- OpenAI 호출: `0`
- CloudShell controller/access transient remainder: `0`

전달한 production script에는 `psql -X --no-password --command '\quit'` 이외의
DB command가 없었으므로 SQL query는 실행될 수 없었다. 다만 stage label이
없어 existing credential read와 connection-only handshake가 production에서
실제로 시작됐는지는 확인할 수 없다. Provider/libpq error, credential, DB URL,
host, username과 row 내용은 출력하지 않았다.

## 다음 gate

이번 승인은 retry를 허용하지 않았으므로 여기서 중단한다. 원인 조사를 계속하려면
transport 자체에 bounded connect timeout과 controller-start/remote-entry
fixed label을 추가한 **새 no-query 진단 실행 승인**이 필요하다. 새 승인 전에는
production 접속, credential read, connection, query 또는 bridge 작업을 하지
않는다.
