# journald 보존·redaction·경보 선택지

- 상태: Research complete — owner decision required
- 확인일: 2026-07-23
- 연결 결정: D-11, `ADR-0011`~`ADR-0013`
- 연결 요구사항: `FUN-001`~`FUN-002`, `FUN-017`, `PRI-001`~`PRI-003`, `OPS-003`~`OPS-004`, `OWN-004`

## 고정 제약

- 서울 Lightsail Ubuntu 24.04의 1GB RAM·40GB disk 한 대에서 Caddy, web, bot과 backup job을 systemd service로 운영한다.
- 운영 로그는 30일, 감사·설정 변경·몰랭 이력은 1년 보존한다. journald가 1년 감사 원장을 대체하면 안 된다.
- Discord 원문, OAuth code/token, session identifier, cookie, authorization header, API key, password, 전체 request/response body와 불필요한 IP·User-Agent를 기록하지 않는다.
- 서비스 장애, RPO 위반과 certificate 만료 위험은 host가 살아 있을 때만 보이는 local log 한 경로에 의존하지 않는다.
- 첫 MVP는 운영자 한 명과 월 3만 원 총예산을 전제로 하므로 agent, 수집 backend와 장기 credential을 추가하려면 명확한 장애·감사 이득이 있어야 한다.

## Ubuntu 24.04와 journald의 확인된 동작

Ubuntu 24.04 Noble은 systemd 255 계열을 제공한다. 해당 버전의 journald는 별도 설정이 없으면 `Storage=auto`이고 `/var/log/journal` 존재 여부에 따라 persistent 여부가 달라지며, `MaxRetentionSec=` 기본값은 `0`이라 시간 기반 삭제를 하지 않는다. `SystemMaxUse=`와 `SystemKeepFree=`는 더 작은 한계를 적용하지만 삭제는 archived journal file 단위로 일어나므로 active file과 회전 granularity 때문에 실제 사용량·최고 수명은 설정값과 정확히 같지 않을 수 있다.

`journalctl`은 unit, priority와 field로 구조화 조회할 수 있지만 arbitrary field 값을 저장 전에 지우는 redaction engine은 아니다. `--vacuum-*`도 개별 entry나 field가 아니라 archived file을 삭제한다. 따라서 금지값이 journal에 들어간 뒤 선택적으로 고치는 방식은 성립하지 않는다.

System journal은 기본적으로 root와 `systemd-journal`, `adm`, `wheel` 등 넓은 특권 group에서 읽을 수 있다. Application user에 이 group을 주면 다른 service와 OS log까지 읽게 되므로 workload identity에는 부여하지 않아야 한다.

공식 근거:

