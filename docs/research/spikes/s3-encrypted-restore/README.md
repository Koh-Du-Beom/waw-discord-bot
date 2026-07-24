# Disposable S3 encrypted archive Spike

- 상태: Complete — actual S3 byte continuity, least-privilege IAM, lifecycle, new-host restore와 cleanup 통과
- 실행일: 2026-07-21~2026-07-22
- 범위: owner-authorized AWS console session, uniquely named disposable buckets, client-side encrypted synthetic archives, tagged disposable IAM users
- 비범위: Supabase, production data/credential, production key, owner recovery identity, Windows restore

## 확인한 결과

1. `AmazonS3FullAccess`가 연결된 disposable operator session으로 Stockholm region의 uniquely named general-purpose bucket을 생성했다.
2. synthetic SQL만 포함한 331-byte `age` archive를 local temporary file로 생성하고, S3 console upload가 성공한 뒤 object count `1`을 확인했다.
3. console object delete 후 object count `0`을 확인했다.
4. disposable bucket delete 후 general-purpose bucket count `0`을 확인했다.
5. local synthetic archive와 screenshot artifact를 삭제했다. AWS credential, private identity, raw SQL, bucket URL은 기록하지 않았다.

## 2026-07-22 S3/IAM transport 보완

`run-s3-iam-transport-spike.sh`를 owner-authorized CloudShell에서 실행했다. 이 재현 스크립트는 실행마다 고유 bucket과 tagged writer/reader를 만들고, key secret과 encryption passphrase를 shell 및 `mktemp` directory 밖으로 내보내지 않으며 exit trap으로 access key, inline policy, IAM user, object, bucket과 temporary files를 제거한다.

두 번의 성공 실행에서 시작 전 matching bucket/IAM user count가 각각 `0`임을 확인했다. 첫 writer call은 새 access key 전파 동안 `InvalidAccessKeyId`가 발생했으나 bounded retry 뒤 성공했다. 결과는 다음과 같다.

- client-side AES-256-CBC/PBKDF2 synthetic archive의 실제 S3 `PutObject`→`GetObject` byte count `64`와 SHA-256이 각 실행에서 일치했고, downloaded ciphertext를 valid passphrase로 decrypt한 plaintext도 원본과 일치했다.
- writer는 `backups/` 아래 `PutObject`만 성공하고 `GetObject`, `DeleteObject`, IAM inline-policy 변경과 bucket-policy 변경이 모두 거부됐다.
- restore reader는 같은 object의 `GetObject`만 성공하고 `PutObject`와 `DeleteObject`가 거부됐다.
- enabled lifecycle rule을 다시 읽어 `Filter.Prefix=backups/`, `Expiration.Days=30`인 rule 하나를 확인했다. 다른 prefix를 포함하는 rule은 만들지 않았다.
- 각 실행은 `cleanup_complete`로 끝났다. S3 console의 전체 general-purpose bucket 목록은 `0`개/“버킷이 없습니다”로 확인했고, cleanup 뒤 matching disposable IAM user count도 CloudShell에서 `0`으로 다시 확인했다. 업로드한 runner를 CloudShell home에서 제거하고 bootstrap inline policy와 이전 `AmazonS3FullAccess` attachment도 operator에서 제거한 뒤 각각 matching count `0`을 확인했다. credential/private identity/local ciphertext artifact는 저장하거나 Git에 추가하지 않았다.

이 transport run은 S3/IAM 경계만 격리하기 위해 ephemeral OpenSSL identity를 썼다. archive recovery semantics는 아래의 별도 `age` new-host run과 연결한다. 즉, transport run이 encrypted bytes의 S3 연속성과 최소 권한을 증명하고, new-host run이 wrong `age` identity 실패 및 valid identity의 PostgreSQL 16 empty-target restore를 증명한다. production archive가 이 두 계약을 함께 만족해야 verified로 승격된다는 경계는 유지된다.

## 이전 download-hook 제한

2026-07-21 Orca browser download hook은 선택된 object를 expected local path에 전달하지 못했다. 위 CloudShell transport 보완으로 downloaded-byte checksum, least-privilege IAM과 lifecycle 공백은 닫혔다.

