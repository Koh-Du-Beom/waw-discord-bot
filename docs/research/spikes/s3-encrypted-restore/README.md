# Disposable S3 encrypted archive Spike

- 상태: Partial — S3 create/upload/list/delete/cleanup passed; restore path remains unverified
- 실행일: 2026-07-21
- 범위: owner-authorized AWS console session, one disposable bucket, one client-side `age` encrypted synthetic SQL archive
- 비범위: Supabase, production data, production key, AWS access key, owner identity, lifecycle/IAM policy changes, Windows/new-host PostgreSQL restore

## 확인한 결과

1. `AmazonS3FullAccess`가 연결된 disposable operator session으로 Stockholm region의 uniquely named general-purpose bucket을 생성했다.
2. synthetic SQL만 포함한 331-byte `age` archive를 local temporary file로 생성하고, S3 console upload가 성공한 뒤 object count `1`을 확인했다.
3. console object delete 후 object count `0`을 확인했다.
4. disposable bucket delete 후 general-purpose bucket count `0`을 확인했다.
5. local synthetic archive와 screenshot artifact를 삭제했다. AWS credential, private identity, raw SQL, bucket URL은 기록하지 않았다.

## 제한 및 다음 검증

Orca browser download hook은 선택된 object를 expected local path에 전달하지 못했다. 따라서 이 실행은 S3 upload/list/delete와 cleanup만 증명하며 downloaded-byte checksum, wrong-identity failure, valid-identity decrypt, empty PostgreSQL restore, backup-only writer deny 및 lifecycle prefix scope는 증명하지 않는다.

같은 hook 한계는 temporary self-managed access-key CSV download에도 재현됐다. key secret을 local file·log·문서에 저장하지 않았고, access key를 즉시 비활성화·삭제한 뒤 IAM console의 key count `0`을 확인했다. 따라서 S3 CLI byte-checksum verifier는 실행하지 않았다. owner가 temporary self access-key IAM policy attachment를 제거했고, 새 console session에서 `iam:ListAccessKeys`가 다시 denied인 것으로 제거를 확인했다.

## Local restore companion

`run-local-postgres-restore.zsh`는 Docker의 disposable PostgreSQL 16 source/target 두 개와 synthetic fixture만 사용한다. source custom dump를 `age`로 encrypt/decrypt하여 target empty database에 restore하고 row count와 invariant를 확인한다. trap이 containers와 temporary key/archive를 지운다. 실행 전에는 `postgres:16-alpine` image가 필요하며, AWS/Supabase/production credential을 사용하지 않는다.

2026-07-21 실행에서 encrypted archive byte round trip, target row count `2`, `restore-check` invariant를 통과했다. Docker container 잔존 여부도 실행 뒤 검사했다. 이는 local container evidence이며 Windows 또는 새 host recovery evidence와 같지 않다.

다음 AWS-bound Spike는 temporary least-privilege writer/reader policy를 사용해 S3 download checksum까지 연결하고, same-run cleanup을 다시 확인해야 한다. Windows 또는 새 host의 empty PostgreSQL restore는 이 local companion과 별도로 증명해야 한다.
