# D-05·D-07·D-08 경계 통합 검토

- 검토일: 2026-07-20
- 상태: Research integration — 기술 선택 또는 Spike 승인 아님
- 질문: `OWN-016`~`OWN-034`를 함께 적용할 때 저장소, 배포, 내부 통신, 사용자 인증과 workload 인증 사이에 어떤 충돌·증거 공백이 남는가?
- 범위 밖: 저장소·배포·통신·인증 기술 선택, 제품·공급자 순위 확정, ADR, Spike 실행·작성, 구현 계획과 제품 코드

## 1. 검토 입력

- 요구사항: `DAT-001`~`DAT-005`, `OPS-005`~`OPS-008`, `DEP-001`~`DEP-003`, `INT-001`~`INT-003`, `SEC-001`~`SEC-009`
- 소유자 결정: `OWN-016`~`OWN-034`
- 연구: `persistent-storage-options.md`, `auth-authorization-session-options.md`, `deployment-boundary-and-internal-communication.md`, `data-flow-and-threat-model.md`

새 제품 사실이나 공급자 주장을 추가하지 않았다. 아래 내용은 위 문서가 공식·1차 자료로 확인한 사실과 확정된 소유자 결정을 결합한 추론이다.

## 2. 통합 결과

### 직접 충돌

현재 정책과 `OWN-016`~`OWN-034` 사이에 직접적인 충돌은 없다. `OWN-034`로 첫 MVP의 web→bot network 경계는 제거됐지만 다음 결합 제약 때문에 D-05, D-07과 host 결정을 서로 독립적으로 선택할 수 없다.

| 결합 지점 | 통합 제약 | 영향 |
|---|---|---|
| bot-side 역할 조회 | Discord user token을 보존하지 않으므로 로그인, mutation과 고위험 작업에서 bot-side 현재 member 조회가 필요하다. | 같은 server의 local process/module 경계로 제한하며 public web→bot network endpoint는 만들지 않는다. |
| server-side session | 1일 유휴·7일 절대 만료, logout·권한 상실 폐기는 web 요청마다 접근 가능한 session state를 요구한다. | 같은 host의 local store도 가능하며 별도 session service는 필수가 아니다. process 권한과 원자적 폐기는 남는다. |
| 역할 cache와 장애 | 최대 5분의 유효 cache는 read-only에만 쓸 수 있고, 만료 뒤 조회도 `unavailable`이다. mutation과 고위험 작업은 Discord 또는 내부 조회 실패 시 거부한다. | queue의 지연 응답이나 오래된 DB snapshot은 현재 인가 증거가 될 수 없다. |
| 고위험 변경 | 15분 이내 로그인·현재 역할·명시적 확인과 즉시 적용 확인을 모두 요구한다. | 비동기 queue/event 단독 경로는 부적합하다. 짧은 동기 확인 경로 또는 동등하게 즉시 결과를 확인하는 경계가 필요하다. |
| 자가 host 장애 | 설정·감사 조회와 변경 중단을 허용하고 상태는 관측 시각과 함께 `unavailable`로 표시할 수 있다. | 관리형 저장소의 장애 격리는 장점이지만 dashboard 가용성을 위해 반드시 필요하다는 근거는 아니다. |
| 환경 분리 | 임의 preview의 로그인·변경은 꺼지고 고정 preview만 별도 credential을 쓴다. | arbitrary preview를 위한 DB branch, OAuth app, bot credential과 통신 경계를 기본 구성으로 만들 필요가 없다. |

### 후보 조합별 남는 경계

