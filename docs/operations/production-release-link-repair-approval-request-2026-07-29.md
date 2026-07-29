# Production release link read-only preflight와 bounded repair 승인 요청 — 2026-07-29

- 상태: Owner 승인 요청 전 — 실행 미승인
- 대상: production Lightsail `/opt/waw/current`, `/opt/waw/previous`
- 관찰된 current: `bb53cf2`
- 복구할 original previous: `f08089f`
- Service restart: 금지
- Release staging/activation: 금지

이 문서는 첫 GitHub Actions failed activation이 `current`를 복구하면서
`previous`를 current와 같은 값으로 남겼을 가능성을 안전하게 확인하고, 그
상태가 정확히 확인된 경우에만 original previous symlink 하나를 복구하기 위한
승인 경계를 정의한다. 이 문서 자체는 SSH 접속이나 production mutation을
승인하지 않는다.

## 고정된 release 증거

| 역할 | Release | `.waw-release-sha256` 기대값 |
| --- | --- | --- |
| 복구된 active current | `bb53cf2` | `bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed` |
| 실패 전 original previous | `f08089f` | `f08089fb57f3c0645c2f845648bcca05c53c3ed9a05cd480ae3ea4bfe02605b4` |

두 값은 기존 production activation 결과에 기록된 immutable release marker다.
값이 다르거나 marker가 없으면 이름이 같아도 복구 대상으로 사용하지 않는다.

## 요청하는 승인 범위

승인은 다음 두 실행으로 분리한다.

1. Named human operator가 Phase A read-only preflight를 정확히 한 번 실행한다.
2. 결과가 `REPAIR_REQUIRED_ELIGIBLE`일 때만 Owner가 별도로 Phase B의 symlink
   하나 복구를 승인한다.

Phase A 승인은 Phase B를 자동 승인하지 않는다. Phase B 실패 후 retry도
승인하지 않는다. 모든 결과는 secret 없는 고정 label과 release metadata만
기록한다.

## Phase A — read-only preflight

### 허용 명령

Production named human operator만 사용한다. GitHub deploy key를 재사용하지
않는다.

```sh
sudo sh -eu <<'SH'
current=$(readlink -f /opt/waw/current)
previous=$(readlink -f /opt/waw/previous)
expected_current=/opt/waw/releases/bb53cf2
expected_previous=/opt/waw/releases/f08089f
current_hash=bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed
previous_hash=f08089fb57f3c0645c2f845648bcca05c53c3ed9a05cd480ae3ea4bfe02605b4

case "$current" in /opt/waw/releases/*) ;; *) exit 1 ;; esac
case "$previous" in /opt/waw/releases/*) ;; *) exit 1 ;; esac
test "$current" = "$expected_current"
test -d "$current"
test -d "$expected_previous"
test -f "$current/.waw-release-sha256"
test -f "$expected_previous/.waw-release-sha256"
test "$(cat "$current/.waw-release-sha256")" = "$current_hash"
test "$(cat "$expected_previous/.waw-release-sha256")" = "$previous_hash"

printf 'RELEASE_LINK_READONLY current=%s previous=%s target=%s\n' \
  "$(basename "$current")" "$(basename "$previous")" \
  "$(basename "$expected_previous")"

if test "$previous" = "$expected_previous"; then
  printf '%s\n' 'RELEASE_LINK_READONLY result=NO_REPAIR'
elif test "$previous" = "$current"; then
  printf '%s\n' 'RELEASE_LINK_READONLY result=REPAIR_REQUIRED_ELIGIBLE'
else
  printf '%s\n' 'RELEASE_LINK_READONLY result=STOPPED_UNEXPECTED_PREVIOUS'
  exit 1
fi
SH
```

이어서 기존
`docs/operations/first-production-gate4-readonly-check.md`의 section 1과
section 3~9에 있는 service, timer, backup marker, loopback/canonical health,
capacity, listener와 credential metadata 점검을 실행한다. Section 2의
distinct-link 판정은 이 Phase A가 대체하며 repair 전에는 실행하지 않는다.

### Phase A 판정

- `NO_REPAIR`: current=`bb53cf2`, previous=`f08089f`이고 두 marker가
  일치한다. Phase B를 실행하지 않고 전체 Gate 4가 PASS일 때 checklist로
  돌아간다.
- `REPAIR_REQUIRED_ELIGIBLE`: current와 previous가 모두 `bb53cf2`이고
  `f08089f` directory와 두 marker가 정확하다. Gate 4 section 1과 3~9도
  PASS해야 Phase B 승인 요청 자격이 생긴다.
- `STOPPED_UNEXPECTED_PREVIOUS` 또는 명령 실패: mutation 없이 중단한다.

Phase A는 symlink, release, unit, process, credential, timer 또는 journal을
변경하지 않는다.

