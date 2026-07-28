# Lightsail access response-only diagnostic approval request — 2026-07-28

## Execution status

Approved and executed exactly once. The controller stopped at `access_api`
without retry, response validation and all downstream operations remained at
zero, and final cleanup passed with zero remainders. See
`docs/operations/openai-summary-lightsail-access-response-diagnostic-result-2026-07-28.md`.

- 필요한 외부 시스템

  AWS Lightsail access API만 필요하다. Production host, SSH, database,
  Discord와 OpenAI에는 접근하지 않는다.

- 필요한 권한 또는 secret 종류

  기존 AWS session의 exact production instance
  `lightsail:GetInstanceAccessDetails` 권한이 필요하다. API가 반환하는 one-time
  SSH access material을 mode `0600` 임시 파일과 메모리에서 구조 검증한 뒤 즉시
  폐기한다. 새 credential, token, key 또는 session은 생성·변경·복사하지 않고
  값, endpoint, username과 provider/parser error 원문을 출력하지 않는다.

- 정확히 수행할 작업

  SHA-256
  `77ffa2c53ec88ebcd3cfc201ce62a9fdf94fbd5fe83f31204d3fe93144080525`
  access-only controller를 한 번 실행한다. 15초 deadline 안에서 access API
  exit status를 `access_api`로 판정하고, 성공한 경우 필수 응답 field의
  type/shape만 `access_response`로 판정한다. 첫 실패에서 retry 없이 fixed
  PASS/FAIL label과 cleanup 결과만 남기고 종료한다.

- 예상 호출/변경 횟수

  AWS access API `1`회, retry `0`회, SSH/network connection `0`회,
  production command `0`회, application credential read `0`회, DB
  connection/query `0`회, production mutation `0`회, OpenAI 호출 `0`회다.

- 비용·보안·되돌리기 영향

  Billable resource 생성과 유료 API 사용은 예상하지 않는다. One-time access
  response는 mode `0700` 임시 directory의 mode `0600` 파일에만 존재하며
  stdout/stderr에는 기록하지 않는다. Persistent mutation이 없어 rollback은
  필요하지 않다. Cleanup 실패 시 retry나 범위 확대 없이 FAIL로 중단한다.

- 승인하지 않을 경우의 대안

  현재 원인을 access API 실행 또는 access response 검증 중 하나로 좁히지 못한
  상태로 유지한다. Existing schema controller는 재실행하지 않고 local
  synthetic fixture와 pinned access-only controller만 보존한다.