같은 hook 한계는 temporary self-managed access-key CSV download에도 재현됐다. key secret을 local file·log·문서에 저장하지 않았고, access key를 즉시 비활성화·삭제한 뒤 IAM console의 key count `0`을 확인했다. 따라서 S3 CLI byte-checksum verifier는 실행하지 않았다. owner가 temporary self access-key IAM policy attachment를 제거했고, 새 console session에서 `iam:ListAccessKeys`가 다시 denied인 것으로 제거를 확인했다.

## Local restore companion

`run-local-postgres-restore.zsh`는 Docker의 disposable PostgreSQL 16 source/target 두 개와 synthetic fixture만 사용한다. source custom dump를 `age`로 encrypt/decrypt하여 target empty database에 restore하고 row count와 invariant를 확인한다. trap이 containers와 temporary key/archive를 지운다. 실행 전에는 `postgres:16-alpine` image가 필요하며, AWS/Supabase/production credential을 사용하지 않는다.

`run-new-host-postgres-restore.sh`는 같은 경계를 Linux/new-host용 Bash로 고정한다. schema version, row count, foreign-key orphan count와 invariant를 확인하고 wrong identity decrypt가 실패해야만 통과한다. `age`, Docker와 SHA-256 command가 설치된 disposable host에서만 실행하며, source/target containers와 identity/archive temporary files는 exit trap으로 제거한다.

2026-07-21 실행에서 encrypted archive byte round trip, target row count `2`, `restore-check` invariant를 통과했다. Docker container 잔존 여부도 실행 뒤 검사했다. 이는 local container evidence이며 Windows 또는 새 host recovery evidence와 같지 않다.

2026-07-22에는 서울 Lightsail Ubuntu 24.04 disposable new host에서 `run-new-host-postgres-restore.sh`를 실행했다. PostgreSQL 16 source/empty-target, wrong-identity decrypt failure, encrypted archive byte/hash equality, schema version `1`, row count `2`, foreign-key orphan count `0`, `restore-check` invariant가 모두 통과했다. archive는 `4067` bytes였고 SHA-256은 `7ca5585a9670aa6397b81bdecaa61def670bec328519347731a9c19e284e6eef`였다. 실행 뒤 verifier container가 없음을 확인하고 temporary script를 제거했으며, tagged instance `waw-restore-spike-20260722-0909-vm`을 삭제한 뒤 Lightsail instance 목록 `0`을 확인했다. Supabase나 production credential/data에는 접근하지 않았다.

첫 제출들이 read-denied 화면 뒤에서 성공한 사실을 inventory 권한 보완 후 발견해 중복 disposable instance 4대를 즉시 삭제하고 newest 1대만 검증에 사용했다. 이 경험 때문에 console 제출 오류가 보여도 `GetInstances`로 실제 생성 여부를 확인하기 전 재제출하지 않아야 한다.

S3 transport와 new-host recovery의 합성 evidence가 모두 확보되어 PLAN-0002 Task 2를 완료한다. production source/credential을 사용하는 Task 3은 별도 owner approval gate다.

## New-host authorization boundary

`lightsail-restore-spike-policy.json`은 Seoul region에서 `purpose=waw-restore-spike`와 expiry tag를 요청한 disposable instance의 생성·조회·삭제만 허용하는 temporary policy template다. 기존 capacity Spike policy의 `waw-capacity-spike` tag를 restore evidence에 재사용하지 않는다. 이 policy attachment와 host 생성은 owner approval 뒤에만 실행하고, instance 삭제 확인 뒤 attachment를 제거한다.

2026-07-22 console 실행에서 regional inventory/browser SSH read와 global `GetDistributions`·`GetDomains`가 필요함을 확인해 template을 보완했다. restore policy의 변경 권한은 `purpose=waw-restore-spike` instance 생성·삭제로 유지한다. 실제 생성 결과를 확인하지 못한 채 재제출한 탓에 5대가 생성됐으나, 중복 4대와 검증용 1대를 모두 same-run 삭제해 최종 instance 목록 `0`을 확인했다.