- Noble의 systemd source package는 255.4 계열이다. [Ubuntu Noble systemd package](https://launchpad.net/ubuntu/noble/%2Bsource/systemd)
- `Storage=persistent`, size/free-space limit, compression, file rotation과 `MaxRetentionSec=`의 의미 및 drop-in 사용이 문서화되어 있다. [systemd 255 journald.conf](https://www.freedesktop.org/software/systemd/man/255/journald.conf.html), [Ubuntu Noble journald.conf](https://manpages.ubuntu.com/manpages/noble/man5/journald.conf.5.html)
- `journalctl`은 unit/field/priority 조회, disk usage, rotate, vacuum과 integrity verification을 제공하며 system journal 접근 group을 설명한다. [systemd 255 journalctl](https://www.freedesktop.org/software/systemd/man/255/journalctl.html)

## 보존 대안

| 대안 | 30일 보존·용량 | 장애 후 증거 | 운영·보안 비용 | 판정 |
|---|---|---|---|---|
| A. 기본 system journal의 명시적 persistent drop-in | OS와 WAW service를 한 journal에 두고 시간·크기·여유 공간을 함께 제한한다. 현재 systemd 운영면만 사용한다. | Host disk 손실·침해 시 operational log도 잃는다. 외부 감사 DB와 Lightsail metric은 남는다. | 가장 작다. Root가 전체 journal을 읽으며 개별 entry 삭제는 불가능하다. | 첫 MVP 권고 |
| B. WAW 전용 journal namespace | WAW service를 별도 journald instance와 retention/access 경계에 둬 용량과 incident purge blast radius를 줄인다. | 여전히 같은 host disk다. PID 1이 만든 일부 unit lifecycle log는 기본 journal에 남을 수 있다. | 추가 journald instance, namespace별 설정·조회·복구가 생긴다. | 반복적인 cross-service leak 또는 별도 접근 등급이 필요할 때 |
| C. CloudWatch Agent 또는 remote journal 수집 | Off-host retention, search와 metric alarm을 제공할 수 있다. | Host 손실 뒤에도 전송된 log가 남는다. | Agent, egress, ingestion/storage 비용과 수집 backend가 필요하다. Lightsail에는 instance role이 없어 AWS bootstrap credential도 추가된다. | Off-host 증거·다중 host·중앙 검색이 요구될 때의 strongest alternative |

CloudWatch Agent는 host 내부 metric과 log를 수집하지만 설치·설정과 IAM role/user가 필요하다. 현재 Lightsail credential 경계에서는 `ADR-0013`이 피한 장기 AWS bootstrap credential을 다시 도입하므로 초기 선택으로 삼지 않는다. [AWS CloudWatch Agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html)

## 권고 보존 계약

`/etc/systemd/journald.conf.d/60-waw-retention.conf`에 다음 값을 명시한다.

```ini
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=1G
SystemKeepFree=4G
MaxFileSec=1day
MaxRetentionSec=30day
ForwardToSyslog=no
ForwardToKMsg=no
ForwardToConsole=no
ForwardToWall=no
```

- `MaxRetentionSec=30day`는 privacy retention ceiling이고 `SystemMaxUse=1G`·`SystemKeepFree=4G`는 availability ceiling이다. 공간 한계가 먼저 오면 30일보다 짧아질 수 있으므로 이를 정상으로 숨기지 않고 경보한다.
- 1GiB는 30일 평균 약 34MiB/day에 해당한다. 80% 경보 여유를 적용하면 약 27MiB/day가 운영 기준이다. 실제 24시간 projection이 이를 넘으면 redaction을 완화하지 않고 noisy source를 줄이거나 owner가 최대 2GiB까지 명시적으로 재결정한다.
- `MaxFileSec=1day`는 오래된 file 삭제 granularity를 제한한다. File count를 별도로 낮춰 30일보다 먼저 삭제하지 않는다.
- 기존 log를 새 ceiling에 맞추는 최초 rotate/vacuum은 삭제 작업이므로 production rollout에서 oldest/newest timestamp와 usage를 먼저 기록하고 owner-approved window에서 한 번만 실행한다.
- Journal은 application release나 database backup에 넣지 않는다. 30일은 정상 host에서의 보존 목표이지 host disk 손실에 대한 durability 보장이 아니다.
- `Seal=yes` 기본값만으로 tamper evidence를 주장하지 않는다. 외부 verification key를 만든 FSS 또는 off-host 수집이 없으면 root compromise 이후 진본성을 증명할 수 없다.

## redaction 대안과 계약

| 지점 | 허용 방식 | 금지 방식 |
|---|---|---|
| Fastify/application | 고정 allowlist serializer로 timestamp, correlation ID, event type, normalized route/command, outcome, reason code, duration과 service version만 출력 | request URL, query, headers, body, cookie, IP, User-Agent, raw provider body와 untrusted error message를 만든 뒤 denylist로 지우기 |
| Caddy | 첫 MVP access log는 비활성화하고 TLS/proxy operational event만 journal에 둔다. 일반 접근은 Fastify가 normalized route로 기록한다. | 기본 access log의 URI, remote/client IP와 request header를 그대로 journal에 전달 |
| systemd/운영 script | 고정 reason code, unit name, result와 non-secret count만 출력 | credential path 내용, environment dump, shell trace, raw `curl -v`, provider response body와 secret fingerprint/hash/prefix 출력 |
| 경보 payload | severity, alert key, state, first/last observed UTC, reason code와 service version만 허용 | journal 원문, stack trace, actor/guild/channel ID, query/path parameter, IP, hostname credential과 mention 가능한 사용자 입력 |

Fastify는 Pino 기반 JSON logging과 property redaction을 지원하지만 이 프로젝트는 금지 field를 먼저 serialize하지 않는 allowlist를 우선한다. [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/)

Caddy는 access-log field 삭제·교체·hash filter를 지원한다. 그러나 임의 query key와 향후 header가 늘어나는 denylist보다 access log를 끄고 application의 normalized access event를 canonical operational event로 쓰는 편이 현재 요구에 더 작고 안전하다. 저수준 ingress access telemetry가 실제 필요해지면 URI 전체, request headers, remote/client IP를 삭제한 합성 fixture를 먼저 통과해야 한다. [Caddy log directive](https://caddyserver.com/docs/caddyfile/directives/log)

### 금지값 유입 사고

1. Emitter를 중지하거나 offending log path를 비활성화한다.
2. Secret일 가능성이 있으면 journal 삭제 여부와 무관하게 provider credential을 즉시 revoke/rotate한다.
3. 값 자체가 아닌 service, 시간 범위, 분류와 조치 결과만 1년 감사 원장에 기록한다.
4. 수정한 emitter의 합성 canary가 journal 전체에서 부재함을 확인한다.
5. journald가 entry 단위 삭제를 지원하지 않으므로 영향 시간의 archived file을 rotate/vacuum한다. 이때 함께 사라지는 operational log 범위를 incident에 기록한다.

## 경보 대안

| 대안 | 감지·전달 | 장점 | 한계 |
|---|---|---|---|
| systemd timer + 별도 Discord incoming webhook | Local state와 safe journal signal을 1분마다 평가하고 상태 전이만 webhook으로 보낸다. Host status는 Lightsail alarm email이 보완한다. | Bot process와 무관하고 새 daemon·AWS runtime credential이 없다. 기존 `LoadCredential=`를 재사용한다. | Host/network/Discord 전체 장애 때 local alert는 전송되지 않는다. 작은 state/dedupe 구현이 필요하다. |
| `OnFailure=`마다 직접 webhook 호출 | Unit failure 직후 단순 handler를 실행한다. | 구현이 가장 짧다. | Restart loop의 alert storm, health degradation·backup age·disk pressure 누락, 복구 notification 부재가 생긴다. |
| CloudWatch Agent + Logs metric filter/alarm | Log와 host metric을 AWS로 보내 중앙 alarm을 구성한다. | Off-host 감지와 검색이 강하다. | Agent, IAM credential, 비용과 redaction의 두 번째 설정면이 생긴다. |

Discord incoming webhook은 bot user나 persistent Gateway 연결 없이 channel에 message를 게시할 수 있어 bot failure와 delivery credential을 분리할 수 있다. Webhook URL/token은 secret으로 보고 `ADR-0013`의 별도 systemd credential로 주입한다. API 429는 고정 sleep이 아니라 `Retry-After`를 존중하고 bounded retry한다. [Discord incoming webhooks](https://docs.discord.com/developers/platform/webhooks), [Discord webhook resource](https://docs.discord.com/developers/resources/webhook), [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits)

Lightsail은 instance `StatusCheckFailed`, CPU와 burst capacity metric을 제공하고 alarm state 전이를 email/SMS로 알릴 수 있다. Initial external alarm은 `StatusCheckFailed`와 recovery notification만 사용하고 CPU/burst threshold는 실제 baseline 뒤 별도 조정한다. [Lightsail resource metrics](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-resource-health-metrics.html), [Lightsail metric alarms](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-alarms.html)

## 권고 경보 계약

Local evaluator는 1분 timer 하나로 다음 상태를 읽는다. Journal text grep을 canonical state로 삼지 않고 `systemctl show`, application health, non-secret backup marker, public certificate metadata, `journalctl --disk-usage`와 filesystem free space를 우선한다.

| Alert key | Warning | Critical/firing | Recovery |
|---|---|---|---|
| `service.<unit>` | 없음 | Expected web/bot/Caddy/backup unit이 한 번이라도 failed 또는 inactive | 다시 active이고 health gate 통과 |
| `runtime.health` | `degraded` 5회 연속 | `unavailable` 1회 | `healthy` 2회 연속 |
| `backup.age` | 마지막 published marker가 20시간 초과 | 24시간 초과 또는 marker invalid/missing | 유효한 새 publication 확인 |
| `certificate.expiry` | public certificate 잔여 21일 미만 | 14일 미만 또는 parse 실패 | 21일 이상인 새 certificate 확인 |
| `journal.capacity` | 1GiB budget의 80% 이상 또는 filesystem free 5GiB 이하 | filesystem free 4GiB 이하 | 두 값이 warning threshold 아래로 복귀 |
| `journal.dropped` | journald rate-limit/suppression event 1회 | 같은 source에서 두 evaluation 연속 | 다음 10분 동안 새 suppression 없음 |
| `alert.delivery` | webhook 전송 실패를 local state와 journal에 reason code로 기록 | 연속 실패를 dashboard `unknown`으로 노출 | confirmed delivery 성공 |

- 동일 alert key는 `ok → firing`과 `firing → ok` 상태 전이 때 한 번 전송하고, 지속 critical은 6시간마다 한 번만 reminder를 보낸다.
- Payload는 고정 template과 `allowed_mentions.parse=[]`를 사용하며 raw journal line이나 사용자 입력을 넣지 않는다.
- 전송 성공은 webhook response로 확인한다. 실패를 성공으로 기록하지 않고 다음 timer에서 bounded retry한다.
- Webhook secret rotation은 bot token과 분리하며 old/new overlap, delivery 확인, old revoke 순서로 수행한다.
- Lightsail `StatusCheckFailed` alarm과 recovery email은 local evaluator가 전혀 실행되지 않는 host/system failure를 담당한다.

Certificate 검사는 canonical public certificate가 발급된 뒤에만 활성화한다. 이 결정은 DNS, ACME issuance 또는 firewall 변경 권한을 포함하지 않는다.

## 잠정 결론

첫 MVP는 **명시적 persistent system journal + source allowlist redaction + 1분 systemd evaluator/별도 Discord webhook + Lightsail status-check email**을 사용한다. 이는 이미 선택한 systemd와 credential lifecycle을 재사용하면서 local process failure와 host-level failure를 서로 다른 경로로 감지한다.

WAW journal namespace는 같은 host에서 접근 등급이나 incident purge 격리가 실제 필요할 때, CloudWatch/remote 수집은 host 손실 뒤 operational evidence·중앙 검색·다중 host가 필수가 될 때 재검토한다. 현재는 agent와 AWS bootstrap credential을 추가하지 않는다.

## 승인 후 최소 Spike

1. Disposable Ubuntu 24.04에서 축소한 time/size fixture로 persistence, daily-equivalent rotation, retention·capacity ceiling과 reboot 뒤 조회를 검증한다.
2. Synthetic Fastify/Caddy/systemd event에 forbidden canary를 넣고 allowlist output과 journal 전체 부재를 확인한다.
3. 별도 unprivileged service user가 system journal과 다른 workload log를 읽지 못함을 확인한다.
4. Local fake webhook receiver로 unit failure, degraded debounce, critical dedupe, recovery, 429 `Retry-After`와 delivery failure를 검증한다.
5. Unit, drop-in, state, synthetic journal fixture와 disposable instance/key를 same-run cleanup하고 최종 absence를 확인한다.

실제 Discord webhook, production host, DNS, certificate와 firewall은 이 Spike에 사용하거나 변경하지 않는다.

## Owner decision

`ADR-0014의 local persistent journald 30일/1GiB 보존, source allowlist redaction, 별도 Discord webhook + Lightsail status-check 경보 계약을 검토해. 승인하면 Accepted로 전환하고 PLAN-0003 Task 1부터 진행해.`
