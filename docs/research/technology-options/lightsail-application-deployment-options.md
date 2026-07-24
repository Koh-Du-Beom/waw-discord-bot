# D-15 서울 Lightsail application 배포: systemd 직접 실행과 Docker Compose

- 상태: Research
- 확인일: 2026-07-22
- 결정 질문: 1GB Ubuntu 24.04 Lightsail에서 Fastify web, Discord bot과 기존 backup timer를 어떤 process/package 경계로 배포할 것인가?
- 연결 요구사항: `OPS-001`~`OPS-004`, `OPS-008`, `SEC-007`~`SEC-010`, `DEP-001`~`DEP-002`, `QUA-001`~`QUA-002`
- 선행 결정: `ADR-0001`, `ADR-0004`, `ADR-0005`, `ADR-0010`
- 비범위: production host 변경, Docker 설치, DNS/TLS 선택, CI/registry 생성, 제품 구현

## 현재 경계

- 한 Ubuntu host에서 web과 bot을 실행하되 별도 Linux user와 secret file로 capability를 나눈다.
- Canonical database는 외부 Supabase PostgreSQL이고 application local volume은 canonical data를 갖지 않는다.
- Backup은 같은 host의 `waw-backup` system account와 systemd timer로 이미 실행하며 S3 Put-only credential만 가진다.
- Node 24·discord.js와 Fastify/Vite/React Router가 같은 application release와 lockfile을 사용할 수 있다.
- 월 총예산과 1GB memory를 지키고, 장애 복구와 이전 release rollback이 운영자 한 명에게 명확해야 한다.

## 후보 A — Ubuntu Node + systemd 직접 실행

CI 또는 clean build 환경에서 immutable release archive를 만들고 `/opt/waw/releases/<version>`에 배치한다. `current` symlink를 전환한 뒤 별도 `waw-web.service`와 `waw-bot.service`를 재시작한다. Reverse proxy와 backup timer도 각각 독립 systemd unit로 둔다.

### 확인 사실

- systemd service는 Ubuntu 24.04의 기존 init/service manager이며 별도 daemon/runtime 설치 없이 process restart, dependency/order, user, working directory와 environment/credential file을 표현한다.
- systemd는 cgroup을 통해 `MemoryHigh`, `MemoryMax`, CPU/task 제한을 적용할 수 있다. 제한은 실제 host에서 kernel/controller 지원을 read-back해야 한다.
- `User=`, filesystem protection, capability bounding과 per-service credential path를 조합할 수 있지만 unit에 옵션을 적는 것만으로 application authorization이나 secret-at-rest 보호가 완성되지는 않는다.
- 현재 production backup timer가 별도 system user, mode `0640` environment file과 enabled/active 상태로 같은 방식의 최소 운영 증거를 이미 제공한다.

### 평가

- 장점: 추가 daemon, image store, registry와 container network가 없다. Web/bot user·file permission deny를 host에서 직접 시험할 수 있고 journald/cgroup/systemd 상태가 한 관리면에 모인다. Release symlink rollback은 DB migration이 backward-compatible하면 빠르다.
- 단점: Node와 OS library를 host에 설치·patch해야 한다. Build artifact가 native dependency를 포함하면 build/host ABI 일치를 관리해야 하며, filesystem isolation은 container보다 직접 설계할 항목이 많다.
- 보안: web user에 bot environment file read를 거부하고 bot user에 OAuth/web session secret을 거부한다. Unit의 environment 값은 명령행과 로그에 출력하지 않으며 root-readable file 또는 `LoadCredential` 적용 가능성을 실제 Ubuntu systemd version에서 검증한다.
- 운영: `Restart=on-failure`, restart backoff/start limit, graceful `SIGTERM`, readiness/health와 bot singleton lease를 함께 검증해야 한다. `Restart=always`만 두고 crash loop를 방치하지 않는다.

## 후보 B — Docker Engine + Docker Compose

Web과 bot의 pinned OCI image를 만들고 Compose service로 실행한다. Reverse proxy와 backup을 host systemd에 남기거나 container로 옮길 수 있다.

### 확인 사실

- Ubuntu의 공식 Docker Engine 설치는 Docker repository와 `docker-ce`, CLI, containerd, Buildx, Compose plugin이라는 별도 package/update surface를 추가한다.
- Compose는 production override, restart policy, service별 secrets와 resource 설정을 표현할 수 있다. 단순 `docker compose restart`는 environment/config 변경을 반영하지 않으므로 recreate/up 절차가 필요하다.
- Docker container는 기본적으로 memory/CPU 제한이 없다. Host OOM 안정성을 위해 limit을 명시하고 실제 kernel 지원을 확인해야 한다.
- Compose secrets는 service에 명시적으로 grant할 수 있지만 source file/environment의 host 권한과 Compose file trust가 여전히 중요하다. Docker 문서는 Compose file이 host file/symlink 내용을 읽을 수 있음을 경고한다.
- Rootless mode는 daemon과 container를 non-root user namespace에서 실행해 daemon/runtime 취약점의 영향을 줄이지만 추가 prerequisite, user service와 UID/GID/network 운영이 필요하다.

### 평가

