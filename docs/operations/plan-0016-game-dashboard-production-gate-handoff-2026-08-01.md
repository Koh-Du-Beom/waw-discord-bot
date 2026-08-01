# PLAN-0016 검거 대시보드 production gate handoff — 2026-08-01

- Status: Prepared, not approved
- Production changes in this task: None
- Canonical origin: `https://waw.dubeom.com`
- Accepted decision: ADR-0030
- Local plan: PLAN-0016 Tasks 1–7 complete

이 문서는 production 실행 명령이 아니라 owner decision record의 입력이다.
`4297c816334a6642456b14ca619c5d9fa95adb88`와 working tree는 handoff 작성 당시
dirty in-progress context이므로 release candidate가 아니다. Clean reviewed commit, source archive
SHA-256, maintenance window와 rollback owner가 채워지기 전에는 어떤 gate도 실행할
수 없다.

## 로컬 exact release candidate

- Candidate commit: `f469c19029d139267fced0ffcb289aabe20132fc`
- Release ID: `f469c19029d1`
- Source archive SHA-256: `e0ea44670f933bc62d90170e4e86587c29019a61fdc5ef8d9163f30572cdebfb`
- `package-lock.json` SHA-256:
  `466d9e633206ac07c6ed216bde1a481a27a95c6d7bc8d56e994a973835408803`
- Migration 0012 archive SHA-256:
  `188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c`
- Exact archive Linux fixtures: application assets PASS, release rollback PASS

이 candidate는 로컬에서 고정됐지만 Gate A 승인은 아니다. Maintenance window,
executor, observer와 rollback owner가 지정되고 별도 owner decision이 기록되기 전에는
production에 접속하지 않는다. 이후 문서-only commit은 이 application candidate의
bytes를 바꾸지 않는다.

## 완료된 비-production 증거

| 경계 | 결과 |
| --- | --- |
| Local unit/HTTP/UI | 311 pass, 8 host-tool skips, 0 fail |
| PostgreSQL 17 disposable 전체 | 325 pass, 7 unrelated external-fixture skips, 0 fail |
| 실제 PostgreSQL integration file | 16/16 |
| Chromium keyboard·axe | 2/2 |
| Typecheck/build/diff | PASS; migration assets 12개 |
| Git-index Linux asset/rollback fixture | PASS; systemd/Caddy LF-normalized archive |
| Migration 0012 exact/LF SHA-256 | `188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c` |

Disposable evidence는 production schema, backup, release와 runtime health를 증명하지
않는다.

## 필수 승인 메타데이터

다음 값은 비밀 없이 owner가 exact 값으로 승인해야 한다.

- clean release commit과 12자리 release ID;
- source archive SHA-256와 `package-lock.json` SHA-256;
- migration 0012 archive byte SHA-256와 reviewed diff;
- target project/host의 비밀이 아닌 식별, Seoul region과 canonical domain;
- maintenance window 시작·종료, executor, observer와 rollback owner;
- current/previous release ID, 현재 schema version과 migration checksum 상태;
- fresh encrypted backup publication과 empty-target restore evidence ID;
- web/bot workload role과 table grant diff의 expected 값;
- admin IPC enable 여부와 첫 실제 mutation을 제외한 smoke 범위.

Credential 값, connection string, OAuth code/token, cookie/session, Discord/Riot ID,
사건 ID와 정정 사유는 record에 넣지 않는다.

## Gate A — read-only preflight

Owner가 Gate A만 별도로 승인한 뒤 metadata-only로 확인한다.

1. Exact production release, schema ledger/checksum, PostgreSQL 17 version, DB size,
   connections와 capacity를 읽는다.
2. Latest backup이 24시간 이내 published이고 backup/monitor timer, journald, Caddy,
   web/bot과 Lightsail alarm이 healthy인지 확인한다.
3. Migration 0012가 unapplied인지 이미 exact checksum으로 applied인지 확인한다.
4. `waw_web`은 game tables select만, `waw_bot`은 필요한 mutation만 가지며 PUBLIC과
   web의 game write가 denied인지 metadata로 확인한다.
5. Admin IPC flag, group, directory/socket와 unit asset의 현재 상태를 확인하되
   생성·수정·restart하지 않는다.
6. Clean archive를 isolated stage에서 install/typecheck/build하고 source/dist migration
   bytes, asset tests와 rollback fixture를 확인한다.