| 조합 범주 | 없어지는 것 | 반드시 남는 것 | 현재 판단 |
|---|---|---|---|
| Vercel web + 자가 bot·SQLite | 별도 DB service | web→host session·role·설정/감사 경계, 외부 backup | 구성요소는 적지만 모든 dashboard 기능이 자가 host와 통신 경계에 의존한다. 가능성은 열려 있으나 안전한 ingress/outbound 방식과 복구 증거가 없다. |
| Vercel web + 자가 bot + 관리형 관계형 DB | web→host의 일반 데이터 CRUD 일부 | bot-side 현재 역할 조회, workload별 DB 권한, session state, 독립 backup | canonical data와 session을 web이 직접 읽을 수 있지만 bot-side 인가 경계는 제거되지 않는다. DB와 role 조회 두 경계를 함께 검증해야 한다. |
| 단일 지속 서버 | web↔bot public network 경계 | process/module 권한, session store, 외부 backup, 단일 장애 영역 통제 | `OWN-034`로 첫 MVP 경계가 확정됐다. 임대·소유 host와 저장소·runtime은 미정이며 RPO/RTO·blast radius 증거가 필요하다. |
| Vercel web + queue/event 중심 | 자가 host public ingress 가능성 | session store, 현재 역할의 동기 확인 경로, dedupe·TTL·결과 확인 | 일반 변경에는 후보지만 로그인·고위험 인가를 단독으로 담당할 수 없다. 첫 MVP에 별도 broker를 추가할 근거는 아직 약하다. |

## 3. 증거 공백

| ID | 공백 | 문서만으로 답할 수 없는 이유 | 결정에 미치는 영향 |
|---|---|---|---|
| `GAP-INT-01` | 월 명령 10,000회의 1년 최소 합성 DB·index·export 크기와 조건부 전이는 local SQLite·PostgreSQL에서 검증했다. | 실제 schema와 관리형 공급자의 청구 크기·connection 동작은 아직 없다. | 두 저장소 범주는 유지하며 provider 한도 판단은 보류 |
| `GAP-INT-02` | Vercel→자가 host의 세 경로가 모두 timeout됐고 `OWN-034`로 첫 MVP public network 경계를 제거했다. | 분리 배포를 다시 열기 전에는 추가 원인 분리가 필요하지 않다. | 첫 MVP 결정 공백 종료; 실패 증거 보존 |
| `GAP-INT-03` | 관리형 DB의 web·bot 최소 권한 분리, connection 수명과 장애 동작 | 공급자·driver·runtime 조합이 정해지지 않았다. | 공유 DB가 별도 API보다 실제로 단순한지 여부 |
| `GAP-INT-04` | 로그인·mutation·고위험 작업의 Discord 오류별 end-to-end 결과 | bot-side 조회와 web session을 연결한 실제 경계가 없다. | `OWN-028`, `OWN-031`의 기본 거부와 사용자 경험 |
| `GAP-INT-05` | Mac과 대체 Windows host에서 외부 backup 복원 및 전체 RTO | 장비 사양, runtime과 backup 방식이 정해지지 않았다. | 자가 저장소·자가 bot 경계의 운영 가능성 |
| `GAP-INT-06` | Discord confidential web flow의 PKCE 지원 범위 | 현재 공식 문서만으로 확정하지 못했다. | OAuth callback의 최종 보안 계약 |
| `GAP-INT-07` | Vercel Hobby, DB, 통신, backup, domain과 GPT를 합친 원화 비용 | 실제 사용량·환율·선택 서비스가 없다. | 월 30,000원 통과 여부 |

## 4. 확정된 통합 소유자 결정

| ID | 결정 | 연결된 소유자 결정 |
|---|---|---|
| `INT-Q01` | 자가 bot host 장애 중에는 유효한 5분 역할 cache로 read-only만 허용하고, 만료 뒤 인증된 조회 전체를 `unavailable`로 처리한다. 변경·고위험 작업은 즉시 거부한다. | `OWN-032` |
| `INT-Q02` | 고위험 작업의 마지막 OAuth 로그인이 15분을 넘으면 Discord OAuth를 다시 완료한다. 현재 역할 조회와 명시적 확인도 유지하며 session 활동은 recent-auth를 갱신하지 않는다. | `OWN-033` |
| `INT-Q03` | 첫 MVP는 web·bot을 단일 지속 server 경계에 두어 현재 역할 조회의 public network 경계를 제거한다. 임대 server와 소유 Mac·Windows 중 실제 host는 D-09에서 비교한다. | `OWN-034` |

## 5. 필요한 최소 Spike 후보 — 실행하지 않음

중복되는 DB·통신·인증 실험을 합쳐도 아래 네 개보다 줄이면 핵심 실패 경로가 빠진다. 각 Spike는 별도 승인 뒤 한 가설만 검증한다.

