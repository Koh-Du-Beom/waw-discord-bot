# 최초 production 승격 Gate 4 읽기 전용 점검

- 상태: 운영자 실행 대기
- 대상: production Lightsail host
- 변경 작업: 없음
- 관련 체크리스트:
  `docs/operations/first-production-promotion-activation-checklist.md`

이 문서는 최초 GitHub Actions production 배포 직전에 host가 정상이고 rollback
가능한 상태인지 확인하기 위한 읽기 전용 명령 모음이다. Application credential,
환경변수, process environment, journal 본문과 Discord 사용자 콘텐츠를 출력하지
않는다.

## 실행 전 주의사항

- Production Lightsail host의 named human operator 계정으로 실행한다.
- 아래 명령만 실행한다.
- `systemctl cat`, `env`, `printenv`, `ps e`, credential 파일의 `cat`은 실행하지
  않는다.
- 출력에 예상하지 못한 secret, token, cookie, connection string 또는 사용자
  콘텐츠가 보이면 공유하지 말고 즉시 중단한다.
- 이 점검은 service restart, 파일 변경, backup 실행, journald vacuum 또는
  release 변경을 수행하지 않는다.

## 1. OS와 시각

```sh
printf '%s\n' '--- os and time ---'
. /etc/os-release
printf 'os=%s version=%s\n' "$ID" "$VERSION_ID"
date --utc '+utc=%Y-%m-%dT%H:%M:%SZ'
```

기대 결과:

- `os=ubuntu version=24.04`
- 현재 UTC 시각이 실제 시각과 일치

## 2. Current와 previous release

```sh
printf '%s\n' '--- releases ---'
sudo readlink -f /opt/waw/current
sudo readlink -f /opt/waw/previous

sudo sh -c '
current=$(readlink -f /opt/waw/current)
previous=$(readlink -f /opt/waw/previous)
case "$current" in /opt/waw/releases/*) ;; *) exit 1 ;; esac
case "$previous" in /opt/waw/releases/*) ;; *) exit 1 ;; esac
test -d "$current"
test -d "$previous"
test "$current" != "$previous"
printf "%s\n" "release_boundary=PASS"
'
```

기대 결과:

- 두 경로가 모두 `/opt/waw/releases/` 아래에 있음
- 두 release가 서로 다름
- `release_boundary=PASS`

두 경로가 같거나 경로 또는 directory가 없으면 즉시 중단한다.

## 3. Application과 운영 service

```sh
printf '%s\n' '--- active services ---'
sudo systemctl is-active \
  waw-web.service \
  waw-bot.service \
  caddy.service \
  waw-backup.timer \
  waw-monitor.timer \
  systemd-journald.service

printf '%s\n' '--- enabled services ---'
sudo systemctl is-enabled \
  waw-web.service \
  waw-bot.service \
  caddy.service \
  waw-backup.timer \
  waw-monitor.timer

printf '%s\n' '--- failed units ---'
sudo systemctl --failed --no-legend
```

기대 결과:

- `is-active` 결과가 모두 `active`
- `is-enabled` 결과가 모두 `enabled`
- Failed unit 출력이 비어 있음

하나라도 다르면 즉시 중단한다.

## 4. 최근 backup과 monitoring 결과

```sh
printf '%s\n' '--- latest backup result ---'
sudo systemctl show waw-backup.service \
  -p Result \
  -p ExecMainCode \
  -p ExecMainStatus

printf '%s\n' '--- latest monitoring result ---'
sudo systemctl show waw-monitor.service \
  -p Result \
  -p ExecMainCode \
  -p ExecMainStatus
```

기대 결과:

```text
Result=success
ExecMainCode=1
ExecMainStatus=0
```

`systemctl show`의 숫자 `ExecMainCode=1`은 `CLD_EXITED`를 뜻하며 실패 판정이
아니다. `Result=success`와 `ExecMainStatus=0`을 함께 확인한다.

Backup 또는 monitoring 결과가 다르면 중단한다.

## 5. Backup marker metadata

다음 명령은 허용된 metadata 필드만 출력한다.

```sh
printf '%s\n' '--- backup marker metadata ---'
sudo jq '{
  createdAt,
  completedAt,
  schemaVersion,
  expectedRowCount,
  expectedInvariant,
  status
}' /var/lib/waw-backup/last-published.json

printf '%s\n' '--- backup marker age ---'
sudo sh -c '
completed=$(jq -r ".completedAt // empty" \
  /var/lib/waw-backup/last-published.json)
test -n "$completed"
completed_epoch=$(date -d "$completed" +%s)
now_epoch=$(date +%s)
age=$((now_epoch - completed_epoch))
test "$age" -ge 0
printf "backup_age_seconds=%s\n" "$age"
test "$age" -le 129600
printf "%s\n" "backup_freshness=PASS"
'
```

기대 결과:

- `status`: `published`
- `schemaVersion`: 양의 정수
- `expectedRowCount`: 0 이상의 정수
- `expectedInvariant`: `constraints_valid`
- `backup_freshness=PASS`

