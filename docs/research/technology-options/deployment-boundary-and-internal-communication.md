# D-08 배포 경계와 웹-봇 내부 통신 조사

- 조사일: 2026-07-20
- 상태: Research — 기술 또는 아키텍처 결정 아님
- 결정 질문: 정책에 명시된 네 배포 형태 중 어떤 형태가 MacBook 우선 시나리오, `waw.dubeom.com`, 월 신규 지출 30,000원, RPO 24시간과 RTO 8시간을 현실적으로 만족할 수 있으며, 웹과 봇을 분리할 때 어떤 통신 경계가 공개 면적·상호 인증·멱등성·timeout·장애 격리·운영 비용 요구에 가장 잘 맞는가?
- 범위 밖: 인증 기술 선택(D-07), 저장소 제품·데이터 모델 선택(D-05), 봇 호스트와 단일 실행 방식 선택(D-09), 웹 프레임워크 선택(D-10), 백업 제품 선택(D-12), ADR, Spike, 제품 코드

## 1. 연결된 입력과 범위

| 입력 | 이 조사에서 사용하는 의미 |
|---|---|
| `OWN-001` | 운영 기반, 인증·권한, 감사, 기본 대시보드와 요약을 첫 MVP로 비교한다. 몰랭은 후속이다. |
| `OWN-002`, `OWN-013` | 단일 guild와 운영자/관리자 권한을 웹-봇 경계에서도 기본 거부로 유지한다. |
| `OWN-003`, `OWN-010`~`OWN-012` | 요약은 현재 channel/thread의 최대 24시간 전체를 2분 안에 처리하며, 불완전하면 전체 실패하고 원문을 영구 저장하지 않는다. |
| `OWN-004` | 운영 로그 30일과 감사·설정 변경 이력 1년의 수명이 배포 위치와 무관하게 유지되어야 한다. |
| `OWN-005` | 기존 MacBook 상시 실행을 우선 조사하되 확정하지 않는다. 신규 월 지출은 GPT API·필수 외부 백업·도메인 비용을 합쳐 30,000원 이하, RPO 24시간, RTO 8시간이다. |
| `OWN-006`, `OWN-014` | KBO는 허가된 공급 경로가 생길 때까지 연기한다. 활성 배포·통신 용량과 비용에 포함하지 않는다. |
| `OWN-007`, `OWN-008`, `OWN-015` | 후속 몰랭의 외부 관측과 수동 확인은 실패 격리 대상이지만 이번 조사에서 활성 MVP 부하로 가정하지 않는다. |
| `OWN-009` | 웹은 백업·복구 상태와 수동 절차만 표시한다. 실제 복구를 웹에서 실행하지 않는다. |
| `OWN-016`~`OWN-018` | 외부 임대 단일 서버와 소유자가 관리하는 단일 물리 서버를 구분한다. 자가 host는 Mac·Windows로 교체할 수 있고 Windows 노트북을 대체 host 후보로 보유하며, Vercel은 개인·비상업 Hobby 기준으로 조사한다. |
| `OWN-019`~`OWN-021` | 허용된 영구 데이터 전체의 RPO와 전체 서비스 검증 기준 RTO, 일반 변경의 제한된 비동기 처리, canonical 설정과 stale 표시 가능한 heartbeat를 통신 비교 입력으로 사용한다. |
| `OWN-022`~`OWN-025` | 자가 host 장애 중 설정·감사 조회 중단을 허용하고 월 명령 10,000회로 data 경계를 검증한다. PITR은 필수가 아니며 요구 충족 중 관리형 DB 무료 tier를 허용한다. |
| `OWN-026`~`OWN-031` | Discord OAuth만 사용하되 user token은 보존하지 않고 bot-side 역할 조회를 사용한다. 5분 read-only cache, preview 분리와 고위험 15분 recent-auth·현재 역할·명시적 확인을 경계 입력으로 사용한다. |
| `DEP-001` | 운영 대시보드의 유일한 표준 주소는 `https://waw.dubeom.com`이며 HTTPS와 소유권 검증이 필요하다. |
| `DEP-002` | 운영/미리보기의 redirect URI, 쿠키, 비밀과 내부 인증정보를 분리한다. |
| `DEP-003` | 정책의 네 배포 형태를 비용, 운영, 장애 격리, 백업, 보안, 확장성과 종속성으로 비교한다. |
| `INT-001`~`INT-003` | 직접 API, queue, 공유 저장소, 이벤트 동기화를 비교하고 상호 인증·중복 처리·timeout·권한 분리·감사·안전한 실패·최소 공개 면적을 요구한다. |
| `OPS-001`, `OPS-002` | Discord Gateway의 지속 실행·재연결·상태 확인과 봇·스케줄 작업의 단일 활성 실행을 배포 후보가 방해하지 않아야 한다. |

`data-flow-and-threat-model.md`의 논리 경계를 그대로 유지한다. 특히 Discord 원문 수집과 AI 처리는 봇이 Discord 명령에서 직접 시작한다. 관리 웹이 Discord 원문이나 AI 중간물을 봇에 전달하는 경로는 만들지 않는다. 웹-봇 경계에는 설정 명령, 권한 판단에 필요한 최소 식별자, 작업 ID, 상태·결과 코드와 감사 상관관계만 흐를 수 있다.

