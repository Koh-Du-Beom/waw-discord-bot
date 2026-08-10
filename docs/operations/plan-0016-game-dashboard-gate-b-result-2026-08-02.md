# PLAN-0016 검거 대시보드 Gate B 결과 — 2026-08-02

- 상태: **INCOMPLETE — fresh backup published, restore identity/tool boundary에서 중단**
- Owner 승인: fresh encrypted backup, empty-target restore verification, migration 0012
- Rollback owner: Koh-Du-Beom
- Maintenance window: 승인 시점부터 Gate B 완료 시점까지
- Gate C deploy 및 Gate D IPC activation: 승인되지 않음

## 실행 결과

Gate A 핵심 중단 조건을 mutation 직전에 다시 확인했다.

- Production schema version `11`, migration 0012 applied count `0`
- web, bot, Caddy, journald, backup timer와 monitor timer `active`
- backup/monitor timer `enabled`
- canonical health `healthy`

승인된 첫 mutation으로 `waw-backup.service` one-shot을 한 번 실행했다. Publication은
다음 비민감 metadata로 성공했다.

| 항목 | 결과 |
| --- | --- |
| Service result/status | `success` / `0` |
| Created | `2026-08-01T15:11:17Z` |
| Completed | `2026-08-01T15:11:29Z` |
| Schema version | `11` |
| Encrypted bytes | `101036` |
| Archive SHA-256 | `9f66ba4551a73c036047884cf5fb6bade48851116a18af92352787a22fc22097` |
| Expected row count | `300` |
| Expected invariant | `constraints_valid` |
| Publication status | `published` |

Object key와 archive ID는 운영 증거에 복사하지 않았다. Credential, connection string,
offline identity, passphrase와 AWS session 값도 출력하거나 기록하지 않았다.

## 중단 경계

Publication은 restore verification이 아니다. 승인된 절차는 offline age identity로
wrong-identity rejection을 증명한 뒤 exact encrypted object를 disposable empty
PostgreSQL 17에 `pg_restore --exit-on-error` 해야 한다.

현재 Windows 환경에서는 다음 필수 입력/도구가 준비되지 않았다.

- owner가 보관하는 offline age identity와 그 passphrase 입력 경계
- `age` / `age-keygen`
- 실행 중인 Docker Desktop PostgreSQL 17 target

일반 사용자 폴더에서 identity 후보의 존재 여부만 파일명 기준으로 확인했으며 적합한
파일을 찾지 못했다. Docker CLI는 설치돼 있지만 engine은 실행 중이 아니었다. Identity를
production host, GitHub secret, chat, shell argument 또는 저장소로 복사해 우회하지 않았다.

따라서 migration 0012는 실행하지 않았다. Production mutation은 새 encrypted backup
publication 한 건뿐이며 service restart, release 변경, IPC flag 변경과 사건 mutation은
`0`이다.

## 재개 조건

Owner가 offline identity가 있는 승인된 컴퓨터/경로를 직접 선택하고 passphrase를 직접
입력할 수 있어야 한다. 해당 환경에 `age`, PostgreSQL 17 disposable target과 Docker가
준비되면 exact-object temporary reader, byte/hash 검증, wrong-identity rejection,
empty-target restore, schema/row/constraint 검증과 cleanup을 수행한다. 모두 PASS한 뒤에만
migration 0012를 한 번 실행한다.
