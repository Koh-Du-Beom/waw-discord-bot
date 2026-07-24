# 저장량·동시 전이 Spike

- 실행일: 2026-07-20
- 상태: Passed
- 연결 요구사항: `DAT-001`, `DAT-003`, `DAT-004`, `OWN-020`, `OWN-023`, `OWN-025`, `GAP-INT-01`
- 비용 상한: 증분 0원
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

SQLite와 표준 PostgreSQL 중 적어도 하나는 월 명령 10,000회 × 1년의 합성 감사·dedupe·session 데이터를 database와 export 각각 0.5GB 미만으로 보관하면서, 동일 `operation_id`의 동시 요청과 transaction 중단 뒤 재시도에서도 상태를 정확히 한 번만 적용할 수 있다.

## 최소 범위와 합성 데이터

- 명령·감사 120,000건
- dedupe/operation 120,000건
- 활성·만료 session 1,000건
- 동일 `operation_id` 동시 제출 32회
- transaction 중단 뒤 같은 `operation_id` 재시도 1회

record에는 합성 ID, UTC 시각, 명령·결과·reason, duration, service version과 session 만료 시각만 넣는다. 실제 사용자 정보, Discord 원문, token, cookie와 secret은 사용하지 않는다.

SQLite와 임시 로컬 PostgreSQL의 database·export 크기, 동시 전이 결과와 rollback 뒤 재시도 결과만 측정한다. provider, Vercel, network, backup 암호화·복구와 Windows는 범위 밖이다.

## 성공·실패 기준

성공하려면 후보 하나 이상이 다음을 모두 만족해야 한다.

- database와 export가 각각 536,870,912 bytes 미만
- 동시 요청 32회에서 operation과 audit 적용이 각각 정확히 1건
- 중단 transaction의 operation과 audit가 모두 0건
- 재시도 뒤 operation과 audit가 각각 정확히 1건
- foreign key 위반이 0건

두 후보가 모두 하나 이상의 조건을 위반하거나 결과를 측정할 수 없으면 전체 가설을 실패로 판정한다.

## 환경·실행·정리

- macOS의 기존 Node.js, SQLite CLI와 PostgreSQL CLI/server만 사용
- 임시 directory에 SQLite file, PostgreSQL cluster와 export 생성
- PostgreSQL은 local Unix socket과 임시 port만 사용하며 trust 인증은 격리된 임시 cluster에만 적용
- 종료 시 임시 PostgreSQL을 정지하고 directory 전체 삭제

실행 명령:

```text
zsh docs/research/spikes/storage-volume-concurrent-transition/run.zsh
```

## 결과

환경:

- Node.js `v24.18.0`
- SQLite `3.51.0`
- PostgreSQL `17.10`

실행 결과:

```text
{"outcome":"pass","sqlite":{"database_bytes":26169344,"export_bytes":23263911,"race":"1,1","rollback":"0,0","retry":"1,1","foreign_key_violations":0},"postgresql":{"database_bytes":39442099,"export_bytes":14233320,"race":"1,1","rollback":"0,0","retry":"1,1","foreign_key_violations":0}}
```

| 후보 | database | export | 동시 적용 | 중단 뒤 상태 | 재시도 뒤 상태 | FK 위반 |
|---|---:|---:|---|---|---|---:|
| SQLite | 26,169,344 bytes | 23,263,911 bytes | operation 1, audit 1 | operation 0, audit 0 | operation 1, audit 1 | 0 |
| PostgreSQL | 39,442,099 bytes | 14,233,320 bytes | operation 1, audit 1 | operation 0, audit 0 | operation 1, audit 1 | 0 |

두 후보 모두 정의한 크기·원자성 기준을 충족해 가설을 통과했다. 최초 sandbox 실행에서는 PostgreSQL shared-memory 생성이 차단돼 `initdb` 단계에서 종료됐으며 임시 data directory가 제거됐다. 동일한 local-only 명령을 승인된 sandbox 외부 환경에서 다시 실행해 위 결과를 얻었다.

## 정리

- 임시 PostgreSQL server 종료
- SQLite file, PostgreSQL cluster와 두 export를 포함한 임시 directory 삭제
- 외부 서비스, 실제 credential과 사용자 데이터 미사용
- 증분 비용 0원

## 한계와 결정 영향

이 Spike는 최소 관계형 record와 local engine 의미만 비교한다. 실제 schema, 관리형 공급자 한도·cold start·connection pooling, 외부 backup, 복구 시간, workload 권한과 운영 비용을 증명하지 않으며 저장소 기술을 선택하지 않는다.

`GAP-INT-01`의 local 크기·조건부 전이 공백은 축소됐고 SQLite와 PostgreSQL은 모두 후보로 남는다. PostgreSQL 측정값이 0.5GB보다 작다는 사실은 특정 관리형 무료 tier의 실제 청구 저장량, 정책 지속성이나 운영 적합성을 보장하지 않는다. 다음 결정은 저장 engine 성능이 아니라 Vercel·자가 host 사이 경계, 최소 권한과 복구 증거가 가른다.
