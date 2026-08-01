# 검거 대시보드 운영 runbook

이 문서는 ADR-0030과 PLAN-0016의 운영 경계를 설명한다. Production 변경을
승인하지 않으며 canonical origin은 `https://waw.dubeom.com` 하나다.

## 기능과 권한

- Operator와 administrator는 몰랭 스택, 진행 중 관측과 사건 이력을 읽을 수 있다.
- 정정·취소는 current administrator, exact Origin, session-bound CSRF, 15분 이내
  OAuth, 명시적 확인, 1~500자 단일행 사유와 사건 expected version을 모두 요구한다.
- Web은 game table을 읽기만 하며 사건 변경은 bot 소유 Unix socket IPC로 전달한다.
- Bot은 Discord current role을 다시 확인하고 operation, incident, revision,
  terminal result와 audit를 한 PostgreSQL transaction에서 처리한다.
- PUUID, raw Discord ID, Riot provider body, 정정 사유, OAuth/session/CSRF 값은
  URL과 운영 로그에 기록하지 않는다.

## 정상 상태 확인

비밀값이나 식별자를 출력하지 않고 다음 고정 결과만 확인한다.

1. Canonical `/health`가 HTTPS `200`과 `{"status":"healthy"}`를 반환한다.
2. `waw-web`, `waw-bot`, `caddy`, backup/monitor timer가 active이고 failed unit이 없다.
3. Bot Gateway health snapshot이 최근 값이며 storage가 available이다.
4. Admin IPC 활성 상태라면 `/run/waw-admin-command`는
   `waw-bot:waw-admin-command` mode `0750`, socket은 mode `0660`이고 web만
   supplementary group을 통해 접근한다.
5. Operator는 몰랭 read 화면만 보고 administrator만 정정·취소 control을 본다.
6. `unknown`, 시각 없음과 오래된 관측은 위반 또는 최신 상태처럼 표시되지 않는다.

Health endpoint는 IPC command별 준비 상태를 증명하지 않는다. Socket, 권한과
관리자 UI를 별도 확인해야 한다. 실제 사건 mutation을 smoke test로 만들지 않는다.

## 장애 분류와 대응

| 증상 | 의미 | 대응 |
| --- | --- | --- |
| 몰랭 read `503` | DB/read model unavailable | mutation을 시도하지 말고 storage와 web health를 확인한다. |
| 정정·취소 `403` | current role, recent OAuth, Origin/CSRF 또는 확인 실패 | 권한을 우회하지 말고 재로그인 후 다시 확인한다. |
| 정정·취소 `409` | 화면 version이 stale | 최신 사건 이력을 다시 읽고 새 version을 사람이 검토한다. |
| 정정·취소 timeout | terminal outcome 불명 | 새 operation을 보내지 말고 같은 operation의 terminal reconciliation 결과를 확인한다. |
| IPC unavailable | flag/socket/group/bot 장애 | web DB write grant를 늘리지 말고 IPC를 비활성화한 read-only 상태로 복귀한다. |
| 관측 `unknown`/오래됨 | 증거 부족 | 위반으로 추정하지 말고 Riot/Gateway 관측 health를 조사한다. |

운영 로그는 route, outcome, 고정 reason code와 correlation ID만 사용한다. 사건 ID,
사용자 ID, Riot ID와 사유를 journal 검색어 또는 alert payload에 넣지 않는다.

## Rollback

1. 새 관리자 명령 유입을 먼저 막도록 web의 admin IPC flag를 `0`으로 되돌리고 web을
   재시작한다.
2. Bot의 admin IPC flag도 `0`으로 되돌리고 bot을 재시작한 뒤 socket이 제거되거나
   사용되지 않는지 확인한다.
3. 문제가 release code라면 기존 release symlink와 기존 unit을 복원하고 loopback 및
   canonical health를 확인한다.
4. Migration 0012는 이전 command allowlist의 superset인 forward-compatible constraint
   변경이므로 down SQL을 실행하지 않고 남긴다.
5. 이미 commit된 incident/revision/audit/result row는 삭제하거나 되돌리지 않는다.
6. Backup, monitoring, journald와 game observation 상태는 application rollback 때문에
   변경하지 않는다.

Rollback 뒤 operator read, administrator control 비노출 또는 IPC unavailable,
Gateway/storage health와 backup freshness를 다시 확인한다. Web에 game write grant를
주는 임시 복구는 금지한다.

## 미해결·후속 범위

- 첫 production end-to-end 사건 변경은 smoke용 합성 데이터가 아니다. 실제 사건과
  사유를 지정한 별도 owner 승인 없이는 실행하지 않는다.
- Effective freshness/policy의 dashboard read model은 별도 구현 전까지 UI가 승인된
  3분 표시 기준을 사용한다. 정책 변경 UI는 별도 Accepted ADR 없이는 추가하지 않는다.
- 과거 사건과 실제 플레이 Riot link의 영구 귀속은 현재 schema가 보장하지 않는다.
