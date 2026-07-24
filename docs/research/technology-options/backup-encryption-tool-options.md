# D-13 backup archive 암호화 도구 조사

- 상태: Research — 기술 선택 아님
- 작성일: 2026-07-21
- 범위: `ADR-0008`의 S3 archive를 runtime에서 암호화하고 offline recovery custody로 복호화하는 도구 선택
- 비범위: key 생성, package 설치, S3 bucket/IAM 생성, production backup·restore

## 제약

- backup job은 write-only S3 credential과 encryption public material만 가져야 한다. private recovery material은 runtime·S3·저장소·로그에 두지 않는다 (`ADR-0008`, `SEC-007`).
- Windows fallback에서도 같은 archive를 decrypt할 수 있어야 하며, dump의 portability를 해치지 않아야 한다 (`DAT-004`, `OPS-006`).
- archive는 confidentiality와 integrity failure를 restore 전에 감지해야 하며, key·passphrase·plain dump는 command argument 또는 log에 남기지 않는다.

## 후보

| 후보 | runtime에 필요한 비밀 | Windows 복구 | 판단 |
|---|---|---|---|
| A. `age` recipient encryption | recipient public key만 필요; identity는 owner offline custody | 공식 Windows package와 prebuilt binary가 있으며 identity file로 decrypt | 권고 |
| B. OpenSSL AES passphrase | encryption/decryption passphrase가 runtime에도 필요 | OpenSSL 호환성은 높지만 passphrase rotation·injection·offline custody 경계가 약해진다 | 탈락 |
| C. S3 SSE-KMS만 사용 | S3 read 권한/KMS decrypt 권한 | AWS account·IAM/KMS에 복구가 종속되고 client-side encrypted archive 조건을 만족하지 않는다 | 탈락 |

## 확인된 사실

- age는 explicit small key와 Unix-style composition을 목표로 하는 file encryption tool이며, recipient public key로 encrypt하고 identity file로 decrypt한다. 공식 README는 `age-keygen`, `-r`, `-d -i` 흐름과 macOS/Linux/Windows 설치 경로를 제공한다. [age official repository](https://github.com/FiloSottile/age)
- age recipient key는 public이고 identity file은 secret이다. 여러 recipient를 지원하지만 첫 MVP는 owner recovery identity 하나로 시작해 key custody를 단순화한다. [age usage](https://github.com/FiloSottile/age)
- S3 object read/write는 IAM identity policy와 bucket policy로 나뉜다. `PutObject`, `GetObject`, `DeleteObject`은 object ARN 권한을 요구하므로 backup writer와 recovery reader를 분리할 수 있다. [Amazon S3 IAM](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html)

## 잠정 권고 — 선택 아님

`age` recipient encryption을 사용한다. backup runtime에는 공개 recipient만 두고, owner가 passphrase-protected identity file을 offline custody로 보관한다. S3의 default encryption은 별도 저장소 보호 계층으로 유지할 수 있지만 archive confidentiality의 근거로 사용하지 않는다.

## owner approval이 필요한 결정

`ADR-0009` Proposed의 `age` public-recipient encryption과 offline owner-held private identity 방식을 승인한 뒤에만, disposable synthetic archive로 encrypt/decrypt/restore를 실행한다.
