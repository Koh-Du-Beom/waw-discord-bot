# ADR-0011: 서울 Lightsail application을 systemd로 직접 실행

- Status: Accepted
- Date: 2026-07-22
- Owners: Project owner
- Related requirements: `OPS-001`~`OPS-004`, `OPS-008`, `SEC-007`~`SEC-010`, `DEP-001`~`DEP-002`, `QUA-001`~`QUA-002`
- Related research: `docs/research/technology-options/lightsail-application-deployment-options.md`
- Supersedes: None
- Superseded by: None

## Context

첫 MVP는 서울 1GB Ubuntu Lightsail에서 Fastify web과 Discord bot을 실행하고, 외부 Supabase PostgreSQL와 S3 encrypted backup을 사용한다. Backup은 이미 host systemd timer와 별도 system user로 운영한다. Application 배포에는 systemd 직접 실행과 Docker Compose가 모두 현실적이지만, process/secret 격리, rollback, resource와 관리면이 다르다.

## Decision drivers

- 1GB host와 월 예산에서 추가 daemon·control plane 최소화
- Web, bot과 backup의 Linux user·secret file·DB role 분리
- Crash/reboot 자동 복구, bot singleton과 graceful shutdown
- Immutable release, health gate와 이전 version atomic rollback
- Host rebuild와 RTO 8시간, Node/OS security update
- Logs/resource/health의 단일하고 검토 가능한 운영면

## Considered options

### Option A: systemd 직접 실행

Pinned Node runtime과 immutable application release를 host에 설치하고 별도 `waw-web`/`waw-bot` system user와 service unit로 실행한다.

### Option B: rootful Docker Compose

Pinned image를 Docker Engine/containerd/Compose로 실행한다. Image 재현성은 높지만 rootful daemon/socket과 별도 package/image/log lifecycle을 운영한다.

### Option C: rootless Docker Compose

Daemon과 container를 non-root user namespace에서 실행해 rootful blast radius를 줄인다. User service, UID/GID, network와 resource prerequisite가 추가된다.

## Decision

첫 MVP application은 **Docker 없이 Ubuntu host에서 systemd로 직접 실행**한다.

- Web, bot과 backup은 각각 별도 system user와 root-owned environment/credential file을 사용하고 다른 workload secret read를 OS permission test로 거부한다.
- Release는 `/opt/waw/releases/<version>`의 immutable directory와 `/opt/waw/current` symlink로 관리한다. Health gate를 통과한 뒤 전환하고 실패하면 previous symlink로 되돌린다.
- Web과 bot은 독립 unit로 두되 배포 protocol이 bot singleton과 schema compatibility를 보장한다.
- Unit에는 restart backoff/start limit, graceful stop timeout, working/state directory, 최소 filesystem/capability sandbox와 측정에 근거한 cgroup resource control을 둔다.
- Node major, OS package source와 exact application lockfile을 고정하고 upgrade/rollback runbook을 유지한다.
- Docker Engine/Compose는 first MVP production host에 설치하지 않는다.

## Rationale

현재 application은 같은 Node toolchain을 쓰는 두 process이고 canonical data는 host 밖에 있다. Docker image가 제공하는 filesystem portability보다 daemon/containerd/Compose/image store라는 추가 관리면의 비용이 크다. Ubuntu 기본 systemd는 이미 backup job에서 사용 중이며 process user, restart, cgroup과 journald를 한 운영면에서 제공한다.

Docker Compose는 strongest alternative다. Host 간 잦은 이동, native dependency drift, registry CI와 image provenance가 실제 요구가 되면 재현성이 추가 운영 부담을 상쇄할 수 있다.

## Consequences

### Positive

- Docker daemon/socket, container network, image cache와 registry 운영을 피한다.
- Workload별 file permission과 process identity를 host에서 직접 감사한다.
- Existing backup timer와 application 상태/로그/resource를 systemd/journald/cgroup으로 통일한다.
- Release symlink rollback이 작고 공급자 비종속적이다.

### Negative

- Node/OS package와 native ABI 호환성을 host install runbook에서 책임진다.
- Container filesystem isolation과 digest packaging을 얻지 못한다.
- Unit sandbox, directories, log retention과 release pruning을 직접 설계한다.

### Risks

- Over-broad file permission이나 shared group이 secret boundary를 무너뜨릴 수 있다.
- Host build와 release build 환경 차이가 native dependency failure를 만들 수 있다.
- 잘못된 restart policy가 crash loop 또는 duplicate bot을 만들 수 있다.
- Backward-incompatible migration은 symlink rollback만으로 복구되지 않는다.

## Validation

- Disposable Ubuntu 24.04 fixture에서 synthetic web/bot service의 cross-secret read deny
- Crash, reboot, graceful stop, restart backoff와 singleton duplicate deny
- Two-release health-gated switch와 forced-failure rollback
- 1GB combined RSS/event-loop/cgroup, journald redaction과 port inventory
- Clean-host install/restore elapsed time와 complete resource cleanup

## Rollback or migration

Docker Compose로 전환할 때 current release와 lockfile에서 pinned non-root images를 만들고 같은 health, session, singleton, secret deny와 rollback tests를 실행한다. 한 시점에 systemd native 또는 Compose 중 하나만 public/bot authority를 갖는다. External Supabase/S3 contract는 유지하며 local state를 image/volume 전환 근거로 사용하지 않는다.

## Conditions for reconsideration

- Native dependency/OS drift가 clean deploy 또는 RTO를 반복 실패시킨다.
- Multiple hosts, replicas, registry CI, signed image/SBOM이 요구된다.
- Systemd sandbox가 required secret/process isolation을 충족하지 못한다.
- Rootless Compose가 1GB reliability와 운영 복잡성에서 실측 우위를 보인다.

## Approval

- Owner decision: Approved — direct systemd application deployment; Docker Compose remains the reconsideration path
- Approved date: 2026-07-22