1. **경계 왕복·기본 거부 — 실행 완료, Failed**: 로컬 인증·cache 계약은 통과했지만 별도 Vercel preview에서 익명 임시 outbound tunnel을 거친 자가 host 호출이 function timeout으로 실패했다. 결과와 정리는 `docs/research/spikes/boundary-roundtrip-default-deny/README.md`에 기록했다.
2. **저장량·동시 전이 — 실행 완료, Passed**: 월 10,000회 × 1년의 합성 감사·dedupe·session record가 두 local engine에서 40MB 미만이었고, 동시 `operation_id`·rollback·retry·foreign key 기준을 모두 통과했다. 결과는 `docs/research/spikes/storage-volume-concurrent-transition/README.md`에 기록했다.
3. **빈 Windows 복구**: 외부 암호화 backup 하나로 빈 Windows 후보 host에 영구 데이터와 최소 서비스 상태를 복원하고 무결성 검사까지의 시간을 측정한다. RPO 24시간·RTO 8시간 판정 자료만 만든다.
4. **OAuth·session 실패 계약**: 운영과 분리된 고정 preview에서 callback 재사용, 잘못된 state/redirect, PKCE 지원 여부, session rotation·expiry와 Discord 역할 제거를 검증한다. 실제 사용자·운영 token은 사용하지 않는다.
5. **공유 저장소 outbound-pull 역할 조회 — 실행 완료, Failed**: local 최소 권한 query와 worker의 request claim/result 기록은 확인했지만 Vercel preview가 pooled·unpooled endpoint 모두에서 약 10초 뒤 timeout됐다. 결과와 정리는 `docs/research/spikes/shared-store-outbound-pull/README.md`에 기록했다.
6. **Named managed tunnel — 실행 완료, Failed**: 계정 고정 ngrok endpoint는 local 유효 요청을 463ms에 처리하고 Vercel 연결도 tunnel에 도달했지만 Vercel preview는 약 10초 뒤 timeout됐다. 결과는 `docs/research/spikes/named-managed-tunnel/README.md`에 기록했다.

관리형 DB cold start, provider outage와 무료 tier 한도는 `2`의 후보가 관리형 범주를 계속 통과할 때만 추가한다. queue/event Spike는 일반 변경에 별도 broker가 필요하다는 증거가 생기기 전에는 만들지 않는다.

## 6. 다음 단계와 종료 조건

첫 Spike는 **Vercel preview→익명 임시 `ssh -R` tunnel→자가 host 동기 호출 조합**만 탈락시킨다. 직접 API, named managed tunnel과 Vercel 분리 배포 범주 전체는 탈락시키지 않는다. 로컬에서 통과한 서명·replay·credential 교체·cache/default-deny 계약도 특정 인증 기술을 선택하는 근거로 사용하지 않는다.

구조적으로 가장 단순한 잔여 대안은 내부 network 경계를 없애는 단일 지속 server다. Vercel Hobby 사용 의도를 유지하는 조건에서는 D-05에서 공유 관계형 저장소가 살아남을 때 별도 broker 없이 versioned request/result를 outbound-pull하는 경계를 다음 후보로 둔다. 자가 SQLite와 Vercel을 함께 유지해야 할 때만 named 경로의 별도 검증 필요성을 다시 판단한다.

같은 tunnel 공급자나 DB endpoint를 바꾸는 추가 network Spike는 만들지 않는다. `INT-Q03`으로 첫 MVP의 public web→bot network 경계를 제거했으며 세 실패 Spike는 결과 증거로 보존한다. 다음 단계는 D-09에서 외부 임대 server와 소유 Mac·대체 Windows를 비용·상시성·보안·복구로 비교하는 것이다.

KBO는 허가된 공급 경로가 생길 때까지 연기하며 어떤 활성 저장·배포·통신·인증 경계에도 포함하지 않는다.

## 7. 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고 docs/prompts/research.md 절차에 따라
D-09 단일 지속 server 호스팅 후보를 조사해.
OWN-005, OWN-016~OWN-021, OWN-034와 D-08의 단일 server 경계를 입력으로 사용하고
외부 임대 server와 소유 Mac·대체 Windows를 비용·상시성·보안·복구로 비교해.
아직 host·runtime·저장소·인증 기술을 선택하거나 ADR, Spike, 구현 계획 또는 제품 코드를
작성하지 말고 KBO는 연기 상태로 유지해.
```
