# Schema failure-stage third execution approval request — 2026-07-28

## Execution status

Approved and executed once. The run stopped at access acquisition without
retry; SSH, credential, database, SQL/query, production mutation, and OpenAI
counts were all zero. Final transient cleanup passed with zero remainders.
See
`docs/operations/openai-summary-schema-failure-stage-third-execution-result-2026-07-28.md`.

- 필요한 외부 시스템

  AWS Lightsail production host의 read-only one-time SSH access와 canonical
  PostgreSQL의 connection-only endpoint가 필요하다.

- 필요한 권한 또는 secret 종류

  기존 AWS session의 exact production instance
  `lightsail:GetInstanceAccessDetails` 권한과 production host root가 이미 가진
  bot database URL credential의 메모리 내 1회 읽기가 필요하다. 새 credential,
  token, key, session 또는 provider 권한은 생성·변경·복사하지 않는다. 값,
  endpoint, username과 오류 원문은 출력하지 않는다.

- 정확히 수행할 작업

  SHA-256
  `b54243a4f1112af28cfce1698719e68ffa410d0b72392381f9588722034e7be8`
  controller가 SHA-256
  `8e099f8210e9e0193ba2ae96e57fbbfad509c21385e7d85092d6e5cd8d8af23b`
  shared SSH contract, SHA-256
  `e9b2a694b956af2f8a2812e1e5accf4367292823a7aedb2890de573bcedf54f3`
  remote diagnostic과 기존 schema runner SHA-256
  `815ec04fec7511997ce6a07adba4b7c9a8ea1774be9d2139e7796316a1947067`
  을 검증한다. 한 번의 bounded access acquisition과 SSH master를 수행하고,
  client major 17 확인, credential metadata/read/URI parse, 정확히 한 번의
  `\quit` connection-only handshake와 `mode=STATIC_ONLY` dispatch 계약만
  판정한다. SQL/query, DB row read와 production mutation은 수행하지 않는다.
  첫 실패에서 retry 없이 fixed label만 남기고 cleanup한다.

- 예상 호출/변경 횟수

  AWS access API `1`회, SSH network connection `1`회, SSH retry `0`회, 같은
  master의 remote execution `1`회, credential read `1`회, DB connection-only
  handshake `1`회, SQL/query `0`회, DB row read/mutation `0`회,
  systemd/service/release 변경 `0`회, OpenAI 호출 `0`회다.

- 비용·보안·되돌리기 영향

  Billable resource 생성과 유료 API 사용은 예상하지 않는다. One-time access
  material은 mode `0600` transient로만 유지하고, complete DB URL은 argv,
  environment, file, stdout/stderr에 두지 않는다. Decoded libpq field는
  root-owned child memory/environment에만 잠시 존재한다. Persistent mutation이
  없어 rollback은 필요하지 않으며, master/access/transient cleanup 실패 시
  retry나 범위 확대 없이 `FAIL`로 중단한다.

- 승인하지 않을 경우의 대안

  Historical SSH 차이는 `INCONCLUSIVE`로 유지하고 production, credential과
  DB에 접근하지 않는다. Local fixtures와 pinned controller만 보존하며 summary
  synthetic spike와 release gate는 진행하지 않는다.