Backup stale, schema/hash drift, unexpected grant, unhealthy service/alarm, insufficient
capacity, dirty commit 또는 archive mismatch가 하나라도 있으면 중단한다. Gate A는
backup 생성, migration, deploy, flag 변경이나 restart를 승인하지 않는다.

## Gate B — fresh backup과 migration 0012

Gate A PASS 증거와 별도 owner 승인 뒤에만 실행한다.

1. 새 encrypted logical backup을 publish하고 manifest byte/hash를 확인한다.
2. Exact archive를 empty PostgreSQL 17 target에 restore해 schema version, constraints와
   핵심 row counts를 검증한다.
3. Root-owned one-shot migration credential로 exact release의 migration runner를 한 번만
   실행한다. Connection string을 argument, environment, output 또는 journal에 남기지 않는다.
4. Version 12/checksum, `admin_command_result` command/reason constraints, RLS와 grant
   diff를 read back한다.
5. Web role의 game update/revision insert deny와 bot capability의 expected grants를
   확인하고 one-shot credential을 제거한다.

Migration 0012는 constraint allowlist 확장이고 data rewrite/index를 만들지 않는다.
실패 시 down SQL이나 original project restore를 실행하지 않는다. 상태를 보존하고
corrective-forward 또는 별도 restore decision을 요청한다. Gate B는 release deploy나
IPC activation을 승인하지 않는다.

## Gate C — immutable release, IPC OFF

Gate B PASS와 별도 owner 승인 뒤 exact archive만 배포한다.

1. 기존 production deployment runbook으로 stage하고 source/dist migration 일치를
   다시 확인한다.
2. Unit의 `WAW_ADMIN_COMMAND_IPC_ENABLED=0` 기본값을 유지한 채 release를 activate한다.
3. Web/bot을 bounded restart하고 loopback `/health`, canonical HTTPS, Gateway/storage,
   backup/monitor와 wrong-host denial을 확인한다.
4. Operator와 administrator의 몰랭 read, 100건 이하 page, unknown/stale 표시와
   identifier-free URL을 확인한다.
5. 정정·취소는 unavailable이어야 하며 web에 game write 권한이 없음을 재확인한다.

실패 시 이전 release와 unit을 복원한다. Migration 0012와 사건 데이터는 보존한다.
Gate C는 IPC flag 활성화를 승인하지 않는다.

## Gate D — admin IPC activation

Gate C 안정화 증거와 별도 owner 승인 뒤에만 진행한다.

1. `waw-admin-command` group membership, directory `0750`, socket `0660`, bot owner와
   web supplementary access를 확인한다. Web에 bot token/DB credential을 주지 않는다.
2. Reviewed root-owned drop-in에서 web과 bot의 effective admin IPC flag만 `1`로 만들고
   bot을 먼저, web을 다음에 restart한다.
3. Socket ownership, bounded connection diagnostics, canonical health와 journal의
   identifier/reason/credential canary 부재를 확인한다.
4. Operator에게 mutation control이 없고 administrator에게만 표시되는지 확인한다.
5. CSRF/Origin 오류, stale OAuth와 missing confirmation이 port dispatch 전에 거부되는
   non-mutating check만 수행한다.

Production 실제 사건을 정정·취소하는 smoke는 이 gate에 포함되지 않는다. 첫 실제
mutation은 exact incident/version/action/reason을 owner가 별도 승인해야 한다. Timeout이면
새 operation ID로 재시도하지 않고 terminal reconciliation을 우선한다.

## Rollback decision

- Security/auth/grant drift: 즉시 Gate D를 rollback하고 admin IPC를 양쪽 모두 `0`으로
  만든다. Web write grant를 확대하지 않는다.
- IPC 또는 mutation 장애: read-only release를 유지하거나 이전 release로 rollback한다.
- Read/health 장애: 이전 release와 unit을 복원하고 canonical health를 확인한다.
- Migration 0012: forward-compatible하게 남기고 destructive down SQL을 금지한다.
- Incident/revision/audit/result: 삭제·수정·역변환하지 않는다.

각 rollback 뒤 backup/monitor/journald/alarm, singleton bot, Gateway/storage와 canonical
HTTPS를 재검증한다.

## Owner decision placeholders

- Gate A: PASS on 2026-08-01; evidence in
  `plan-0016-game-dashboard-gate-a-result-2026-08-01.md`
- Gate B: Approved; backup published, restore/migration incomplete — see
  `plan-0016-game-dashboard-gate-b-result-2026-08-02.md`
- Gate C: Not approved
- Gate D: Not approved
- First real incident mutation: Not approved