## Phase B — bounded previous symlink repair

### 추가 Owner 승인 전제

- Phase A의 exact 출력과 Gate 4 section 1·3~9 PASS가 같은 maintenance
  window 안에 있다.
- Current/previous가 둘 다 `bb53cf2`임이 확인됐다.
- `f08089f` marker가 위 기대값과 일치한다.
- 실행자와 별도 rollback 담당자가 지정됐다.
- 승인 범위가 `/opt/waw/previous` symlink 한 번의 atomic replace뿐임을
  확인했다.

### 허용 mutation

정확히 한 개의 같은-filesystem temporary symlink를 만들고
`/opt/waw/previous`를 원자 교체한다.

```text
before:
  /opt/waw/current  -> /opt/waw/releases/bb53cf2
  /opt/waw/previous -> /opt/waw/releases/bb53cf2

after:
  /opt/waw/current  -> /opt/waw/releases/bb53cf2
  /opt/waw/previous -> /opt/waw/releases/f08089f
```

허용되는 primitive는 `/opt/waw` 아래 fresh temporary symlink 생성,
성공 경로의 GNU `mv -Tf` 한 번, postcondition read와 temporary cleanup뿐이다.
Postcondition 실패로 pre-state rollback이 필요할 때만 두 번째 `mv -Tf` 한
번을 허용한다.

### 승인 후 사용할 exact bounded 명령

이 블록은 Phase B의 별도 Owner 승인 뒤에만 한 번 실행한다.

```sh
sudo sh -u <<'SH'
current_link=/opt/waw/current
previous_link=/opt/waw/previous
current_target=/opt/waw/releases/bb53cf2
previous_target=/opt/waw/releases/f08089f
current_hash=bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed
previous_hash=f08089fb57f3c0645c2f845648bcca05c53c3ed9a05cd480ae3ea4bfe02605b4
repair_tmp=/opt/waw/.previous.repair.$$
rollback_tmp=/opt/waw/.previous.rollback.$$
cleanup() {
  rm -f -- "$repair_tmp" "$rollback_tmp"
}
trap cleanup EXIT
trap 'cleanup; exit 1' HUP INT TERM

test "$(readlink -f "$current_link")" = "$current_target" &&
test "$(readlink -f "$previous_link")" = "$current_target" &&
test -d "$current_target" &&
test -d "$previous_target" &&
test "$(cat "$current_target/.waw-release-sha256")" = "$current_hash" &&
test "$(cat "$previous_target/.waw-release-sha256")" = "$previous_hash" &&
test ! -e "$repair_tmp" &&
test ! -L "$repair_tmp" &&
test ! -e "$rollback_tmp" &&
test ! -L "$rollback_tmp" || {
  printf '%s\n' 'RELEASE_LINK_REPAIR result=CONFLICT'
  exit 1
}

web_pid=$(systemctl show waw-web.service -p MainPID --value)
bot_pid=$(systemctl show waw-bot.service -p MainPID --value)
web_started=$(systemctl show waw-web.service \
  -p ExecMainStartTimestampMonotonic --value)
bot_started=$(systemctl show waw-bot.service \
  -p ExecMainStartTimestampMonotonic --value)
test "$web_pid" -gt 0 &&
test "$bot_pid" -gt 0 &&
test -n "$web_started" &&
test -n "$bot_started" || exit 1

ln -s "$previous_target" "$repair_tmp" || exit 1
mv -Tf "$repair_tmp" "$previous_link" || exit 1

postcondition() {
  test "$(readlink -f "$current_link")" = "$current_target" &&
  test "$(readlink -f "$previous_link")" = "$previous_target" &&
  test "$(cat "$current_target/.waw-release-sha256")" = "$current_hash" &&
  test "$(cat "$previous_target/.waw-release-sha256")" = "$previous_hash" &&
  test "$(systemctl show waw-web.service -p MainPID --value)" = "$web_pid" &&
  test "$(systemctl show waw-bot.service -p MainPID --value)" = "$bot_pid" &&
  test "$(systemctl show waw-web.service \
    -p ExecMainStartTimestampMonotonic --value)" = "$web_started" &&
  test "$(systemctl show waw-bot.service \
    -p ExecMainStartTimestampMonotonic --value)" = "$bot_started" &&
  systemctl is-active --quiet waw-web.service &&
  systemctl is-active --quiet waw-bot.service &&
  systemctl is-active --quiet caddy.service &&
  systemctl is-active --quiet waw-backup.timer &&
  systemctl is-active --quiet waw-monitor.timer &&
  systemctl is-active --quiet systemd-journald.service &&
  curl --fail --silent --max-time 10 \
    http://127.0.0.1:18080/health | grep -q '"status":"healthy"' &&
  curl --fail --silent --max-time 15 \
    https://waw.dubeom.com/health | grep -q '"status":"healthy"'
}

if postcondition; then
  printf '%s\n' \
    'RELEASE_LINK_REPAIR result=PASS current=bb53cf2 previous=f08089f restart=0'
  exit 0
fi

ln -s "$current_target" "$rollback_tmp" || exit 1
mv -Tf "$rollback_tmp" "$previous_link" || exit 1
test "$(readlink -f "$current_link")" = "$current_target" &&
test "$(readlink -f "$previous_link")" = "$current_target" || exit 1
printf '%s\n' \
  'RELEASE_LINK_REPAIR result=FAIL_ROLLED_BACK current=bb53cf2 previous=bb53cf2'
exit 1
SH
```

