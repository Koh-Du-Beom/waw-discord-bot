# ADR-0014: local journald 보존·redaction과 이중 경보 경계

- Status: Accepted
- Date: 2026-07-23
- Owners: Project owner
- Related requirements: `FUN-001`~`FUN-002`, `FUN-017`, `PRI-001`~`PRI-003`, `OPS-003`~`OPS-004`, `OWN-004`
- Related research: `docs/research/technology-options/journald-retention-redaction-alerting-options.md`
- Supersedes: None
- Superseded by: None

## Context

Accepted `ADR-0011`은 서울 Lightsail Ubuntu 24.04에서 Caddy, web, bot과 backup을 systemd service로 운영하고 journald를 공통 operational surface로 사용한다. `ADR-0012`는 Caddy access-log retention과 certificate alert를 D-11에 남겼고, `ADR-0013`은 service별 secret을 systemd credential로 분리했다.

운영 로그 30일과 감사·설정 변경 이력 1년이라는 서로 다른 수명, forbidden data의 journal 유입 방지, host 자체가 죽었을 때도 도달하는 경보 경계를 구체화해야 한다. journald 기본값과 사후 grep/vacuum만으로는 이 요구를 충족하지 않는다.

## Decision drivers

- 운영 로그 30일과 40GB disk availability를 함께 제한하는 명시적 ceiling
- Discord 원문, token, cookie, query, header와 불필요한 개인정보의 저장 전 차단
- 1년 감사 원장과 30일 operational journal의 목적·접근·복구 분리
- Unit, health, backup RPO, certificate와 disk pressure의 bounded alert/dedupe
- Host 전체 장애와 local monitor 장애를 다른 경로에서 감지
- 1GB host·한 명 운영자·월 3만 원 예산에서 agent와 bootstrap credential 최소화

## Considered options

### Option A: 기본 persistent system journal + local evaluator + 외부 host alarm

System journal에 time/size/free-space ceiling을 명시하고 application 유입 전 allowlist redaction을 적용한다. Systemd timer가 local state를 평가해 별도 Discord webhook으로 상태 전이를 보내고 Lightsail status-check alarm email이 host failure를 보완한다.

### Option B: WAW journal namespace

WAW service에 전용 journald instance와 별도 retention/access 경계를 둔다. 같은 disk를 쓰지만 용량과 incident purge blast radius를 줄이는 대신 daemon/config/query surface가 늘어난다.

### Option C: CloudWatch Agent 또는 remote journal backend

Operational log와 metric을 off-host backend로 전송해 중앙 retention, search와 alarm을 사용한다. Host 손실 뒤 증거가 강하지만 agent, 비용, network dependency와 Lightsail용 AWS bootstrap credential이 추가된다.

## Decision

첫 MVP는 **Option A: 명시적 persistent system journal + source allowlist redaction + local systemd evaluator/별도 Discord webhook + Lightsail status-check alarm**을 사용한다.

### 보존·접근

- `/etc/systemd/journald.conf.d/60-waw-retention.conf`에 `Storage=persistent`, `Compress=yes`, `SystemMaxUse=1G`, `SystemKeepFree=4G`, `MaxFileSec=1day`, `MaxRetentionSec=30day`를 명시한다.
- Syslog, kmsg, console과 wall forwarding은 끄고 의도하지 않은 복제 surface를 만들지 않는다.
- 1GiB 사용량의 80% 또는 filesystem free 5GiB에서 warning, free 4GiB에서 critical을 발생시킨다. 24시간 projected volume이 약 27MiB/day를 넘으면 source volume 또는 owner-approved cap을 재검토한다.
- Workload user에는 `systemd-journal`, `adm`, `wheel` membership을 주지 않는다. Raw journal은 root의 local runbook에서만 읽고 dashboard나 public API에 직접 노출하지 않는다.
- Journal은 application/DB backup에 포함하지 않는다. Audit·설정 변경·명령 원장은 canonical PostgreSQL에 1년 보존하며 journal copy가 먼저 삭제돼도 감사 성공으로 간주한다.
- FSS verification key나 off-host copy가 없으므로 local journal을 tamper-evident 감사 원장이라고 주장하지 않는다.

### redaction

- Fastify/application logger는 timestamp, correlation ID, event type, normalized route/command, outcome, reason code, duration과 service version의 allowlist만 serialize한다.
- URL/query, headers, body, IP, User-Agent, raw provider response와 untrusted error message는 logger 입력 object에 넣지 않는다. Secret의 hash·prefix도 기록하지 않는다.
- Caddy access log는 첫 MVP에서 비활성화한다. TLS/proxy operational event는 journal에 두고 일반 접근은 Fastify의 normalized event로 기록한다.
- 운영 script는 shell trace, environment dump, verbose HTTP와 credential 내용을 출력하지 않는다.
- 금지값이 journal에 들어가면 emitter 중지, credential revoke/rotation, metadata-only incident audit, fixed synthetic scan, journal rotate/vacuum 순으로 처리한다. journald가 개별 entry 삭제를 지원하지 않아 함께 제거된 operational 범위를 기록한다.

### 경보

