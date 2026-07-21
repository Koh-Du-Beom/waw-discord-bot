# D-05 영구 저장소 후보 조사

- 조사일: 2026-07-21
- 상태: Research — 저장소 제품 또는 데이터 모델 결정 아님
- 결정 질문: 단일 guild의 설정·감사·명령·계정 연결·몰랭 이력을 어떤 관계형 저장소 경계에 보관해야 원자성, 참조 무결성, 멱등성, 1년 보존, RPO 24시간, RTO 8시간, 이식성과 월 30,000원 상한을 현실적으로 검증할 수 있는가?
- 범위 밖: 저장소 선택·스키마 설계, 백업 제품 선택(D-12), 내부 통신 선택(D-08), 인증 기술 선택(D-07), ADR, Spike, 구현 계획과 제품 코드

## 1. 연결된 요구사항과 결정

| 입력 | D-05에서 사용하는 의미 |
|---|---|
| `DAT-001`~`DAT-005` | 원자성·일관성·참조 무결성, 버전형 마이그레이션, 멱등성, 내보내기·가져오기와 UTC 저장을 지원해야 한다. |
| `PRI-001`~`PRI-003` | 원문 메시지와 비밀정보는 저장하지 않고, 최소 개인정보의 보존·삭제·익명화를 시행해야 한다. |
| `FUN-001`, `FUN-002`, `FUN-013`, `FUN-015` | 모든 명령 시도와 변경 결과를 감사하고 중복 사건·정정·취소를 원자적으로 처리해야 한다. |
| `OPS-004`~`OPS-008` | 플랫폼 기본 로그만 믿지 않고, 독립·암호화 백업과 실제 복구, 마이그레이션 전 백업과 롤백을 검증해야 한다. |
| `INT-001`~`INT-003` | 공유 저장소가 통신 경계가 될 경우 workload별 권한, timeout, 재시도, 안전한 실패와 최소 공개 면적이 필요하다. |
| `OWN-004` | 운영 로그는 30일, 감사·설정 변경·몰랭 이력은 1년 보존한다. |
| `OWN-016`~`OWN-018`, `OWN-034` | 외부 임대 서버와 OS 비종속 자가 단일 서버를 구분하며 현재 Windows 노트북을 대체 host 후보로 보유한다. 첫 MVP의 web·bot은 같은 지속 server 경계에 둔다. |
| `OWN-019` | 허용된 영구 데이터 전체의 RPO는 24시간이며, 봇·웹·데이터 무결성 검증까지 8시간 안에 완료해야 한다. |
| `OWN-020`, `OWN-021` | 일반 변경은 5분 안에 적용하고 10분 뒤 만료한다. 결과·dedupe 기록은 1년 보존하며 live control 없이 canonical 설정과 heartbeat를 사용한다. |
| `OWN-022`~`OWN-025` | 자가 host 장애 중 설정·감사 조회 중단을 허용하고, 월 명령 10,000회로 크기를 검증한다. PITR은 필수가 아니며 조건부로 관리형 DB 무료 tier를 허용한다. |

D-03의 데이터 경계를 유지한다. 저장 가능한 것은 최소 식별자, 설정과 version, 감사 attempt/outcome, 운영 상태, 계정 연결과 사건 이력이다. Discord 원문, AI 중간물, OAuth code, token, cookie, API key와 session identifier는 저장 후보의 기능과 무관하게 영구 저장하지 않는다.

## 2. 평가 기준

1. 명령 감사와 설정 변경을 함께 보존하고 실패 시 전체 rollback할 수 있는가.
2. primary/unique/foreign key와 조건부 전이로 중복 사건과 `operation_id` 재시도를 막을 수 있는가.
3. 웹과 봇이 분리될 때 파일 공유나 과도한 DB 권한 없이 접근할 수 있는가.
4. 운영·미리보기와 web·bot·backup 주체의 credential과 권한을 분리할 수 있는가.
5. 30일·1년 보존, 즉시 감지 제외, 30일 유예 뒤 삭제·익명화를 원자적으로 시행할 수 있는가.
6. 외부 암호화 backup을 24시간 안에 만들고 빈 대체 host에서 8시간 안에 복구·무결성 검증할 수 있는가.
7. schema migration, 사전 backup, 이전 version rollback 또는 forward repair를 재현할 수 있는가.
8. 표준 SQL dump나 안정된 export로 다른 환경에 이동할 수 있는가.
9. host, GPT, domain과 backup 비용을 합쳐 월 30,000원 상한을 지킬 수 있는가.
10. 소규모 단일 guild에 필요한 운영량보다 많은 구성요소를 만들지 않는가.

