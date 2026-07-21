# ADR-0002: 봇 호스트와 단일 활성 인스턴스

- Status: Proposed
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: OPS-001, OPS-002, OPS-008, SEC-008, OPS-003, OPS-004, OWN-005
- Related research: `docs/research/technical-constraints.md`, `docs/research/technology-options/initial-decision-map.md` (D-09)
- Supersedes: 없음
- Superseded by: 없음

## Context

Discord Gateway 봇은 장시간 연결되어야 하며 종료 후 재시작, 재연결, 상태 확인과 롤백이 필요하다. 배포 중 두 프로세스가 동시에 이벤트를 처리하거나 스케줄 작업을 실행하면 중복 감사 기록과 중복 판정이 생길 수 있으므로 정상 운영과 배포 전환 모두에서 활성 실행은 하나여야 한다.

첫 MVP의 신규 월 지출 상한은 GPT API와 필수 외부 백업·도메인 부대비용을 포함해 3만 원이다. 기존 MacBook 상시 실행은 우선 조사 시나리오일 뿐 확정된 호스트가 아니다. 선행 결정 D-04(런타임·SDK)와 D-08(배포 경계·내부 통신)은 아직 완료되지 않았고 실제 부하도 미확인이다.

이 초안은 공급자를 선택하지 않는다. 계정 생성, credential 취급, 배포, DNS·네트워크 또는 운영 환경 변경도 범위 밖이다.

## Decision drivers

1. Gateway 연결과 봇 프로세스를 계속 실행하고 예기치 않은 종료 뒤 재시작할 수 있어야 한다.
2. 정상 실행, 재시작과 배포 전환 중 활성 봇 및 스케줄 실행자가 최대 하나임을 검증할 수 있어야 한다.
3. readiness와 liveness를 구분해 연결 불능 또는 멈춘 프로세스를 탐지할 수 있어야 한다.
4. 이전 앱 버전으로 되돌릴 수 있고 전환 실패가 중복 실행이나 데이터 손상을 만들지 않아야 한다.
5. 비밀의 환경 분리, 최소 권한, 로그 접근 통제와 교체 절차를 지원해야 한다.
6. 서울 기준 운영·장애 대응이 가능하고 전체 월 예산 안에 들어야 한다.
7. 공급자 종속 기능 없이 이미지, 설정 목록과 데이터 내보내기로 이전할 수 있어야 한다.

## Considered options

### Option A: 기존 MacBook에서 자체 호스팅

macOS `launchd`는 지속 실행 작업과 종료 시 `SIGTERM` 전달을 지원하고, 전원 연결 중 자동 잠자기 방지 설정이 있다. 기존 장비 비용을 제외하는 OWN-005의 비용 조건에는 가장 유리할 수 있다.

그러나 노트북 절전·덮개·전원·가정용 네트워크·재부팅 후 복구와 원격 장애 대응을 소유자가 직접 책임져야 한다. `launchd` 한 job은 같은 장비에서의 단일 프로세스 시작을 단순화하지만, 배포 스크립트나 수동 실행까지 포함한 전역 단일 활성 실행을 자체로 증명하지 않는다.

### Option B: Render background worker

Render는 background worker를 지속 실행 서비스로 설명하며 배포와 재시작을 관리한다. 다만 공식 health check는 web service와 private service에만 적용된다고 명시되어 background worker의 Gateway 연결 상태를 별도 방식으로 감시해야 한다. 또한 zero-downtime 배포는 새 인스턴스를 먼저 시작하고 이전 인스턴스를 종료하므로, 봇에서는 짧은 중첩도 OPS-002 위반이 될 수 있다.

### Option C: Fly.io 단일 Machine

서비스가 없는 Fly Machine은 자동 중지 없이 실행되며 restart policy로 수명주기를 관리할 수 있다. Machine 수와 지역을 명시적으로 제어할 수 있고 배포 전략과 이전 이미지 배포 수단도 제공한다.

반면 Machine 수를 1로 고정하는 것만으로 동시 배포·수동 시작 경쟁까지 배제되는지는 확인이 필요하다. 배포 전략에 따라 새 Machine을 병행 기동할 수 있으므로 실제 설정에서 최대 동시 실행 수를 측정해야 하며, 서울 인접 지역의 가용성·지연과 월 비용도 아직 검증되지 않았다.

## Decision

공급자 선택은 보류한다. Proposed 상태에서 다음 두 후보를 동일한 실행 계약으로 검증한다.

- 우선 조사 후보: 기존 MacBook 자체 호스팅
- 관리형 대안: Fly.io 단일 Machine

Render background worker는 배포 중 인스턴스 중첩을 방지하는 공식 설정 또는 재현 가능한 fencing 증거가 확보될 때만 다시 비교한다.

최종 선택은 D-04와 D-08이 Proposed ADR에 반영되고, 아래 Validation의 문서 증거와 승인된 로컬 또는 샌드박스 Spike가 채워진 뒤 별도 소유자 승인으로 이 ADR을 갱신해 수행한다. 그 전에는 어느 후보도 운영 적합 판정을 받지 않는다.

## Rationale

MacBook은 소유자가 지정한 우선 조사 시나리오이며 신규 호스팅 지출을 피할 가능성이 있다. Fly.io는 지속 프로세스, restart policy와 단일 Machine 구성을 공식 문서로 확인할 수 있어 관리형 비교 기준이 된다. 두 후보만 유지하면 아직 확정되지 않은 런타임·배포 경계에 앞서 공급자를 고르지 않으면서도 자체 운영과 관리형 운영의 핵심 trade-off를 검증할 수 있다.