현재 daily backup 주기를 고려해 완료 후 36시간(`129600`초) 이내를 freshness
상한으로 사용한다. 초과하거나 JSON 검증이 실패하면 중단한다.

Archive ID, object key, hash와 credential은 공유할 필요가 없다.

## 6. Loopback과 정식 health

```sh
printf '%s\n' '--- loopback health ---'
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:18080/health
printf '\n'

printf '%s\n' '--- canonical health ---'
curl --fail --silent --show-error --max-time 15 \
  https://waw.dubeom.com/health
printf '\n'
```

기대 결과:

```json
{"status":"healthy"}
```

두 요청 중 하나라도 HTTP 오류, timeout 또는 `healthy`가 아닌 결과를 반환하면
중단한다.

## 7. Disk와 memory 여유

```sh
printf '%s\n' '--- memory ---'
free -h

printf '%s\n' '--- disk ---'
df -h /opt/waw /tmp

printf '%s\n' '--- exact available bytes ---'
df --output=target,avail -B1 /opt/waw /tmp
awk '/MemAvailable:/ {print "memory_available_kib=" $2}' /proc/meminfo
```

중단 조건:

- `/opt/waw` 또는 `/tmp` 여유 공간이 1 GiB 미만
- `MemAvailable`이 256 MiB(`262144` KiB) 미만
- Filesystem 오류 또는 read-only 상태가 관찰됨

이 기준은 release 하나를 추가로 stage하고 host에서 `npm ci`, typecheck와
build를 실행하기 위한 보수적인 activation gate다.

## 8. Listener와 process 수

```sh
printf '%s\n' '--- tcp listeners ---'
sudo ss -lntp

printf '%s\n' '--- application process counts ---'
web_pid=$(sudo systemctl show waw-web.service -p MainPID --value)
bot_pid=$(sudo systemctl show waw-bot.service -p MainPID --value)
printf 'web_main_pid=%s\n' "$web_pid"
printf 'bot_main_pid=%s\n' "$bot_pid"

printf '%s\n' '--- unit identities ---'
sudo systemctl show waw-web.service \
  -p User -p Group -p MainPID -p ActiveState -p SubState
sudo systemctl show waw-bot.service \
  -p User -p Group -p MainPID -p ActiveState -p SubState
```

확인 기준:

- Fastify port `18080`은 loopback에만 bind
- Public listener는 기존 승인 범위인 SSH, HTTP와 HTTPS뿐
- Web과 bot의 `MainPID`가 각각 `0`이 아닌 하나의 PID
- Web은 `User=waw-web`, `Group=waw-web`
- Bot은 `User=waw-bot`, `Group=waw-member-role`
- 두 unit 모두 `ActiveState=active`, `SubState=running`

뜻밖의 public port, `0` PID 또는 다른 service identity가 있으면 중단한다.

## 9. 예상 파일과 credential path metadata

파일 내용은 출력하지 않는다.

```sh
printf '%s\n' '--- expected unit files ---'
sudo stat -c '%n %U:%G %a' \
  /etc/systemd/system/waw-web.service \
  /etc/systemd/system/waw-bot.service \
  /etc/systemd/system/waw-backup.timer \
  /etc/systemd/system/waw-monitor.timer

printf '%s\n' '--- credential directory metadata only ---'
sudo stat -c '%n %U:%G %a' /etc/waw-credentials
sudo find /etc/waw-credentials \
  -mindepth 1 \
  -maxdepth 1 \
  -type f \
  -printf '%f %u:%g %m\n' |
  sort
```

중단 조건:

- 예상 unit 파일이 없음
- Credential directory 또는 파일이 world-readable
- Owner, group 또는 mode가 기존 승인된 production inventory와 다름
- 예상하지 못한 credential 이름이 있음

Credential 파일의 크기, hash 또는 본문은 출력하지 않는다.

## 10. 최종 결과

모든 항목이 통과한 경우에만 다음 형식으로 결과를 기록한다. 아래 placeholder를
그대로 shell 명령으로 실행하지 않는다.

```text
GATE4_READONLY=PASS current=<release-id> previous=<release-id>
```

현재 확인된 ID를 사용한 예:

```text
GATE4_READONLY=PASS current=bb53cf2 previous=f08089f
```

하나라도 실패하거나 판단할 수 없는 경우:

```text
GATE4_READONLY=STOPPED reason=<비밀정보가 없는 짧은 사유>
```

## 공유해도 되는 결과

- `PASS` 또는 `STOPPED`
- Current와 previous release ID
- Service/timer의 active·enabled·result 상태
- Backup 완료 시각, schema version, row count와 freshness
- Health의 고정된 상태값
- Memory/disk 여유
- Listener port와 bind 범위
- Unit/credential 파일 이름, owner, group과 mode

## 공유하면 안 되는 결과

- Private/public key 본문
- Known-host 원문
- Application credential 또는 connection string
- Environment 전체 출력
- Token, cookie, OAuth code와 session identifier
- Discord 메시지 또는 요약 본문
- Journal 원문
- Provider request/response payload