## 3. 현실적인 후보

### 3.1 자가 호스트 SQLite

SQLite는 application process가 단일 database file을 직접 여는 embedded 관계형 저장소다. 별도 DB server, network listener와 DB service credential이 없어 현재 자가 단일 host에서 가장 작은 운영 단위를 만든다.

확인된 사실:

- SQLite는 serializable ACID transaction을 제공하고 crash·전원 손실 중에도 transaction의 전부 또는 전무를 보장한다고 설명한다. 다만 동시에 쓸 수 있는 transaction은 database file당 하나다. [SQLite transactional](https://www.sqlite.org/transactional.html), [transactions](https://www.sqlite.org/lang_transaction.html)
- foreign key 기능은 지원하지만 기본값이 비활성이므로 각 connection에서 명시적으로 활성화해야 한다. [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html)
- 공식 지침은 device-local, 낮은 write concurrency에 SQLite를 권하고, 여러 computer가 network를 통해 같은 file을 직접 여는 방식은 filesystem locking 문제 때문에 피하라고 한다. [Appropriate Uses for SQLite](https://www.sqlite.org/whentouse.html)
- Online Backup API와 `VACUUM INTO`는 실행 중인 database의 일관된 snapshot을 만들 수 있다. 원격 위치 전송, 암호화, 보존과 복구 시험은 별도 운영 책임이다. [SQLite Backup API](https://www.sqlite.org/backup.html)

추론:

- 현재 규모에서는 단일 writer 제한이 곧바로 탈락 사유는 아니다. 하지만 web과 bot이 각자 file을 직접 열 수 없으므로 Vercel web은 별도 API나 동기화 경계 없이는 canonical 설정·감사 데이터를 읽거나 쓸 수 없다.
- OS 교체는 database file과 migration artifact를 옮기는 방식으로 단순할 수 있지만, backup snapshot 생성 뒤 외부 암호화 저장과 restore 검증을 직접 자동화해야 한다.
- foreign key 활성화 누락이 connection마다 발생할 수 있으므로 후보 검증에서는 연결 직후 설정과 위반 test가 필수다.

### 3.2 자가 호스트 PostgreSQL

PostgreSQL server를 봇과 같은 자가 host 또는 외부 임대 단일 서버에서 운영하는 후보다. SQLite보다 process와 운영 책임은 늘지만 여러 client, 세분화된 role과 높은 write concurrency를 기본 경계로 제공한다.

확인된 사실:

- PostgreSQL은 primary, unique, check와 foreign key constraint로 참조 무결성을 강제한다. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- 권한과 row security를 제공하므로 web·bot·migration·backup role을 나눌 수 있다. 실제 최소 권한 schema는 D-07과 후속 설계가 필요하다. [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html), [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- 공식 backup 범주는 SQL dump, filesystem backup과 continuous WAL archiving/PITR이다. `pg_dump`는 다른 machine·새 PostgreSQL version으로 옮길 수 있는 일관된 export를 만들지만 cluster 전체 복구와 사용자·role 보존 범위는 별도로 설계해야 한다. [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html), [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
- WAL archive와 base backup을 결합하면 특정 시점 복구가 가능하지만 dump보다 운영 절차가 복잡하며 필요한 WAL 보존과 복구 시간을 관리해야 한다. [PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)

추론:

- 같은 host의 PostgreSQL은 봇 local access에는 적합하지만 Mac/Windows host·disk 장애가 data와 bot을 함께 멈춘다. 외부 backup과 대체 Windows host 복원 절차 없이는 `OWN-019`를 충족하지 않는다.
- Vercel이 직접 접속하면 자가 network에 DB port 또는 tunnel/proxy 경계를 추가해야 한다. 이것은 `INT-003`과 D-07을 선행하지 않고 안전하다고 판단할 수 없다.
- 소규모 단일 guild에는 patching, service supervision, TLS, role, vacuum, backup/WAL과 restore 운영이 SQLite보다 크다. web·bot의 다중 client 접근이나 DB 수준 권한 분리가 실제로 필요할 때만 그 비용이 정당화된다.

### 3.3 관리형 PostgreSQL

표준 PostgreSQL protocol을 제공하는 관리형 서비스를 쓰는 범주다. 현재 비용과 Vercel 연결 가능성을 확인하기 위한 대표 사례로 Neon을 사용하며, Neon을 선택안으로 확정하지 않는다.

확인된 사실:

- Neon은 Vercel application이 TLS가 요구되는 PostgreSQL connection string으로 접속하는 공식 절차를 제공한다. production·preview environment variable 분리는 사용자가 정확히 구성해야 한다. [Neon–Vercel 연결](https://neon.com/docs/guides/vercel-manual)
- serverless client가 많은 경우 PgBouncer transaction pooling을 제공한다. pooled connection에서는 session-level advisory lock, `LISTEN`, 일부 session state가 지원되지 않고 migration과 `pg_dump`에는 direct connection을 권한다. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- 2026-07-20 공개 가격에서 Free는 $0, project당 storage 0.5GB와 6시간 restore history를 제공한다. Launch는 사용량 기반이며 간헐 부하 1GB 예시가 약 $15/월, restore window는 최대 7일이다. private network와 IP allow rule은 Scale 기능으로 표시되어 있다. [Neon pricing](https://neon.com/pricing)
- Neon도 표준 `pg_dump`/`pg_restore` migration을 문서화한다. provider 내부 restore나 snapshot은 운영 data와 분리된 외부 backup이라는 프로젝트 요구를 단독으로 증명하지 않으므로 외부 copy는 별도로 필요하다. [Neon migration](https://neon.com/docs/import/migrate-from-neon), [network transfer and external copy](https://neon.com/docs/introduction/network-transfer)

추론:

- web과 bot이 별도 role로 같은 canonical store에 접근하면 별도 public bot API를 제거할 여지가 있고, 자가 host 장애 중에도 data가 남는다. 반면 database endpoint와 provider control plane이 새 trust·장애 경계가 된다.
- Free의 6시간 restore history는 24시간 RPO보다 촘촘하지만 독립 backup, 1년 보존, 복구 가능성과 SLA를 뜻하지 않는다. 0.5GB가 월 명령 10,000회의 1년 감사 기록에 충분한지는 record·index 크기 측정이 필요하다.
- IP allow/private network가 고가 plan에 묶여 있어 Free/Launch에서는 TLS, 강한 password, workload별 최소 role과 credential rotation이 특히 중요하다. 구체 인증 방식은 D-07 범위다.
- 표준 PostgreSQL dump는 공급자 이탈 경로를 제공하지만 branch, instant restore, autoscaling과 pooling 동작에 의존하면 migration 비용이 커질 수 있다.

### 3.4 Supabase Free 관리형 PostgreSQL 후보

Supabase Free는 관리형 PostgreSQL을 제공하는 별도 후보다. 이번 단계에서는 계정·project·credential을 만들지 않고 공식 요금과 제한만 조사한다.

확인된 사실(2026-07-21 공식 요금표):

- 월 비용은 `$0`이며 project당 database size 500MB, egress 5GB, file storage 1GB, peak connection 200개가 포함된다.
- Free project는 1주일 비활성 뒤 pause될 수 있다. automatic backup과 PITR은 Free에 포함되지 않는다.
- PostgreSQL, SQL editor, database role·RLS와 Realtime 같은 기능은 제공되지만, public endpoint 접근 credential과 provider network 경계를 새로 운영해야 한다.
- 공식 요금표는 quota·pause·backup 제한을 명시하므로 Free를 production SLA나 독립 backup으로 해석할 수 없다. [Supabase pricing](https://supabase.com/pricing)

추론:

- 1년 합성 감사·dedupe 데이터가 500MB 아래이고 주기적 activity가 pause를 막는다면 비용 없는 managed PostgreSQL 후보가 될 수 있다.
- SQLite보다 DB role·동시성·host disk 장애 분리가 유리하지만, Lightsail web/bot에서 외부 TLS endpoint로 접근하는 workload credential·egress·provider outage 경계가 추가된다.
- Free automatic backup 부재 때문에 별도 encrypted export와 빈 Windows restore 시험이 필수다. Supabase Auth/Storage를 함께 사용하지 않고 database만 사용할지 또한 별도 scope로 제한해야 한다.

현재 판단: Supabase Free는 관리형 PostgreSQL의 **검증 후보**로 추가했지만 저장소 선택은 하지 않는다. 실제 project 생성·credential 입력은 owner가 비용·외부 account 사용을 별도로 승인한 뒤에만 수행한다.

## 4. 비교

| 기준 | 자가 SQLite | 자가 PostgreSQL | 관리형 PostgreSQL |
|---|---|---|---|
| 원자성·참조 무결성 | 충족 가능; FK connection 설정 필수 | 강함 | PostgreSQL과 동일 |
| 멱등·조건부 전이 | unique key와 transaction으로 가능; 단일 writer | unique key, lock, transaction으로 강함 | 강함; pooled session 기능 제한 확인 필요 |
| Vercel·bot 공유 | file 직접 공유 불가; 별도 경계 필요 | network 경계 직접 운영 | 양쪽 직접 연결 가능 |
| 권한 분리 | file/OS와 application 계층 중심 | role·schema·table 권한 가능 | role 권한 가능; provider plan 경계 추가 |
| 자가 host 장애 격리 | data도 함께 중단 | 같은 host면 함께 중단 | data는 분리되나 provider 장애가 추가됨 |
| backup·RPO/RTO | snapshot·외부 전송·암호화 직접 운영 | dump 또는 WAL·외부 보관 직접 운영 | provider restore + 독립 export를 별도 운영 |
| 이식성 | 단일 file·SQL export; SQLite SQL 차이 | `pg_dump`/`pg_restore` | 같은 PostgreSQL 도구; provider 기능은 별도 |
| 운영 부담 | 가장 작음 | 가장 큼 | DB 운영은 작지만 계정·비용·provider 관리 필요 |
| 직접 비용 | 기존 장비 안에서는 $0 가능 | 기존 장비 안에서는 $0 가능 | Free 가능성; paid 예시 약 $15/월 |
| 현재 가장 큰 미확인 | web 경계와 복원 자동화 | 운영 복잡성과 안전한 ingress | 0.5GB·무료 plan 지속성·독립 backup 비용 |

### 제외한 후보

- 문서형·key-value NoSQL: 현재 데이터는 설정 version, 감사 관계, 계정 연결, 사건·정정과 dedupe처럼 관계 무결성과 다중 record 원자성이 핵심이다. 이를 application에서 다시 구현할 이유가 없다.
- SQLite 호환 분산 서비스와 proprietary data API: 관리형 PostgreSQL보다 이식성·transaction 의미를 추가 검증해야 하지만 현재 요구를 더 단순하게 충족한다는 증거가 없다.
- 별도 감사·시계열 저장소: 현재 부하가 없고 30일/1년 보존은 하나의 관계형 저장소에서 분리 table·partition 또는 삭제 작업으로 먼저 검증할 수 있다.

## 5. 마이그레이션, rollback과 운영 영향

- 모든 후보에서 schema version table과 순서가 고정된 migration artifact가 필요하다. framework나 ORM은 D-05에서 고르지 않는다.
- destructive migration 전에는 독립 backup을 만들고 빈 database에 복원한 뒤 schema version, foreign key, row count와 핵심 invariant를 검사해야 한다.
- application rollback은 database restore와 다르다. 최소 한 version 동안 backward-compatible schema를 유지할지, 실패 시 forward repair할지는 ADR·구현 계획에서 정한다.
- SQLite→PostgreSQL 이동은 type, timestamp, boolean, auto-generated key와 transaction 차이를 변환해야 한다. PostgreSQL self-hosted↔managed 이동은 표준 dump 경로가 더 직접적이지만 extension과 provider role은 제외·재구성해야 한다.
- backup credential은 application write credential과 분리하고, backup에는 원문 메시지·비밀정보가 애초에 들어가지 않았음을 검사해야 한다.

## 6. 가정, 미확인 사항과 사용자 결정 질문

### 가정

- 첫 MVP는 단일 guild, 단일 active bot과 소수 운영자이며 write concurrency는 낮다.
- 원문 메시지와 AI 중간물은 저장하지 않아 database 증가량의 대부분은 감사·운영 event다.
- web과 bot은 같은 지속 server 경계에서 정상 운영 중 설정과 감사를 조회한다. host 장애 중에는 해당 조회와 변경을 중단하고 `unavailable`로 표시할 수 있다.
- 관리형 PostgreSQL 후보는 표준 PostgreSQL 기능을 기준으로 비교하며 Neon 고유 기능을 필수 요구로 삼지 않는다.

### 미확인 사항

1. 월 명령 10,000회에서 평균 record·index 크기와 1년 뒤 database/export 크기.
2. 외부 backup 위치·가격·암호화·보존은 D-12에서 정해야 한다.
3. SQLite의 동시 write, PostgreSQL의 조건부 전이와 각 후보의 빈 Windows host 복원 시간은 측정하지 않았다.
4. 단일 host 안의 web·bot process와 저장소 권한을 얼마나 분리할지는 runtime·저장소 결정 전까지 미확정이다.

### 확정된 사용자 결정

| ID | 결정 | 연결된 소유자 결정 |
|---|---|---|
| `D05-Q01` | 자가 host 장애 중 설정·감사 조회와 변경 중단을 허용하고 마지막 heartbeat·관측 시각 또는 `unavailable`만 표시한다. | `OWN-022` |
| `D05-Q02` | 첫해 월 명령 10,000회를 상한 시나리오로 사용한다. | `OWN-023` |
| `D05-Q03` | PITR은 필수가 아니며 24시간 외부 backup과 설정 변경 이력으로 복구한다. | `OWN-024` |
| `D05-Q04` | 요구를 충족하는 동안 관리형 DB 무료 tier를 허용하고 표준 export 이탈 경로를 요구한다. | `OWN-025` |

## 7. 필요한 검증 — 이번 작업에서는 실행·작성하지 않음

- 예상 1년 event를 넣어 SQLite file과 PostgreSQL dump 크기, 보존 삭제 시간과 index 크기를 측정한다.
- 같은 `operation_id`를 동시 제출하고 consumer를 transaction 중단해 unique/conditional transition과 재시도 결과를 비교한다.
- SQLite Online Backup 또는 PostgreSQL dump로 만든 암호화 외부 copy를 빈 Windows 노트북에 복원하고 8시간 RTO와 무결성 검사를 측정한다.
- Vercel preview·production과 bot에 서로 다른 최소 권한 role을 주고 교차 접근이 거부되는지 검증한다.
- 관리형 후보의 scale-to-zero 뒤 첫 query, connection pooling, outage와 0.5GB 초과 시 동작을 실제 예상량으로 측정한다.
- Supabase Free 후보는 별도 owner 승인 뒤에만 disposable project로 생성해 500MB quota·pause·TLS connection·최소 role·export/restore를 검증한다. project 생성 전에는 공식 문서와 합성 local dataset만 사용한다.

## 8. 잠정 권고와 가장 강한 대안

### 잠정 권고 — 선택 아님

**자가 host SQLite를 첫 검증 후보**로 둔다. 단일 guild·낮은 concurrency와 web·bot 단일 server 경계에서는 별도 DB server·network credential 없이 가장 작은 운영 단위를 만들며 저장량·동시 전이 Spike도 통과했다. 외부 snapshot, 빈 Windows 복구와 8시간 RTO를 검증하지 못하면 채택할 수 없다.

### 가장 강한 대안

**관리형 PostgreSQL**이 가장 강한 대안이다. host·disk 장애에서 canonical data를 분리하고 DB role로 process 권한을 나눌 수 있다. 대신 public provider credential, 독립 backup, 무료 tier 조건과 비용 경계가 추가되므로 D-09·D-12에서 그 격리 이점이 운영 복잡성보다 큰지 검증해야 한다.

자가 PostgreSQL은 두 후보의 장점을 자동으로 합치지 않는다. 관리형 비용은 피하지만 SQLite보다 운영할 것이 많고 자가 host 장애도 분리하지 못하므로, DB client 동시성이나 세분화된 DB role이 SQLite로 충족되지 않을 때의 후보다.

### 주요 위험

- 관리형 Free tier의 restore history를 독립 backup·SLA·RTO 보장으로 오해할 위험
- SQLite file을 network filesystem에서 공유하거나 backup 중 단순 복사해 corruption을 만드는 위험
- web과 bot에 같은 owner credential을 주어 최소 권한과 환경 분리를 무력화할 위험
- 1년 감사·dedupe 보존량을 측정하지 않고 0.5GB 또는 단일 disk가 충분하다고 가정할 위험
- migration 실패와 관리자 오작동을 application rollback만으로 복구할 수 있다고 오해할 위험
- 삭제·익명화 전 backup이 복구 후 개인정보를 되살리는 위험

### 권고를 뒤집는 조건

- 자가 host 장애 중 dashboard data 조회가 필요 없고 SQLite backup·Windows 복원이 RPO/RTO를 반복 달성함
- 1년 data가 Free 한도를 넘거나 필요한 network restriction·복구 기능이 월 예산을 침해함
- D-07에서 public managed database endpoint의 credential·권한 위험을 허용 범위로 줄일 수 없음
- 실제 동시성 시험에서 SQLite write serialization이 5분 적용 목표나 감사 선행 기록을 방해함
- 관리형 공급자 장애·종속보다 자가 PostgreSQL 운영과 외부 backup이 더 낮은 총비용으로 입증됨

## 9. 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고 docs/prompts/research.md 절차에 따라
D-09 단일 지속 server 호스팅 후보를 조사해.
OWN-005, OWN-016~OWN-021, OWN-034와 D-08의 단일 server 경계를 입력으로 사용하고
외부 임대 server와 소유 Mac·대체 Windows를 비용·상시성·보안·복구로 비교해.
아직 host·runtime·저장소·인증 기술을 선택하거나 ADR, Spike,
구현 계획 또는 제품 코드를 작성하지 마. KBO는 연기 상태로 유지해.
```
