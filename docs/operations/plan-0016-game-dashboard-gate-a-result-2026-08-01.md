# PLAN-0016 검거 대시보드 Gate A 결과 — 2026-08-01

- 판정: **PASS — Gate A read-only production preflight 완료**
- 범위: metadata-only/read-only production 접근과 exact candidate 격리 검증
- Candidate: `f469c19029d139267fced0ffcb289aabe20132fc`
- Release ID: `f469c19029d1`
- Production 변경 수: **0**
- Gate B migration/backup, Gate C deploy/restart, Gate D IPC 변경, 실제 사건 mutation: **실행하지 않음**

## 선행 artifact contract 정정

첫 시도에서 owner가 제시한 source archive SHA-256
`466d9e633206ac07c6ed216bde1a481a27a95c6d7bc8d56e994a973835408803`은 실제로
candidate의 `package-lock.json` hash임을 확인해 production 접근 전에 중단했다.
Production runbook의 exact 명령 `git archive --format=tar.gz`을 candidate에 두 번
실행한 결과는 byte-identical했고, source archive SHA-256은
`e0ea44670f933bc62d90170e4e86587c29019a61fdc5ef8d9163f30572cdebfb`였다. Handoff와
`PROJECT_STATUS.md`를 이 값으로 교정한 뒤 owner 지시에 따라 Gate A를 재개했다.

## 고정된 비민감 증거

| 항목 | 판정 | 증거 |
| --- | --- | --- |
| Git/candidate | PASS | 검사 시작 시 tree clean; HEAD `5ead44f017388283266c4d25acb474600b06ad1d`, candidate 이후 변경은 status/handoff 문서뿐이며 application diff 0 |
| Candidate archive | PASS | exact archive SHA-256 `e0ea44670f933bc62d90170e4e86587c29019a61fdc5ef8d9163f30572cdebfb` |
| Lockfile | PASS | SHA-256 `466d9e633206ac07c6ed216bde1a481a27a95c6d7bc8d56e994a973835408803` |
| Migration 0012 | PASS | candidate LF/archive SHA-256 `188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c`; production schema version은 11이므로 미적용 |
| Current/previous release | PASS | current `4f8832124f19`, previous `19ea83925f6b`; candidate release directory 없음 |
| Host capacity | PASS | Ubuntu 24.04, memory 911 MiB 중 380 MiB available, root disk 39,535,100 KiB 중 32,631,936 KiB available |
| PostgreSQL | PASS | version 17.6, DB size 13,020,307 bytes, connections 15/60, schema version 11 |
| Migration ledger | PASS | production versions 1–11의 exact checksum이 repository의 accepted canonical/alternate/historical ledger와 일치; targeted compatibility test 4/4 pass |
| Backup | PASS | verified published marker age 31,489초로 24시간 이내; backup/monitor timer active+enabled, latest service result success/status 0 |
| Services/health | PASS | web, bot, Caddy, journald active; failed unit 0; Lightsail instance running, alarm `OK`; canonical `https://waw.dubeom.com/health`가 `healthy` |
| DB grants | PASS | `waw_web`: 4개 game table SELECT 모두 허용, INSERT/UPDATE/DELETE 모두 거부; `waw_bot`: 필요한 INSERT/UPDATE 허용, DELETE 거부; PUBLIC grant 0 |
| Admin IPC inventory | PASS | web/bot effective flag `1`; group 존재; directory `750,waw-bot,waw-admin-command`; socket `660,waw-bot,waw-admin-command`; effective web/bot unit 및 drop-in 경로 확인 |
| Isolated Linux fixtures | PASS | exact candidate archive에서 production application assets와 release rollback manager fixture PASS |
| 민감정보 canary | PASS | 최근 24시간 web/bot journal의 identifier/reason/credential 패턴 count 0; 이 문서에 credential, connection string, OAuth/session 값 또는 사건 식별자/사유 없음 |

현재 release의 Admin IPC가 이미 `1`인 것은 현 상태 inventory이며 이 Gate에서 변경하지
않았다. Candidate의 production asset fixture는 Gate C 기본값 `0`을 별도로 검증했다.
Ubuntu login banner의 restart-required 표시는 관찰됐지만 이번 범위에서 restart나 package
변경을 하지 않았고, 대상 서비스·timer·alarm·canonical health에는 실패가 없었다.

## 실행한 read-only 명령

로컬에서는 다음을 실행했다.

- `git status`, `git log`, `git rev-parse`, `git show`, candidate..HEAD `git diff`
- `Get-FileHash -Algorithm SHA256`과 `git hash-object`/candidate blob 비교
- `git archive --format=tar.gz --output=<temporary> <candidate>` 두 번과 SHA-256 비교
- exact archive를 격리된 WSL `/tmp`에 풀어 `deploy/test-production-application-assets.sh`
  및 `deploy/test-production-release-manager.sh`
- `npx.cmd tsx --test src/persistence/migration-checksum.test.ts` (`4 pass / 0 fail`)
- `git diff --check`

AWS/production에서는 값이 아닌 metadata와 집계값만 읽었다.

- Lightsail instance state, AZ, bundle RAM/disk와 alarm state 조회
- canonical HTTPS health GET
- `readlink`, `test -e`, `free -m`, `df -P`
- `systemctl is-active/is-enabled/show`, unit/drop-in path 조회, `stat`으로 IPC mode/owner/group 조회
- backup published marker epoch와 현재 epoch의 차이 계산
- 승인된 DB credential file을 subshell에서 export하고 secret/AWS 변수를 출력 없이 제거한 뒤
  `psql -XAt`로 server version, DB size, connection/max, schema version, ledger checksum과
  `has_table_privilege`/grant count만 조회
- `journalctl --since '-24h'` 결과를 민감 패턴 count로만 집계

인증 과정에서 owner가 Termius SSH와 `sudo` 인증을 직접 완료했다. 비밀번호, key,
connection string 또는 session 값은 캡처하거나 문서화하지 않았다. 중간에 잘못 구성된
read-only DB query와 붙여넣기 시도가 오류로 끝났지만 DB/host 상태를 변경하지 않았다.

## PASS/FAIL/미확인

- PASS: 요청된 Gate A 항목 1–10 전체
- FAIL: 없음
- 미확인: 없음
- Production 변경: **0**

Gate A PASS는 Gate B 이후의 승인이 아니다. Backup 생성, migration 0012, release stage/
activate, service reload/restart, IPC flag 변경과 사건 mutation은 수행하지 않았다.

## 다음에 사용할 정확한 프롬프트

> 저장소와 Git을 source of truth로 다시 확인하고 PLAN-0016 Gate B만 수행해줘. 먼저
> Gate A 결과 문서 `docs/operations/plan-0016-game-dashboard-gate-a-result-2026-08-01.md`의
> PASS 증거가 여전히 유효한지 read-only로 재검증해. Candidate는
> `f469c19029d139267fced0ffcb289aabe20132fc`, release ID는 `f469c19029d1`, exact source
> archive SHA-256은 `e0ea44670f933bc62d90170e4e86587c29019a61fdc5ef8d9163f30572cdebfb`, migration
> 0012 SHA-256은 `188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c`다.
> Gate B의 fresh backup 생성·restore verification과 migration 0012 적용만 승인한다.
> Gate C deploy/restart, Gate D IPC 변경과 실제 사건 mutation은 승인하지 않는다.
> 어떤 drift, stale backup, unhealthy 상태, checksum 불일치 또는 인증 경계가 발생하면
> 즉시 중단하고 비민감 증거만 보고해.
