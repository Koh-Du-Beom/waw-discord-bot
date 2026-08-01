# PLAN-0016 검거 대시보드 Gate D 결과 — 2026-08-02

- 상태: **PASS — admin IPC activated**
- Owner 승인: 사건 정정·취소를 사용하지 않는 조건으로 admin IPC를 `ON`
- Application release: `568522974a8f`
- Production schema: 마지막 확인 기준 `11`; migration 0012 미적용

## 실행

저장소 unit의 default-off 계약은 변경하지 않았다. Runbook에 따라 web/bot 각각의
root-owned systemd drop-in에서 effective `WAW_ADMIN_COMMAND_IPC_ENABLED=1`만 설정하고
`daemon-reload` 후 bot, web 순서로 재시작했다. 실패 시 drop-in 제거와 IPC-OFF service
restart를 수행하는 rollback handler를 사용했으며 rollback은 실행되지 않았다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| web/bot effective IPC flag | 각각 `1` |
| web/bot | `active` |
| Runtime directory | `waw-bot:waw-admin-command`, `0750` |
| Admin socket | `waw-bot:waw-admin-command`, `0660` |
| Caddy/journald | `active` |
| Backup/monitor timers | `active`, `enabled` |
| Failed units | `0` |
| Canonical health | HTTP `200`, `healthy` |
| 최근 web/bot journal sensitive canary | `0` |

Credential, connection string, OAuth/session 값, Discord/Riot identifier와 사건 reason은
출력하거나 기록하지 않았다. 실제 Riot 승인·거절·해제 또는 사건 mutation은 실행하지
않았다.

## 제한과 rollback

Riot 연결 관리 IPC는 production schema 11의 기존 allowlist와 호환된다. 반면 새 사건
정정·취소 terminal result는 migration 0012가 확장하는 constraint를 요구하므로 owner가
사용하지 않기로 한 상태이며 실제 실행은 금지한다. 해당 경로가 시도되거나 IPC/health
장애가 발생하면 web drop-in을 먼저 제거하고 web을 restart한 뒤 bot drop-in 제거와 bot
restart로 IPC를 다시 `OFF`로 만든다.