- 장점: Node/OS userland를 image digest로 고정하고 clean host에서 같은 artifact를 실행하기 쉽다. Web/bot filesystem, user, capabilities, read-only root filesystem과 resource를 service별로 표현할 수 있다.
- 단점: 1GB single host에 dockerd/containerd와 image/cache/log lifecycle을 추가한다. Docker socket 권한은 사실상 높은 host 권한이므로 application user에게 제공할 수 없다. Registry 또는 image transfer, base image patch, garbage collection과 daemon 장애를 별도로 운영한다.
- 보안: container는 authorization boundary가 아니며 rootful daemon/socket, bind mount와 secret source를 잘못 구성하면 host capability가 확장된다. Rootless는 blast radius를 줄일 수 있지만 이 작은 배포에서 운영 복잡성을 더한다.
- rollback: 이전 digest로 recreate할 수 있어 명확하지만 image availability와 Compose config/version을 함께 보존해야 한다. Database migration rollback 조건은 systemd와 동일하다.

## 비교

| 기준 | systemd 직접 실행 | Docker Compose |
|---|---|---|
| 추가 관리 계층 | Ubuntu 기본 systemd만 사용 | Docker daemon, containerd, Compose, images |
| artifact 재현성 | release archive+lockfile+Node/OS pin 필요 | image digest로 강함 |
| secret/process 분리 | Linux user/file permission/unit sandbox | container user/secrets/mount; daemon/socket 별도 위험 |
| 1GB resource | application+OS만 측정 | daemon/cache overhead 포함 측정 필요 |
| rollback | release symlink+service restart | previous digest+service recreate |
| 관측 | journald/systemctl/cgroup | Docker logs/stats+daemon, 또는 journald 연동 |
| host 이전 | install runbook 필요 | Engine+image가 있으면 단순화 |
| 현재 프로젝트 증거 | backup systemd timer 운영 중 | production host 증거 없음 |

## 잠정 추천

**후보 A, systemd 직접 실행을 첫 MVP의 잠정 선택으로 둔다.** Docker Compose가 기술적으로 부적합해서가 아니라 현재 구성요소와 운영 규모에서는 image portability보다 관리면 최소화가 더 중요하다. 외부 Supabase/S3 때문에 local volume portability 이점도 작고, web·bot은 같은 Node release를 공유할 수 있다.

Strongest alternative는 rootless Docker Compose다. Native module/OS dependency가 늘거나 Windows/다른 Linux host로 빈번한 이전, registry 기반 CI, 여러 service replica 또는 image attestation이 실제 요구가 되면 Compose의 재현성이 추가 부담을 정당화할 수 있다.

## 필요한 Spike

Production credential 없이 disposable Ubuntu 24.04 fixture에서 systemd 경로를 검증한다.

1. 별도 `waw-web`/`waw-bot` user와 서로 읽을 수 없는 synthetic secret files
2. immutable 두 release와 atomic `current` symlink, health 성공 후 전환과 실패 시 이전 release rollback
3. web/bot process crash, host reboot, graceful `SIGTERM`, restart backoff와 singleton duplicate deny
4. `MemoryHigh`/`MemoryMax`, RSS/event-loop와 journald secret redaction
5. reverse proxy 뒤 localhost-only Fastify health와 public port inventory
6. uninstall/cleanup 후 unit, user, release, port, process와 billable fixture absence

Docker 비교가 필요해지는 전환 조건이 발생하기 전에는 production host에 Docker를 설치하지 않는다.

## 사실·추론·가정·미확인

- 사실: Docker의 설치 package, Compose production/restart/secrets와 default unlimited resource 동작은 공식 Docker 문서에서 확인했다. systemd cgroup/resource 구현과 project의 existing backup unit 증거도 확인했다.
- 추론: 1GB 단일 Node host에서는 Docker의 portability보다 추가 daemon/patch/log/image 관리 비용이 크다.
- 가정: production build가 native ABI에 강하게 묶인 dependency 없이 immutable archive로 전달 가능하다.
- 미확인: Ubuntu fixture의 exact systemd sandbox option, Node host install/update, combined web+bot memory, crash/reboot/rollback 시간과 reverse proxy.

## 전환 조건

- Clean host restore가 release archive/Node install 때문에 RTO 8시간을 반복 초과한다.
- Native dependency 또는 OS drift가 재현 가능한 deploy를 방해한다.
- Multiple host/replica, registry CI, signed image/SBOM 정책이 필요해진다.
- Systemd user/file sandbox가 요구한 secret blast radius를 통제하지 못한다.
- Docker daemon을 포함한 실제 1GB 측정이 동일 reliability를 더 낮은 운영 비용으로 입증한다.

## 공식 출처

- systemd project/source: https://github.com/systemd/systemd
- systemd resource-control implementation: https://github.com/systemd/systemd/blob/main/src/core/cgroup.c
- Docker Engine Ubuntu install: https://docs.docker.com/engine/install/ubuntu/
- Compose production: https://docs.docker.com/compose/how-tos/production/
- Compose restart semantics: https://docs.docker.com/reference/cli/docker/compose/restart/
- Compose secrets: https://docs.docker.com/reference/compose-file/secrets/
- Compose trust model: https://docs.docker.com/compose/trust-model/
- Docker resource constraints: https://docs.docker.com/engine/containers/resource_constraints/
- Docker rootless mode: https://docs.docker.com/engine/security/rootless/

## 정확한 다음 프롬프트

`ADR-0011의 systemd 직접 배포 제안을 검토해. 승인하면 credential 없는 disposable Ubuntu 24.04 systemd crash/reboot/rollback Spike runbook과 실행 계획을 작성해.`