- 1분 systemd timer 하나가 `systemctl` state, application health, backup publication marker, public certificate metadata, journal usage와 filesystem free space를 평가한다. Raw log text grep은 canonical health state로 사용하지 않는다.
- Unit failed/inactive와 health `unavailable`은 첫 관측에 firing한다. `degraded`는 5회 연속, recovery는 `healthy` 2회 연속 뒤 전송한다.
- Backup은 20시간에 warning, 24시간에 critical이고 invalid/missing marker는 critical이다.
- Public certificate가 존재할 때 잔여 21일 warning, 14일 critical을 적용한다.
- Journald suppression event는 warning하고 두 evaluation 연속이면 critical로 승격한다.
- 동일 alert key는 상태 전이 때 한 번, 지속 critical은 6시간마다 한 번만 전송하고 recovery도 전송한다.
- Alert payload는 severity, fixed alert key, state, first/last observed UTC, reason code와 service version만 포함하며 `allowed_mentions`를 비운다.
- Discord incoming webhook은 bot token과 분리된 systemd credential로 주입한다. Delivery response를 확인하고 429의 `Retry-After`를 존중해 bounded retry한다.
- Lightsail `StatusCheckFailed` alarm email과 recovery notification이 local evaluator가 실행되지 않는 host/system failure를 담당한다. CPU/burst threshold는 실제 baseline 뒤 별도 조정한다.

이 결정은 production DNS, public certificate issuance, firewall, 실제 webhook 생성 또는 Lightsail alarm 생성을 승인하지 않는다. 각각 PLAN-0003의 명시적 production gate를 거친다.

## Rationale

Option A는 이미 선택한 systemd lifecycle과 `LoadCredential=`를 재사용하고 추가 daemon이나 AWS runtime credential 없이 application·backup·certificate 상태를 한 evaluator에서 확인한다. Discord webhook은 bot Gateway와 독립적이고, Lightsail status-check email은 host가 local message를 전혀 보낼 수 없는 실패를 보완한다.

Namespace는 같은 disk에서 operational complexity만 먼저 늘리고, CloudWatch는 현재 개인 단일 host 요구보다 off-host 기능이 강한 대신 agent·IAM·비용이 추가된다. 감사 원장은 이미 host 밖 PostgreSQL에 있으므로 local operational journal의 host-loss durability를 초기 필수 조건으로 올리지 않는다.

## Consequences

### Positive

- 시간, 용량과 disk 여유를 명시해 platform 기본 retention에 의존하지 않는다.
- Redaction 책임이 각 emitter의 allowlist에 있어 사후 secret scrub이라는 잘못된 안전 가정을 피한다.
- Bot failure와 host failure가 서로 독립된 delivery path를 가진다.
- CloudWatch agent, remote collector와 AWS bootstrap credential을 추가하지 않는다.

### Negative

- Host disk 손실·root compromise 뒤 30일 operational journal을 복구할 수 없다.
- Application allowlist, alert state/dedupe와 webhook delivery code를 작게 유지·시험해야 한다.
- Caddy의 request-level ingress access log를 초기에는 갖지 않는다.
- Size ceiling이 먼저 오면 정상 보존 기간이 30일보다 짧아질 수 있다.

### Risks

- Library나 운영 명령이 allowlist 밖에서 stderr에 secret을 출력할 수 있다.
- Discord 또는 outbound network 장애는 local alert delivery를 막고 delivery failure 자체는 host 밖에 알리지 못할 수 있다.
- 잘못된 certificate/backup marker parser가 false positive 또는 silent stale state를 만들 수 있다.
- `journalctl --vacuum-*`는 unrelated archived log도 삭제할 수 있다.
- Lightsail status check는 application health, backup age와 journal pressure를 직접 관측하지 않는다.

## Validation

- Disposable Ubuntu 24.04의 축소 time/size fixture에서 persistence, rotate/vacuum, capacity ceiling과 reboot 뒤 조회
- Synthetic Fastify/Caddy/systemd event의 allowed field와 forbidden canary journal 전체 부재
- Workload user의 system journal/cross-service read deny와 root runbook read success
- Fake local webhook에서 unit failure, health debounce, backup/certificate/disk threshold, dedupe, recovery, 429와 delivery failure
- Production 크기의 journald drop-in을 `systemd-analyze cat-config`로 read-back하고 1GiB/4GiB/30day 값을 확인
- Same-run unit, drop-in, state, journal fixture와 disposable AWS resource cleanup 및 최종 absence

실제 webhook, production host와 AWS alarm은 이 validation에 사용하지 않는다.

## Rollback or migration

Production 적용 전 기존 effective journald config와 oldest/newest timestamp를 기록한다. 실패하면 monitor timer/service를 disable하고 unit/state file과 webhook credential을 제거하며, journald drop-in을 직전 version으로 복구한 뒤 daemon을 restart하고 effective config를 다시 읽는다. 이미 vacuum된 entry는 복구할 수 없으므로 최초 vacuum은 별도 owner-approved step으로만 실행한다.

Discord webhook을 revoke하고 replacement alert가 확인될 때까지 Lightsail status-check alarm은 유지한다. CloudWatch/remote backend로 이전할 때 source allowlist와 30일 privacy ceiling은 유지하고, dual-write 검증 뒤 local delivery만 제거한다.

## Conditions for reconsideration

- 24시간 projected journal volume이 약 27MiB/day를 지속 초과해 30일/1GiB를 함께 만족하지 못한다.
- Host 손실 뒤 operational evidence, tamper evidence, 중앙 검색 또는 둘 이상의 host 상관 분석이 필수가 된다.
- 금지값 유입이 반복되어 WAW namespace의 purge/access 격리가 운영 비용을 정당화한다.
- Discord webhook 또는 Lightsail email delivery가 반복 실패하거나 별도 on-call channel/SLA가 필요하다.
- Lightsail에서 workload role을 제공하는 compute로 이전해 CloudWatch bootstrap credential 비용이 사라진다.

## Approval

- Owner decision: Approved — local persistent journald 30일/1GiB 보존, source allowlist redaction, 별도 Discord webhook과 Lightsail status-check 경보 계약
- Approved date: 2026-07-23