## 2. 평가 기준과 공통 통신 계약

### 2.1 평가 기준

1. Discord Gateway 연결을 시간 제한 함수가 아닌 지속 프로세스에서 유지하고 비정상 종료 후 재연결할 수 있는가.
2. `waw.dubeom.com`의 HTTPS, 운영/미리보기 분리와 서버 측 권한 확인을 지원하는가.
3. 인터넷에서 직접 도달 가능한 관리 endpoint, 데이터베이스 port와 운영 port를 최소화하는가.
4. 웹·봇 양쪽 신원을 확인하고 각 주체의 권한을 최소화할 수 있는가. 구체 인증 기술은 D-07에 남긴다.
5. 재전송·중복·순서 변경에도 하나의 의도된 변경만 반영하고 감사 기록을 연결할 수 있는가.
6. 호출·작업 deadline 뒤 성공을 가장하지 않고 `unknown` 또는 명시적 실패로 닫히는가.
7. 웹, 봇, 데이터, 집 네트워크와 외부 공급자 장애가 어디까지 전파되는가.
8. RPO 24시간과 RTO 8시간을 백업 존재가 아니라 실제 복원 절차로 검증할 여지가 있는가.
9. GPT API·도메인·외부 백업을 남겨 둔 상태에서 월 30,000원 상한을 지킬 수 있는가.
10. 공급자 교체 시 protocol, schema, 운영 자동화와 데이터 반출의 비용이 어느 정도인가.

### 2.2 방식과 무관한 최소 계약

- 모든 변경 의도에는 전역적으로 안정적인 `operation_id`, actor, 허용 guild, 대상, 생성 시각, 만료 시각, schema version과 상관관계 ID가 필요하다.
- 생성/승인과 실행 결과는 분리한다. timeout은 “실패가 확정됨”이 아니라 “결과 미확인”일 수 있으므로 동일 `operation_id` 조회 또는 재시도가 가능해야 한다.
- 중복 방지는 transport의 “정확히 한 번” 주장에 맡기지 않고 영구 결과 또는 조건부 상태 전이로 검증한다. Discord interaction ID처럼 원천의 안정 ID가 있으면 포함한다.
- 권한은 브라우저 판단을 신뢰하지 않는다. bot-side 현재 역할 조회를 사용하며 최대 5분 cache는 read-only에만 유효하다. 변경 조회 실패는 거부하고 고위험 작업은 15분 이내 로그인·현재 역할·명시적 확인을 모두 요구한다.
- 내부 요청 body, queue/event payload, 저장소 행과 로그에 Discord 원문, OAuth code, token, session identifier 또는 비밀을 넣지 않는다.
- 웹이 봇 상태를 읽지 못하면 최근 성공 상태를 현재 상태처럼 표시하지 않고 `stale/unknown`과 마지막 관측 시각을 표시한다.
- 설정 변경이 안전하게 전달되지 않았으면 적용 완료로 응답하지 않는다. 비동기 접수라면 `accepted`와 `applied`를 명확히 구분한다.
- 정책과 D-03이 모든 명령 attempt를 실행 전 기록하도록 요구하므로 감사 저장에 실패한 변경 요청은 실행·전달하지 않고 전체 거부한다. attempt 기록 뒤 비접수·미적용이 확정되면 같은 `operation_id`에 terminal failure를 연결한다. timeout처럼 전달 결과가 불명확하면 `unknown/pending reconciliation`으로 두고, 재시도도 새 attempt로 감사하되 기존 적용 결과를 먼저 조회한다.
- 감사 저장과 transport publish/apply가 하나의 원자 transaction이 아닐 수 있다. orphan attempt, 결과 없는 접수와 적용 뒤 outcome 기록 실패를 찾아 재조정하는 책임은 통신 방식 비교에서 제외할 수 없다.
- 웹에서 실제 백업·복구를 호출하는 command는 만들지 않는다(`OWN-009`).

## 3. 확인된 공식 사실

### 3.1 Vercel과 `waw.dubeom.com`

