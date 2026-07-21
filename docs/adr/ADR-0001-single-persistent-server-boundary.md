# ADR-0001: 첫 MVP의 단일 지속 server 배포 경계

- Status: Proposed
- Date: 2026-07-21
- Owners: Project owner
- Related requirements: `OWN-016`~`OWN-021`, `OWN-026`~`OWN-034`, `OPS-001`~`OPS-008`, `SEC-007`~`SEC-010`
- Related research: `docs/research/technology-options/deployment-boundary-and-internal-communication.md`, `docs/research/technology-options/storage-auth-deployment-boundary-integration-review.md`, `docs/research/spikes/boundary-roundtrip-default-deny/README.md`, `docs/research/spikes/shared-store-outbound-pull/README.md`, `docs/research/spikes/named-managed-tunnel/README.md`
- Supersedes: None
- Superseded by: None

## Context

첫 MVP는 Discord Gateway bot의 지속 실행과 `https://waw.dubeom.com` 관리 web을 함께 제공해야 한다. 분리 배포를 가정한 Vercel web에서 bot 측 현재 역할을 5초 안에 조회하는 세 경계 Spike는 허용된 실제 경로에서 성공을 입증하지 못했다. Shared-store outbound pull은 외부 preview에서 timeout됐고, direct boundary와 named tunnel도 도달 가능한 허가 경로를 만들지 못했다. 이 실패는 특정 공급자 원인을 확정하지 않지만, 첫 MVP에 public web→bot API, tunnel 또는 queue를 추가할 근거도 제공하지 않는다.

Owner는 `OWN-034`에서 web과 bot을 하나의 지속 server 배포 경계에 두기로 결정했다. 실제 외부 임대 VM 또는 소유 Mac·Windows host, 운영체제, runtime, process 구성, 저장소와 workload 인증 기술은 별도 결정이다.

## Decision drivers

- 현재 역할 조회와 고위험 변경 확인을 public web→bot network 왕복 없이 처리한다.
- 첫 MVP의 공개 ingress, credential, 관리 plane과 장애 지점을 최소화한다.
- 단일 guild·친구 몇 명의 비상업 운영 범위와 월 30,000원 총예산을 지킨다.
- browser session, Discord user token, bot token과 저장소 권한의 trust boundary를 유지한다.
- 허용된 영구 데이터 전체의 RPO 24시간과 bot·web·data 검증을 포함한 RTO 8시간을 후속 시험으로 입증할 수 있어야 한다.
- 미래 분리 가능성을 위해 논리 계약과 idempotency를 유지하되, 첫 MVP에 미사용 transport를 구현하지 않는다.

## Considered options

### Option A: web·bot 단일 지속 server

Web과 bot을 같은 지속 host에 배치하고 현재 역할 조회를 local module 또는 local process 경계로 제한한다. `waw.dubeom.com:443` 외의 public 관리 endpoint, 별도 tunnel과 queue는 두지 않는다.

### Option B: Vercel web과 지속 bot host 분리

Direct API, named tunnel 또는 상호 인증된 service boundary로 web과 bot을 연결한다. Web 배포 독립성은 높지만 추가 public/network 경계, credential, timeout과 운영면이 생긴다.

### Option C: 공유 저장소 또는 broker를 통한 분리

Web이 command 또는 설정 transition을 공유 DB·queue에 기록하고 bot이 pull/consume한다. 비동기 적용에는 맞을 수 있지만 현재 역할의 5초 확인, 조건부 전이, retry·dedupe, 별도 권한과 장애 관측이 필요하다.

## Decision

첫 MVP의 web과 Discord Gateway bot은 하나의 지속 server 배포 경계에 둔다.