Render는 지속 worker를 제공하지만 현재 문서상 background worker health check와 무중첩 배포가 D-09의 핵심 요구를 바로 충족하지 않는다. 이는 공급자 탈락의 최종 결정이 아니라 현재 증거 수준에 따른 보류다.

## Consequences

### Positive

- 공급자 계정이나 운영 자원을 만들기 전에 단일 실행과 복구 기준을 고정한다.
- 자체 호스팅과 관리형 호스트를 같은 장애 시나리오와 비용 범위로 비교한다.
- 단일 실행을 플랫폼 설정만으로 가정하지 않고 관측 가능한 통과 조건으로 다룬다.

### Negative

- D-04와 D-08 및 Spike가 끝날 때까지 구현 계획과 운영 배포를 시작할 수 없다.
- 두 후보 모두 health 신호, fencing과 운영 절차 일부를 애플리케이션 또는 배포 절차에서 보완할 수 있다.
- MacBook 후보는 물리·네트워크 장애 대응 부담이 크고, Fly.io 후보는 공급자 API와 이미지 배포 방식에 종속된다.

### Risks

- 프로세스 관리자와 플랫폼이 각각 재시작하면 짧은 중복 실행이 생길 수 있다.
- Gateway 연결 여부를 프로세스 생존만으로 판단하면 멈춘 인스턴스를 정상으로 오인할 수 있다.
- 외부 저장소 기반 lease/fencing이 필요해지면 D-05와 결합되고 복잡도와 비용이 늘어난다.
- 가격, 지역, 보존 정책과 플랫폼 동작은 변경될 수 있다.
- MacBook의 절전, 덮개 닫힘, 정전, OS 업데이트 또는 회선 장애가 RTO 8시간을 위협할 수 있다.

## Validation

승인된 Spike는 실제 Discord token이나 운영 데이터 대신 합성 worker와 로컬·샌드박스 자원만 사용하며 다음을 재현해야 한다.

1. 프로세스 강제 종료 후 자동 재시작 시간과 상태 신호를 측정한다.
2. 네트워크 단절·복구에서 재연결하고 중복 이벤트를 만들지 않는지 확인한다.
3. 동시 배포 요청과 롤백 중 활성 worker 수가 항상 0 또는 1인지 외부 관측으로 기록한다.
4. 이전 버전 복귀 시간과 실패 시 수동 복구 절차가 RTO 8시간 안인지 확인한다.
5. 월 비용을 2026년 시점의 실행 시간, CPU·메모리, 저장·송신, 세금과 환율 가정으로 계산하고 나머지 MVP 비용과 합산한다.
6. 비밀 주입·교체, 운영/미리보기 분리, 로그 보존·접근 통제는 D-11과 함께 검토한다.

현재 증거 공백:

- D-04 런타임·SDK와 D-08 배포 경계·내부 통신 결정이 없다.
- 예상 메모리, CPU, 송신량, 이벤트 빈도와 배포 빈도가 없다.
- MacBook 모델·macOS 버전, 덮개 상태의 지속 실행, 정전 후 부팅, 원격 접근, 회선·공인 진입 경계와 RTO 측정이 없다.
- Fly.io 대상 지역의 실제 가용성·지연·비용과 단일 Machine 배포 중 동시성 측정이 없다.
- 어떤 후보에도 애플리케이션 수준 lease/fencing이 필요한지 결정할 장애 증거가 없다.
- health 신호의 소비자, 경보 경로와 운영자 응답 시간이 정해지지 않았다.

확인한 1차 자료(확인일 2026-07-21):

- Apple, [Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- Apple, [Set sleep and wake settings for your Mac](https://support.apple.com/en-gb/guide/mac-help/mchle41a6ccd/mac)
- Render, [Background Workers](https://render.com/docs/background-workers), [Health Checks](https://render.com/docs/health-checks), [How Render handles zero-downtime deploys](https://render.com/articles/how-render-handles-zero-downtime-deploys)
- Fly.io, [Managing Machines with the Machines API](https://fly.io/docs/machines/guides-examples/managing-machines-with-the-api/), [Deploy an app](https://fly.io/docs/launch/deploy/), [Resource Pricing](https://fly.io/docs/about/pricing/)

## Rollback or migration

아직 운영 변경이 없으므로 이 제안 자체의 롤백은 ADR을 Rejected로 표시하는 것이다. 향후 선택 시에는 OCI 이미지 또는 재현 가능한 빌드, 버전 관리된 비밀 이름·설정 목록, 공급자 독립 health 계약과 데이터 내보내기를 유지한다. 호스트 교체는 새 호스트를 검증한 뒤 이전 worker를 중지하고 lease/fencing 상태를 확인한 후 새 worker를 시작하는 stop-then-start 방식으로 수행한다. 동시 가동을 무중단 전환 수단으로 사용하지 않는다.

## Conditions for reconsideration

- 기존 MacBook이 측정된 RTO, 보안 또는 원격 복구 조건을 충족하지 못한다.
- Fly.io의 비용·지역·수명주기 정책이 예산 또는 지속 실행 요구를 충족하지 못한다.
- Render 또는 다른 관리형 worker가 무중첩 배포와 application-level health를 더 적은 운영 부담으로 증명한다.
- 다중 Discord 서버, 고가용성 또는 무중단 배포가 제품 요구가 되어 단일 worker 계약을 바꿔야 한다.
- D-04, D-05, D-08, D-11 또는 D-12가 현재 후보의 전제를 바꾼다.

## Approval

- Owner decision: 미결정 — 공급자 선택 승인 아님
- Approved date: 없음