- Vercel은 custom domain의 DNS 검증 뒤 SSL 인증서를 자동 발급한다. 따라서 형태 2·3에서 `waw.dubeom.com`의 소유권 검증과 HTTPS를 지원할 수 있다. 이는 OAuth·세션 구성이 안전하다는 뜻은 아니며 그 판단은 D-07 범위다. [Vercel custom domain](https://vercel.com/docs/domains/set-up-custom-domain), [Vercel SSL](https://vercel.com/docs/domains/working-with-ssl)
- Vercel Functions는 WebSocket server로 동작하는 것을 지원하지 않으며 실행 최대 시간이 있다. 2025-12-18 문서 기준 Fluid Compute의 최대 실행 시간은 Hobby 300초, Pro 800초다. 따라서 Discord Gateway의 상시 연결을 Vercel Function에 두는 것은 `OPS-001`의 후보가 아니다. [Vercel limits](https://vercel.com/docs/limits), [Functions limits](https://vercel.com/docs/functions/limitations)
- Vercel의 일반 outbound 주소는 동적이다. 고정 outbound IP는 Pro add-on, 격리 private network인 Secure Compute는 현재 Enterprise 기능으로 문서화되어 있다. IP allowlist만으로 Vercel→Mac 직접 API를 제한하려면 추가 유료 기능 또는 별도 중계 계층이 필요하고, 고정 IP 자체도 상호 인증을 대신하지 않는다. [Vercel fixed IP 안내](https://vercel.com/kb/guide/can-i-get-a-fixed-ip-address), [Secure Compute](https://vercel.com/changelog/secure-compute-is-now-self-serve)
- 2026-07-20 공개 가격은 Hobby $0/월, Pro $20/월이며 Hobby는 개인·비상업 용도라고 명시되어 있다. Pro 기본료만으로도 환율에 따라 30,000원의 대부분을 사용하므로 GPT API·도메인·외부 백업을 포함한 상한 충족을 자동으로 가정할 수 없다. [Vercel pricing](https://vercel.com/pricing)

### 3.2 MacBook 지속 운영과 복구

- Apple은 macOS background service에 `launchd` 사용을 권하고 `KeepAlive`로 계속 실행되는 job을 표현할 수 있다고 문서화한다. 시스템 daemon은 사용자가 로그인하지 않아도 실행되지만 user agent는 로그인 session에 종속된다. 이는 재시작 수단일 뿐 Discord 재연결, 단일 활성 실행과 application health를 자동 보장하지 않는다. [Apple launchd job](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html), [daemon 설계](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/DesigningDaemons.html)
- Mac 노트북에는 “Wake for network access” 설정이 있지만, Apple 문서는 이를 24시간 server 가용성 보장으로 설명하지 않는다. 절전, 덮개, 전원, OS update, 가정용 회선·공유기와 물리 접근 부재는 별도로 검증해야 한다. [Apple sleep/wake 안내](https://support.apple.com/guide/mac-help/if-your-mac-sleeps-or-wakes-unexpectedly-mchlp2995/mac)
- Time Machine은 최근 24시간의 hourly backup과 이전 기간의 daily/weekly backup을 만들 수 있고 암호화 backup을 지원한다. Apple도 내부 disk와 다른 위치를 권한다. 같은 Mac 옆 USB disk만으로는 도난·화재·전원 사고가 분리되지 않으므로 `OWN-005`의 “필수 외부 백업”을 충족했다고 볼 수 없다. [Apple Time Machine](https://support.apple.com/en-us/104984), [외부 위치 권고](https://support.apple.com/guide/mac-help/back-up-files-mh35860/mac)

### 3.3 통신 방식의 전달 특성

- HTTP에서 PUT, DELETE와 safe method는 의미상 idempotent지만 POST 기반 관리 action이 자동으로 멱등인 것은 아니다. transport timeout 뒤 실제 반영 여부도 HTTP 의미만으로 결정되지 않는다. application `operation_id`와 결과 조회가 필요하다는 결론은 이 사실에서 한 추론이다. [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)
- 관리형 queue의 대표 공식 사례인 Cloudflare Queues는 기본적으로 at-least-once이며 드물게 같은 message가 여러 번 전달될 수 있어 unique ID 기반 deduplication을 권한다. 외부 infrastructure는 HTTP pull consumer가 될 수 있다. Free plan은 하루 10,000 operations와 고정 24시간 retention, Paid는 월 1,000,000 operations 포함 뒤 $0.40/백만 operations이고 일반적으로 한 message 전달에 write/read/delete 3 operations가 든다. [delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [pull consumer](https://developers.cloudflare.com/queues/), [pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- PostgreSQL 같은 관계형 공유 저장소는 transaction과 row/advisory lock으로 조건부 상태 전이를 구성할 수 있다. 다만 advisory lock은 application이 일관되게 사용해야 하며 serializable transaction도 serialization failure 재시도가 필요하다. 즉 “공유 DB” 자체가 단일 실행이나 exactly-once를 자동 보장하지 않는다. [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- event bus의 대표 공식 사례인 Amazon EventBridge는 target 장애 시 기본 24시간·최대 185회 retry하지만 최종 실패 뒤 DLQ가 없으면 event를 버린다. 같은 rule/target이 드물게 두 번 실행될 수 있다. event fan-out과 replay는 편리하지만 command 완료 확인과 deduplication을 별도로 설계해야 한다. custom event 공개 가격 예시는 64KB 이하 백만 건당 $1이다. [retry policy](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [중복·유실 안내](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-troubleshooting.html), [pricing](https://aws.amazon.com/eventbridge/pricing/)
- 공개 ingress를 줄이는 대표 수단으로 Cloudflare Tunnel은 origin에서 outbound-only 연결을 만들고 inbound firewall port 없이 서비스를 연결한다. Access service token은 machine-to-machine credential을 제공한다. 이는 가능한 후보의 증거일 뿐, 해당 token이나 tunnel을 D-07/D-08의 선택으로 확정하지 않는다. [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/), [service token](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

## 4. 정책의 네 배포 형태 비교

정책의 1번 “하나의 지속 서버”는 외부 사업자에게 임대한 단일 서버, 4번 “모두 자체 호스팅”은 소유자가 직접 관리하는 단일 물리 서버로 구분한다(`OWN-016`). 형태 4는 MacBook으로 고정하지 않으며 Windows 등 다른 소유 장비로 교체할 수 있다.

| 형태 | 공개 면적·보안 | 장애 격리·복구 | 운영·비용 | 확장·종속성 | 판정 |
|---|---|---|---|---|---|
| 1. 봇·웹·데이터를 하나의 지속 서버 | `waw.dubeom.com`용 443만 공개하고 DB를 loopback/private socket으로 제한 가능하다. 웹 침해가 봇 token·DB에 가까워 blast radius가 가장 크므로 process user·secret·DB 권한 분리가 필수다. 내부 network 상호 인증은 줄지만 browser→web 인증은 그대로 필요하다. | 서버·disk·배포 한 번이 전체 장애가 된다. 외부 암호화 backup과 빈 host 복원 절차가 있으면 24h/8h를 목표로 할 수 있지만 자동 충족하지 않는다. | 구성요소와 호출 경계가 가장 적다. 저가 VM과 daily image backup의 공식 가격 사례는 있지만 최소 plan이 실제 memory·지역·IPv4·transfer 요구를 충족하는지와 별도 backup·domain·AI를 합친 총액은 미확인이다. | 수직 확장이 먼저이며 한 host schema/운영에 묶인다. 표준 VM·DB dump를 쓰면 특정 serverless 결합은 적다. | 비용과 단순성의 강한 대안이지만 예산 여유는 실측 전 확정할 수 없다. 단일 장애·침해 경계가 약점이다. |
| 2. 웹 Vercel, 봇·데이터 지속 서버 | 공개 웹은 Vercel이 맡지만 웹→봇 API 또는 DB 접속 경계가 추가된다. Mac을 지속 서버로 쓰면 직접 API를 공개하지 않는 pull 방식이나 outbound tunnel 후보가 공개 면적상 유리하다. | 웹 배포 장애와 bot process 장애는 분리되지만 Mac·DB는 함께 실패한다. 웹이 살아 있어도 stale 상태만 표시해야 한다. Mac 외부 backup과 대체 host 복원 없이는 8h RTO가 불확실하다. | Vercel Hobby가 허용되는 개인·비상업 조건이면 고정비를 낮출 수 있다. Pro $20이면 총 30,000원 상한 여유가 거의 없어진다. Vercel·Mac·경계 중계 세 운영면이 생긴다. | 웹 독립 배포는 쉽지만 Vercel runtime/network 제약과 중계 공급자 종속이 생길 수 있다. DB는 bot host 용량에 묶인다. | Mac 우선 시나리오에서 가장 먼저 비용·가용성을 검증할 분리 후보다. 확정안은 아니다. |
| 3. 웹 Vercel, 봇 지속 host, 데이터 관리형 | web과 bot이 같은 관리형 DB를 사용하면 별도 bot API를 없앨 수 있지만 DB가 양쪽 trust domain의 공용 경계가 된다. DB의 인터넷 도달 여부는 공급자와 network option에 따라 다르며, 어느 경우든 credential 분리와 row/table 권한이 핵심이다. queue/event를 더하면 공급자 경계가 추가된다. | Mac host·disk 장애에서 데이터를 분리할 수 있지만 DB·관리 plane·credential 장애는 web과 bot에 함께 전파된다. 관리형 restore window가 RPO를 돕더라도 독립 backup·실제 restore로 8h RTO를 증명해야 한다. | 관리형 DB 대표 가격은 Free $0 또는 간헐적 1GB 기준 약 $15/월이며 paid restore window는 최대 7일인 사례가 있다. Vercel Pro와 함께 쓰면 AI·domain 전에도 예산을 넘길 가능성이 높다. 무료 tier의 6시간 restore history·0.5GB 같은 제한은 운영 요구에 충분하다고 가정할 수 없다. | 구성요소별 확장 여지는 크지만 Vercel+host+DB(+queue/event)의 schema, billing, credential과 공급자 종속이 가장 많다. | host/disk 복구 격리는 강하지만 공통 DB 장애, 30,000원 상한과 운영 복잡성이 차단 조건이다. |
| 4. 모든 구성요소 자체 호스팅 | 단일 소유 장비에서 web을 공개하면 가정망 origin과 관리 plane이 인터넷에 노출될 수 있다. reverse tunnel로 inbound port를 닫을 후보는 있지만 tunnel endpoint 자체에는 엄격한 인증·rate limit이 필요하다. | 전원·절전·회선·공유기·host·disk가 공통 장애 영역이다. 소유자가 8시간 안에 물리 접근하지 못하면 RTO 달성이 어렵다. 외부 backup과 대체 장비/복원 절차가 필수다. | 기존 장비와 통상 전기료를 제외하므로 직접 비용은 가장 낮을 수 있으나 OS patch, TLS/tunnel, 모니터링, backup, 원격 복구를 모두 운영한다. 숨은 인적 비용이 가장 크다. | 용량과 uplink가 한정되고 환경 재현성이 낮다. 반면 data와 runtime의 SaaS 종속은 가장 작다. | 조사 기준선으로 유지하되 무인 지속성·8h 복구의 증거 없이는 운영 후보로 승격할 수 없다. |

비용에 사용한 대표 공식 자료는 공급자 선택이 아니라 규모 감각을 위한 사례다. DigitalOcean은 Droplet을 VM으로 설명하고 daily backup을 월 VM 비용의 30%로 제시하며, $4 plan은 2022년 공식 발표 사례이므로 현재 실제 후보 가격은 ADR 직전 다시 확인해야 한다. Neon의 현재 공개 가격은 Free $0, 간헐 부하 1GB의 Launch 예시 약 $15/월, paid restore window 최대 7일이다. 실제 후보 지역·세금·환율·traffic과 GPT 비용은 별도 비용표에서 다시 측정해야 한다. [DigitalOcean Droplet](https://docs.digitalocean.com/products/droplets/details/pricing/), [2022년 $4 plan 발표](https://www.digitalocean.com/blog/new-4-dollar-droplet-updated-pricing), [backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Neon pricing](https://neon.com/pricing)

### 4.1 마이그레이션과 롤백 영향

| 형태 | 마이그레이션 | 배포 롤백 |
|---|---|---|
| 1. 단일 지속 서버 | 한 host image와 DB export로 이동 경로는 단순하지만 중단 없이 이전하기 어렵고 DNS·secret·backup destination을 함께 바꿔야 한다. | 같은 host의 이전 application version으로 되돌릴 수 있으나 incompatible schema 변경은 전체 서비스를 동시에 막는다. |
| 2. Vercel + bot·data host | web과 bot을 독립 이전할 수 있지만 양쪽 contract version 호환 기간이 필요하다. data host 이전 중 web에는 stale/maintenance 상태가 필요하다. | Vercel web rollback과 bot rollback이 별개이므로 구·신 contract를 동시에 허용해야 하며 DB rollback은 별도다. |
| 3. Vercel + bot host + 관리형 data | host 교체는 data 이전 없이 가능하지만 DB 공급자 이동은 export/import, credential, network와 restore 절차를 모두 바꾼다. | web·bot은 독립 rollback 가능하지만 schema와 event/queue consumer version 불일치가 가장 복잡하다. |
| 4. 전체 자체 호스팅 | 대체 장비로 OS·runtime·data·DNS/tunnel·secret을 함께 재현해야 하므로 자동화가 없으면 8시간 RTO에 가장 민감하다. | 로컬 artifact와 DB backup이 모두 남아 있어야 하며, 장비 장애와 rollback 실패가 같은 물리 경계에 놓인다. |

어떤 형태에서도 application rollback과 data restore를 같은 것으로 취급하지 않는다. 구체 schema 호환·backup 제품·절차는 D-05/D-12, 배포 artifact와 판단 조건은 후속 계획에서 정한다.

## 5. 웹-봇 내부 통신 방식 비교

여기서 “상호 인증”은 직접 API라면 웹과 봇이 상대 workload identity와 허용 권한을 검증하고, broker·공유 DB·event 방식이라면 각 workload와 중계자가 서로의 identity와 권한을 검증한다는 최소 요구다. D-07은 browser session과 workload credential을 분리하고 환경별 최소 권한·rotation·revoke를 요구한다. 중계자 ACL과 payload 검증의 구체 조합, mTLS·서명 token·service identity proxy 등 수단은 D-05·D-08 경계가 정해지기 전 선택하지 않는다.

| 방식 | 공개 면적·상호 인증 | 멱등성·timeout | 장애 격리 | 운영 비용·적합성 |
|---|---|---|---|---|
| 직접 관리 API | Mac/host의 좁은 HTTPS endpoint가 Vercel에서 도달 가능해야 한다. public origin이면 공격 면적이 가장 직접적이다. outbound tunnel/proxy는 origin port를 닫을 수 있지만 제3자 경계와 credential이 추가된다. 양방향 호출이 필요 없다면 봇→웹 callback을 만들지 않고 한 방향으로 제한한다. | 동기 응답이 명확하나 client timeout 뒤 server 반영 여부가 불명확하다. 모든 변경 POST에 `operation_id`, 만료, 조건부 전이와 상태 조회가 필요하다. 긴 작업을 HTTP 연결 수명에 묶지 않는다. | bot/Mac offline이 웹 변경 요청에 즉시 드러나므로 안전하게 실패하기 쉽다. 반면 느린 bot이 Vercel function duration과 connection pool을 소모할 수 있어 짧은 connect/read deadline과 circuit breaker가 필요하다. | component는 적지만 TLS endpoint, ingress 보호, credential rotation, rate limit, audit와 health를 직접 운영한다. 즉시 적용이 꼭 필요한 소수 관리 command에 강하다. |
| 관리형 queue | 웹은 provider에 publish하고 bot은 outbound pull할 수 있어 Mac inbound port가 0이 될 수 있다. web·bot은 queue의 producer/consumer 권한을 각각 최소화해야 하며 provider identity와 client identity를 모두 검증한다. | at-least-once를 전제로 `operation_id` dedupe가 필수다. publish timeout도 접수 여부가 불명확할 수 있어 동일 ID 재시도가 필요하다. message TTL은 명령 만료와 같거나 더 엄격해야 하고 DLQ/poison message 절차가 필요하다. | Mac offline 동안 제한적으로 buffer하여 웹과 봇을 격리한다. 하지만 오래된 설정 command가 복구 뒤 적용되면 위험하므로 만료·현재 version 검사가 필요하다. queue 장애 시 새 변경은 `accepted`로 가장하지 않는다. | 낮은 사용량은 무료/소액 사례가 있으나 provider, consumer loop, DLQ, redrive와 관측 운영이 추가된다. 원문을 넣지 않고 작은 control command에만 사용해야 한다. 비동기 설정·작업 접수에 강하다. |
| 공유 저장소(DB inbox/outbox 포함) | 별도 bot API는 없지만 web과 bot 모두 선택한 DB network 경계에 접근한다. 각 workload를 별도 credential·최소 table/action 권한으로 분리해야 한다. 인터넷 도달 endpoint인지 private connectivity인지와 network 제한 비용은 공급자별로 다르다. | unique `operation_id`, transaction, conditional update와 lease로 접수·적용을 원자화할 수 있다. query/lock timeout과 lease 만료를 구분하고 serializable abort를 재시도해야 한다. | bot offline이어도 설정의 canonical state는 보존된다. 그러나 잘못된 web query, schema migration, DB 장애가 web과 bot에 동시에 전파되는 공통 장애점이다. DB를 queue처럼 polling하면 connection·contention도 관측해야 한다. | 이미 필요한 영구 저장소를 재사용하면 별도 broker 비용은 줄지만 D-05 선택을 선행할 수 없다. 권한, migration, polling/notification, cleanup 책임이 커진다. 설정·상태의 단일 원천에 강하다. |
| 이벤트 동기화(pub/sub·webhook) | event bus가 web/bot 사이의 공개 endpoint를 중계할 수 있으나 push target이면 bot endpoint가 다시 필요하다. outbound pull/subscription이면 공개 면적을 줄일 수 있다. publisher, topic, subscriber와 replay 권한을 각각 분리한다. | event ID dedupe와 entity version/order 검사가 필수다. retry window가 지나면 DLQ 없이 유실될 수 있고 순서가 바뀔 수 있다. “설정이 변경됨” event는 command 승인/완료를 대신하지 않는다. | fan-out과 producer/consumer 격리는 가장 좋다. 반대로 dual-write와 eventual consistency 때문에 dashboard와 bot view가 어긋날 수 있으며 replay가 오래된 상태를 되살릴 수 있다. | schema registry/version, subscription, DLQ, replay, 관측까지 네 방식 중 운영 개념이 가장 많다. 첫 MVP의 단일 web·단일 bot에는 이점보다 복잡성이 클 가능성이 높고 후속 다수 consumer가 생길 때 강하다. |

### 5.1 요청 종류별 적합성

| 요청 | 안전한 기본 의미 | 직접 API | Queue | 공유 저장소 | Event |
|---|---|---:|---:|---:|---:|
| bot 현재 health 조회 | 짧은 deadline 안의 live 응답 또는 `unknown` | 강함 | 약함 | heartbeat가 stale일 수 있음 | 마지막 event가 stale일 수 있음 |
| 일반 설정 변경 | 권한 확인 뒤 한 번만 반영, 적용 version 확인 | 가능 | 강함 | 강함 | event 단독은 부적합 |
| 관리자 역할/고위험 변경 | 현재 역할 재검증, 명시적 적용 확인 | 가능하나 D-07 필요 | 지연·만료 통제 필요 | 조건부 전이에 유리 | event 단독은 부적합 |
| 감사·상관관계 | attempt와 outcome을 보존하되 secret·session ID 제외 | 양쪽 log 결합 필요 | operation ID로 결합 | 한 transaction에 유리 | event ID로 결합 |
| Discord 요약 원문/AI 중간물 | 웹-봇 경계를 통과하지 않음 | 금지 | 금지 | 영구 저장 금지 | 금지 |
| 백업·복구 실행 | 웹은 상태/절차만 표시 | 금지 | 금지 | 상태 read만 | 상태 알림만 |

## 6. MacBook 우선 조합의 구체적 실패 시나리오

MacBook을 형태 2의 bot+data host로 두는 경우를 우선 조사 시나리오로 연결하면 다음 안전 조건이 필요하다. 이는 배포 선택이 아니다.

| 사건 | 사용자에게 보여 줄 상태 | 금지되는 동작 | 복구·관측 조건 |
|---|---|---|---|
| Mac 절전·덮개·전원 단절 | bot과 live health `unavailable/unknown`; 마지막 관측 시각 표시 | cached health를 정상으로 표시, 웹에서 설정 적용 완료 표시 | 전원·절전 방지 검증, launchd 재기동, Gateway Ready/heartbeat 관측 |
| 가정용 회선 또는 tunnel 장애 | 내부 통신 불가를 외부 공급자 장애와 구분 | 무기한 HTTP 대기, 인증 우회 endpoint 개방 | 짧은 timeout, 제한된 retry, 경계별 health와 경보 |
| 웹 deploy 중 중복 요청 | 동일 `operation_id` 결과 반환 | 새 ID로 자동 재발행해 설정을 두 번 적용 | unique/conditional transition과 attempt audit |
| bot 재시작 중 queue backlog | 만료되지 않은 작업만 순서/version 검사 후 처리 | 오래된 role·설정 command를 현재 권한 확인 없이 실행 | TTL, actor/guild 재검증, DLQ·수동 폐기 절차 |
| Mac disk 손실 | 웹은 복구 필요·마지막 backup 시각 표시 | 같은 disk snapshot을 독립 backup으로 주장 | 24시간 이내 외부 암호화 backup, 새 host에서 8시간 내 복원 리허설 |
| 중복 bot process | 한 process만 Gateway owner/스케줄 executor | downstream dedupe만 믿고 두 process 유지 | D-09에서 lease/host supervisor를 검증; 이번 문서에서는 선택하지 않음 |

RPO 24시간은 “하루마다 backup job을 실행”이 아니라 복구 가능한 외부 copy의 가장 오래된 허용 손실로 측정한다. RTO 8시간은 Mac 수리 시간이 아니라 장애 선언부터 대체 환경에서 bot·web·data 검증이 끝날 때까지다. MacBook 외부에 backup을 두고도 대체 host, DNS/tunnel 변경 권한, secret 복원 방식과 담당자 접근 가능성이 없으면 RTO는 미확인이다.

## 7. 비용 판정

현재 입력에는 월 사용자 수, 관리 변경 수, DB 크기, backup 크기, GPT 요청량과 원/달러 환율이 없다. 따라서 30,000원 준수 여부를 단일 숫자로 확정하지 않는다.

| 비용 묶음 | 형태 1 | 형태 2 | 형태 3 | 형태 4 |
|---|---:|---:|---:|---:|
| web/compute 고정비 | 소형 VM 예시 $4+ | Vercel $0 또는 $20 + Mac | Vercel $0/$20 + bot host | 기존 Mac 비용 제외 |
| data | VM/Mac에 포함 | 지속 host에 포함 | 관리형 $0 또는 사용량 기반 예시 약 $15 | Mac에 포함 |
| 통신 경계 | process/local network | API tunnel 또는 queue 비용 가능 | DB/queue/event transfer 가능 | tunnel/DNS 비용 가능 |
| 필수 별도 비용 | 외부 backup, domain, GPT | 외부 backup, domain, GPT | 독립 backup, domain, GPT | 외부 backup, domain, GPT |

추론:

- 형태 1과 4는 현금 비용 여유가 가장 크지만 단일 장애 영역과 운영 노동을 비용 밖으로 숨긴다.
- 형태 2는 Hobby 이용 조건이 맞고 저사용량 통신 경계를 쓰는 동안 30,000원 후보가 될 수 있다. 상업/팀 운영으로 Pro가 필요하면 환율·세금·GPT·backup 때문에 소유자 상한 변경 없이 성립하지 않을 가능성이 높다.
- 형태 3은 무료 tier에 의존하지 않으면 Vercel Pro+관리형 DB만으로 상한을 넘길 가능성이 있다. 무료 tier는 SLA, restore window, network restriction과 용량을 운영 요구와 별도로 검증해야 한다.
- queue/event의 건당 비용은 이 프로젝트 예상량에서는 작을 수 있지만, broker를 추가하는 인적 운영 비용과 provider 장애 경계가 더 큰 차이다.

## 8. 가정, 미확인 사항과 필요한 검증

### 가정

- 프로젝트는 당분간 단일 guild, 단일 web deployment와 단일 active bot으로 운영한다.
- 기존 `dubeom.com` 소유 비용 중 이 프로젝트가 부담할 증분 비용은 아직 산정되지 않았다.
- 첫 MVP의 웹-봇 traffic은 설정·상태·감사 control data이며 Discord 원문과 AI payload가 아니다.
- 정책의 “지속 서버”와 “자체 호스팅”은 각각 외부 임대 단일 서버와 소유자가 관리하는 단일 물리 서버를 뜻한다. 자가 host의 운영체제와 장비는 고정하지 않는다.

### 미확인·차단 항목

1. 자가 host와 대체 Windows 노트북의 사양, 전원·network, 무인 실행, OS update/reboot, 환경 재현과 실제 복원 시간.
2. 월 GPT budget, domain 증분 비용, 월 명령 10,000회의 실제 DB/backup 크기와 내부 작업량. 이것 없이는 형태별 30,000원 합계 판정이 불가능하다.
3. D-05 후보 중 어느 저장소가 web과 bot의 동시 접근, 조건부 전이, credential 분리와 외부 backup을 요구 비용 안에서 검증할지는 미확정이다.
4. browser session과 workload credential 분리, credential rotation/revoke, workload별 최소 권한과 운영/미리보기 분리는 확정됐다. 구체 workload 인증 수단은 D-05·D-08 경계와 함께 검증해야 한다.

### 확정된 사용자 결정

| ID | 결정 | 연결된 소유자 결정 |
|---|---|---|
| `D08-Q01` | 형태 1은 외부 임대 단일 서버, 형태 4는 OS 비종속의 소유 단일 물리 서버로 구분한다. | `OWN-016` |
| `D08-Q02` | 개인·비상업 운영이므로 Vercel Hobby를 비용 기준으로 사용한다. | `OWN-017` |
| `D08-Q03` | 8시간 내 직접 대응할 수 있고 Windows 노트북을 대체 host 후보로 보유한다. | `OWN-018` |
| `D08-Q04` | 허용된 영구 데이터 전체를 보호하고 봇·웹·데이터 검증 완료를 RTO 완료로 본다. | `OWN-019` |
| `D08-Q05` | 일반 변경은 5분 내 비동기 적용·10분 후 만료, 고위험 변경은 즉시 확인 실패 시 거부하며 결과·dedupe 기록은 1년 보존한다. | `OWN-020` |
| `D08-Q06` | live control·즉시 조회 없이 canonical 설정과 stale 표시 가능한 heartbeat를 사용한다. | `OWN-021` |

### 후속 Spike 후보 — 이번 작업에서는 실행·작성하지 않음

- Mac 재부팅·로그아웃·절전·회선 단절 뒤 launchd와 Discord Gateway가 단일 process로 복구되는 시간 측정
- `waw.dubeom.com` web에서 공개 origin 없이 Mac의 최소 control boundary를 호출하거나 pull하는 왕복·timeout 검증
- 같은 `operation_id`의 publish/call/DB transition을 중복·순서 역전·consumer crash 조건에서 반복하는 장애 주입
- 외부 backup으로 빈 대체 host를 구성해 RPO와 8시간 RTO를 실제 측정
- 예상 월간 설정 변경·health read·감사량과 GPT usage를 넣은 원화 비용표

## 9. 잠정 권고와 가장 강한 대안

### 잠정 권고 — 후속 연구 전 검증 순서

자가 호스트 우선 정책을 존중해 **형태 2(Vercel 웹 + 소유 단일 서버의 봇·데이터)**를 첫 검증 대상으로 두되 배포 기술로 확정하지 않는다. 웹-봇 경계는 Discord 원문이 없는 좁은 control plane으로 제한하고, 자가 host에 public inbound port를 직접 열지 않는 **outbound pull queue 또는 이미 필요한 공유 저장소의 versioned inbox/state**를 우선 비교한다. live control과 즉시 상태 조회는 요구하지 않으며 canonical 설정과 stale 표시 가능한 heartbeat로 충분한지 검증한다.

이 잠정 방향은 인증 기술을 고르지 않는다. 어떤 방식이든 양 workload 신원 확인, 최소 권한, credential 폐기·교체와 환경 분리를 지켜야 한다. 공유 저장소 사용 여부와 구체 workload 인증 수단은 D-05·D-08 통합 검토 전 확정하지 않는다.

### 가장 강한 대안

**형태 1의 소형 지속 VM 단일 배포**가 가장 강한 대안이다. 공개 endpoint를 `waw.dubeom.com:443` 하나로 줄이고 내부 통신 broker를 없애며 저가 고정비 후보를 비교할 수 있다. 실제 plan 용량과 GPT·domain·외부 backup을 합친 30,000원 충족 여부는 미확인이다. Mac 전원·회선·물리 접근 위험도 줄이는 대신 web 침해가 bot secret과 data에 미치는 blast radius, 단일 host 장애와 외부 backup 복원은 형태 2보다 엄격히 검증해야 한다.

### 주요 위험

- MacBook의 상시성·물리 접근을 검증하지 않고 기존 장비라는 이유만으로 8시간 RTO를 주장할 위험
- queue/event retry 또는 HTTP timeout을 exactly-once로 오해해 설정·고위험 작업을 중복 적용할 위험
- 공유 DB가 endpoint 수를 줄인다는 이유로 web과 bot에 같은 광범위 credential을 부여할 위험
- Vercel Hobby 또는 무료 DB tier의 용도·복구·network 제한을 운영 보장으로 오해할 위험
- 중계 tunnel·queue가 origin 공개를 줄여도 새로운 관리 plane, secret과 공급자 장애를 만든다는 점을 누락할 위험
- 웹 상태 cache가 Mac·bot 장애 중에도 정상처럼 보이는 위험

### 권고를 뒤집는 조건

- Mac 절전·재부팅·회선 또는 물리 접근 시험에서 RTO 8시간을 반복해 달성하지 못함
- Vercel 유료 plan과 필요한 통신/backup을 포함한 총액이 GPT 예산을 침해하거나 30,000원을 초과함
- D-05 연구에서 관리형 저장소가 예산 안에서 외부 backup·조건부 전이·권한 분리를 크게 단순화함
- 보안 검토에서 Vercel→Mac 경계를 필요한 수준으로 좁히려면 예산 밖의 network/auth 기능이 필요함
- 후속 제품 요구에서 live bot control이나 즉시 상태 조회가 필수가 됨
- 단일 VM이 외부 backup 복원 포함 RPO/RTO와 blast-radius 통제를 더 낮은 총비용으로 입증함

## 10. 정확한 다음 프롬프트

```text
AGENTS.md의 필수 문서를 읽고
docs/prompts/research.md 절차에 따라 D-05 영구 저장소 후보를 조사해.
OWN-016~OWN-021과 D-03·D-08의 경계를 입력으로 사용하되
아직 저장소·배포·통신·인증 기술을 선택하거나 D-07, ADR, Spike, 구현 계획 또는 제품 코드를 작성하지 마.
KBO는 연기 상태로 유지해.
```
