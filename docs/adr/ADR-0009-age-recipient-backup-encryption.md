# ADR-0009: age recipient 기반 backup archive 암호화

- Status: Proposed
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `SEC-007`, `SEC-008`, `DAT-004`, `OPS-005`, `OPS-006`, `ADR-0008`
- Related research: `docs/research/technology-options/backup-encryption-tool-options.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

`ADR-0008`은 S3에 30일 rolling PostgreSQL archive를 client-side encrypted form으로 보관한다. encryption key를 runtime 또는 S3 credential과 함께 두면 backup writer compromise가 archive decryption으로 확장된다. Windows fallback에서도 복호화 가능한, public-recipient 기반의 작은 key custody 경계가 필요하다.

## Considered options

### Option A: age recipient encryption

runtime은 recipient public key로 encrypt만 하고, owner가 가진 secret identity file로만 decrypt한다. private identity는 passphrase-protected offline custody로 둔다.

### Option B: OpenSSL symmetric passphrase

현재 host에 이미 설치돼 있지만 encryption passphrase가 runtime에 있어야 하므로 backup writer와 recovery secret을 분리하지 못한다.

### Option C: S3 SSE-KMS only

S3 provider-side encryption은 유용한 at-rest layer지만 AWS read/KMS decrypt authority를 가진 principal에 archive plaintext recovery를 맡긴다. `ADR-0008`의 client-side encryption boundary를 대체하지 않는다.

## Proposed decision

Option A를 채택한다.

- `age` recipient mode로 compressed PostgreSQL logical dump를 encrypt한다.
- runtime에는 public recipient만 넣고 S3 writer credential과 별도 environment file에 둔다. recipient 자체는 secret이 아니지만 runtime config에만 두어 unneeded exposure를 피한다.
- owner의 private identity file은 passphrase-protected offline custody에 보관한다. Git, S3, Lightsail, Supabase, shell history와 logs에는 두지 않는다.
- restore worker는 owner가 명시적으로 제공한 identity를 ephemeral local file 또는 secure prompt로만 읽고, restore 직후 plaintext·identity copy·temporary archive를 삭제한다.
- S3 default encryption과 TLS는 계속 사용하지만 `age` archive를 대체하지 않는다.

## Rationale

public-recipient encryption은 scheduled backup runtime이 decrypt capability를 갖지 않게 한다. age는 simple file format과 Windows/Linux/macOS 지원 경로를 제공해 Windows fallback의 portability를 유지한다.

## Validation

owner approval 후 synthetic dump를 local에서 keygen/encrypt/decrypt/hash-verify하고, disposable S3 upload/download를 거쳐 empty PostgreSQL에 restore한다. secret identity·plain dump·S3 object와 local temporary file은 verifier 뒤 모두 삭제한다.

## Rollback or migration

archive format version과 recipient fingerprint을 manifest에 기록한다. key rotation은 새 recipient로 새 archive를 만들고, 기존 identity는 approved retention이 만료될 때까지 offline custody에 유지한다. 다른 encryption tool로 이동할 때는 archive compatibility 또는 full decrypt/re-encrypt restore test를 먼저 통과시킨다.

## Conditions for reconsideration

- Windows fallback에서 verified age binary와 decrypt workflow를 재현하지 못하는 경우
- offline identity custody를 owner가 안전하게 유지할 수 없는 경우
- encryption/decryption이 8시간 RTO를 실질적으로 침해하는 경우

## Approval

- Owner decision: Pending
- Approved date: Pending