- 현재 Discord 역할 조회와 내부 명령은 public network가 아닌 local module 또는 local process 경계로 제한한다.
- 외부에 공개하는 관리 web ingress는 canonical production domain `https://waw.dubeom.com`의 HTTPS 경계로 제한한다.
- 별도 web→bot public API, tunnel, queue 또는 broker는 첫 MVP 기본 구조에 포함하지 않는다.
- Browser session과 bot token 접근 권한은 분리한다. 같은 host라는 이유로 web process에 bot token 또는 광범위 저장소 권한을 부여하지 않는다.
- Host, OS, runtime, 같은 process/별도 process, 저장소, backup, TLS ingress와 secret 전달 방식은 이 ADR에서 선택하지 않는다.

## Rationale

단일 server 경계는 첫 MVP에서 검증되지 않은 network transport와 workload credential을 제거하면서 현재 역할 확인의 latency·availability 요구를 가장 직접적으로 충족한다. 이는 논리 경계를 합치는 결정이 아니다. Web 요청 검증, domain service, bot adapter와 persistence 계약을 분리해 향후 분리 배포가 필요해질 때 transport를 추가할 수 있게 한다.

분리 배포는 가장 강한 대안으로 남지만, 현재 세 Spike의 실패와 저비용 운영 범위에서는 추가 복잡성을 정당화하지 못한다.

## Consequences

### Positive

- Web→bot public network 경계와 해당 workload credential이 제거된다.
- 현재 역할 조회와 고위험 변경 확인을 local 경계에서 수행할 수 있다.
- 첫 MVP의 배포 단위, 관측 지점과 월 고정비를 줄일 가능성이 크다.

### Negative

- Web과 bot이 하나의 host 장애 영역을 공유한다.
- Web 침해가 local privilege 또는 secret 분리 실패를 통해 bot과 data로 확산될 수 있다.
- Web만 독립 확장하거나 독립 배포하는 경로는 후속 migration이 필요하다.

### Risks

- Process 권한과 secret 접근을 분리하지 않으면 단일 host가 과도한 blast radius를 만든다.
- 재부팅·배포 중 bot singleton과 web 복구 순서를 검증하지 않으면 중복 Gateway session 또는 장시간 중단이 생길 수 있다.
- 외부 backup과 빈 대체 host 복구를 시험하지 않으면 RPO 24시간·RTO 8시간을 충족한다고 볼 수 없다.
- Local 호출을 이유로 입력 검증, authorization, audit와 idempotency를 생략할 수 있다.

## Validation

- D-09에서 후보 host의 재부팅·process crash·배포 후 bot singleton과 web health 복구 시간을 측정한다.
- D-04에서 Discord Gateway disconnect/Resume, Ready 이후 reconciliation과 선택 runtime/SDK의 clean install을 검증한다.
- D-05·D-12에서 조건부 전이, 외부 backup, 빈 대체 host restore와 RPO/RTO를 검증한다.
- 보안 구현 전 web process가 bot token을 읽지 못하고 필요한 local operation만 호출할 수 있는지 검증한다.
- Production domain 외 관리 endpoint와 불필요한 inbound port가 없는지 배포 검증에 포함한다.

## Rollback or migration

분리 배포가 필요해지면 기존 local application contract를 versioned command/query boundary로 감싸고, 선택된 transport에 authentication, authorization, expiry, replay 방지, idempotency와 timeout을 추가한다. 전환 기간에는 한 transport만 write authority를 갖게 하고 결과·dedupe 기록을 대조한 뒤 local 경계를 제거한다.

## Conditions for reconsideration

- Web 독립 확장, 독립 장애 격리 또는 별도 배포 주기가 실제 제품 요구가 된다.
- 단일 host가 외부 backup 복원 포함 RPO 24시간·RTO 8시간 또는 필요한 blast-radius 통제를 충족하지 못한다.
- 검증 가능한 분리 경로가 예산 안에서 운영·보안 복잡성을 실질적으로 낮춘다.
- 보안 검토에서 같은 host의 권한 분리가 허용 가능한 수준으로 구현될 수 없다고 판정한다.
- 월 총비용 또는 공급자 제약 때문에 단일 지속 server 운영이 불가능해진다.

## Approval

- Owner decision: Pending — `OWN-034` 방향을 이 ADR의 구체 경계와 제외 범위로 승인 필요
- Approved date: Pending
