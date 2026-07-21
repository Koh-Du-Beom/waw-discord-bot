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

다음 bounded Spike는 Windows 또는 새 host의 empty PostgreSQL fixture와 temporary least-privilege writer/reader policy를 사용해 download/decrypt/restore verifier를 실행하고, same-run cleanup을 다시 확인해야 한다.
