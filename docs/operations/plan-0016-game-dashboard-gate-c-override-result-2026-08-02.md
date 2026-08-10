# PLAN-0016 검거 대시보드 Gate C owner override 결과 — 2026-08-02

- 상태: **PASS — application release deployed with IPC OFF**
- Owner override: Gate B restore verification 및 migration 0012 미완료 상태를 문서화하고
  application deployment를 진행
- Gate D admin IPC activation: 실행하지 않음
- 실제 사건 mutation: 실행하지 않음

## 사용자 기능 범위

이번 release에서 즉시 사용할 수 있는 사용자 기능은 관리자 대시보드의 몰랭 검거 현황,
진행 게임 및 사건 이력 조회와 Riot ID의 Unicode tag line 입력·승인이다. Release에는
관리자 사건 정정·취소 UI/IPC 코드도 포함되지만 web/bot unit의
`WAW_ADMIN_COMMAND_IPC_ENABLED=0` 기본값을 유지했으므로 해당 쓰기 기능은 활성화하지
않았다.

## 승인 예외와 잔여 위험

Gate B에서 fresh encrypted schema-11 backup publication은 성공했지만 offline age
identity가 없어 empty-target restore verification을 완료하지 못했다. Migration 0012도
적용하지 않아 production schema는 마지막 확인 기준 `11`이다. Migration 0012는 새
테이블이나 data rewrite가 아니라 `admin_command_result` command/reason allowlist를
확장하고 schema version `12`를 기록하는 forward-compatible constraint 변경이다.

따라서 IPC-OFF 조회 release는 배포했지만 사건 정정·취소를 활성화하면 terminal result
기록이 schema-11 constraint에 거부될 수 있다. Gate D와 실제 사건 mutation은 migration
0012 및 그 전제인 restore verification이 완료될 때까지 금지 상태를 유지한다.

## 배포 증거

| 항목 | 결과 |
| --- | --- |
| Release PR | `#8`, merged |
| Production commit | `568522974a8f80f6df7533005bbb9b0a1146a9c6` |
| Release ID | `568522974a8f` |
| Source archive SHA-256 | `75516091ffa7e5dbf75673f554e3307891818d7941ddf2f04b7d6899acfa28cc` |
| Exact-head CI before merge | run `30700735890`, PASS |
| Production deploy | run `30706321869`, PASS |
| Remote activation | PASS |
| Canonical health after deploy | `https://waw.dubeom.com/health`, HTTP `200`, `healthy` |

Deployment workflow는 exact production commit을 archive로 만들고 hash를 검증한 뒤 immutable
release를 stage/activate했다. `waw-web.service`와 `waw-bot.service` unit을 설치하고 두
service를 restart한 뒤 loopback health와 current symlink를 검증했다. Rollback은 실행되지
않았다. Credential, connection string, OAuth/session 값, Discord identifier와 사건 reason은
출력하거나 이 증거에 기록하지 않았다.

## 변경 수와 미실행 항목

- 이전 Gate B production 변경: encrypted backup publication `1`
- 이번 Gate C override: immutable application release deployment `1`, web/bot restart 수행
- DB migration: `0`
- Credential 및 grant 변경: `0`
- Admin IPC flag activation: `0`
- 실제 사건 mutation: `0`

## 다음 경계

Offline age identity가 있는 승인된 환경에서 fresh backup의 empty PostgreSQL 17 restore를
검증한 뒤 migration 0012를 적용하고 schema/grant/health를 재검증한다. 그 전에는 Gate D를
승인하거나 사건 정정·취소를 시도하지 않는다.