### 필수 postcondition

- Current가 계속 exact `bb53cf2`다.
- Previous가 exact `f08089f`다.
- 두 marker SHA-256이 그대로다.
- Web/bot MainPID와 start timestamp가 Phase A와 동일하다.
- Web/bot/Caddy, backup/monitor timer와 journald가 계속 active다.
- Loopback과 canonical health가 HTTP `200`, `healthy`다.
- Failed unit, service restart, daemon-reload와 release activation count가
  모두 `0`이다.
- Temporary symlink와 SSH/access material이 남지 않는다.
- Repair 뒤 기존 Gate 4 전체가
  `GATE4_READONLY=PASS current=bb53cf2 previous=f08089f`로 통과한다.

성공 label:

```text
RELEASE_LINK_REPAIR result=PASS current=bb53cf2 previous=f08089f restart=0
```

## Phase B rollback과 중단

Atomic replace 뒤 postcondition 하나라도 실패하면 새로운 retry 없이
`previous`만 Phase A에서 캡처한 exact `bb53cf2`로 한 번 원자 복구한다.
Current, unit, service와 release directory는 건드리지 않는다.

Rollback postcondition:

```text
/opt/waw/current  -> /opt/waw/releases/bb53cf2
/opt/waw/previous -> /opt/waw/releases/bb53cf2
```

이는 repair 전 상태로 돌아가는 것이며 deploy-ready 상태를 뜻하지 않는다.
Rollback 뒤 즉시 중단하고 새 진단·repair는 별도 승인을 받는다. Target, marker,
current 또는 previous가 Phase A 이후 달라졌다면 symlink를 변경하지 않고
`RELEASE_LINK_REPAIR result=CONFLICT`로 중단한다.

## 명시적 금지 범위

- `production` push 또는 GitHub Actions workflow 실행
- `current` symlink 변경
- Release stage, activate, delete, chmod 또는 build
- Web/bot/Caddy start, stop, restart, reload, signal 또는 daemon-reload
- Credential read/change, DB query/migration, provider call
- Backup 실행, timer/monitor 변경
- DNS, firewall, certificate 또는 journald 변경/vacuum
- Failed candidate `464eb99542df` 삭제
- 명령 재실행, improvisation 또는 범위 확대

## 출력 allowlist

허용:

- 고정 PASS/STOPPED/CONFLICT label
- `bb53cf2`, `f08089f` release ID
- 위 두 공개 marker SHA-256의 일치 여부
- Symlink가 기대 target과 일치하는지 여부
- Service/timer active 여부, health 고정 상태와 PID/start timestamp 동일 여부
- Mutation/restart/daemon-reload/transient count

금지:

- Credential, token, cookie, OAuth code, session identifier
- Environment/process 전체 출력
- Discord 메시지 또는 summary/provider payload
- Journal 본문
- Private/public key 또는 known-host 본문

## 요청할 Owner 승인 문구

Phase A:

> Production named human operator가 이 문서의 Phase A metadata-only
> read-only preflight를 정확히 한 번 실행하는 것을 승인한다. Symlink, release,
> service, credential, database와 host 설정은 변경하지 않는다. 결과가
> `REPAIR_REQUIRED_ELIGIBLE`이어도 Gate 4 section 1·3~9 확인과 별도 승인 전
> Phase B를 실행하지 않는다.

Phase B는 Phase A가 자격을 증명한 뒤 별도로 요청한다:

> Phase A의 exact `REPAIR_REQUIRED_ELIGIBLE` 및 Gate 4 section 1·3~9 PASS를 근거로
> `/opt/waw/previous`를 `bb53cf2`에서 검증된 `f08089f`로 한 번 원자 교체하는
> bounded repair를 승인한다. Current와 service는 변경하지 않고 restart,
> daemon-reload, release activation과 retry는 모두 0으로 유지한다. 충돌 또는
> postcondition 실패 시 previous만 pre-state로 한 번 복구하고 중단한다.

명시적 Owner 승인 전에는 Phase A SSH 접속과 Phase B mutation 모두
허가되지 않는다.
