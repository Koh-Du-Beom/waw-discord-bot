# Backup age recipient encryption contract Spike

- 상태: Passed
- 실행일: 2026-07-21
- 가설: runtime에 recipient public key만 있어도 compressed PostgreSQL-style logical archive를 encrypt하고, 별도 identity로 원문·무결성을 복원할 수 있다.
- 범위: local synthetic key와 non-sensitive synthetic SQL만 사용
- 비범위: S3, Supabase, production key, owner identity, AWS credential, Windows restore

## 절차

`run.zsh`는 temporary directory에 synthetic age identity와 SQL fixture를 만들고 다음을 수행한다.

1. identity에서 recipient public key를 유도한다.
2. synthetic SQL을 gzip + recipient encryption 한다.
3. identity로 decrypt + gunzip 후 byte comparison을 한다.
4. encrypted archive에 `AGE-SECRET-KEY` marker가 없음을 확인한다.
5. archive hash와 byte count만 출력하고 temporary directory를 trap으로 삭제한다.

`age-keygen` 출력, identity, plaintext SQL과 archive path는 기록하거나 출력하지 않는다.

## 실행 결과

```text
PASS: synthetic age recipient encryption round trip
archive_bytes=<run-specific byte count>
archive_sha256=<run-specific SHA-256>
```

## 해석

`ADR-0009`의 public-recipient/offline identity 경계는 local synthetic fixture에서 작동한다. 이 결과는 S3 upload/download, Supabase logical dump 또는 Windows PostgreSQL restore의 성공을 증명하지 않는다. 다음 Spike는 AWS owner login 후 disposable bucket·scoped IAM credential·synthetic PostgreSQL archive로 이 경로를 검증한다.
