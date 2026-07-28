# ADR-0023: GitHub Actions를 통한 Lightsail application 배포

- Status: Accepted
- Date: 2026-07-28
- Owners: Product owner
- Related requirements: OPS-001 through OPS-004, SEC-007 through SEC-010,
  DEP-001 through DEP-002
- Related research:
  `docs/research/technology-options/github-actions-lightsail-deployment.md`
- Supersedes: ADR-0011의 수동 application release 전달 경로만
- Superseded by:

## Context

Accepted ADR-0011의 systemd, immutable release directory와 symlink rollback은
production에서 동작하지만 현재 application release 전달은 Orca/CloudShell의
수동 세션에 의존한다. 로컬 Orca runtime 장애만으로도 production preflight를
시작하지 못했다. 제품 소유자는 development와 production source authority를
분리하고 production branch 갱신을 GitHub Actions Lightsail 배포 trigger로
사용하기로 방향을 제시했다.

## Decision drivers

- 로컬 Orca/CloudShell UI availability를 배포 필수조건에서 제거
- production 변경의 PR, commit, workflow와 deployment 추적성
- 장기 AWS access key와 장기 SSH private key 회피
- exact archive hash, host-key pinning, preflight와 rollback 보존
- application deploy와 migration, credential, feature activation 권한 분리
- 1 GB host에 self-hosted runner daemon을 추가하지 않음

## Considered options

### Option A: static AWS/SSH secrets를 사용하는 GitHub-hosted runner

구현은 작지만 장기 credential 두 개와 rotation·유출 경계를 추가한다.

### Option B: production host의 self-hosted runner

Inbound SSH가 필요 없지만 workflow executor가 production host에 상주하고
runner lifecycle과 workflow trust가 host-local secret boundary에 합류한다.

### Option C: GitHub OIDC와 Lightsail temporary SSH access

보호된 production branch job만 short-lived AWS role을 assume하고 exact
Lightsail instance의 temporary access detail을 받아 host-key-pinned SSH로
기존 immutable release manager를 실행한다.

## Decision

Option C를 제안한다.

- `develop`은 기본 integration branch다.
- `production`은 deploy authority branch다. `develop`에서 오는 reviewed PR만
  merge하며 direct/force push와 deletion을 금지한다.
- `production` push는 CI artifact를 그대로 신뢰하지 않고 해당 `GITHUB_SHA`의
  source archive를 생성·hash한 뒤 production deploy job을 시작한다.
- production 승인의 기본 단위는 `develop`→`production` PR merge다.
- GitHub Environment approval은 private repository와 account plan에서 실제
  지원됨을 확인한 경우 defense-in-depth로 추가하며 유일한 승인 경계로
  의존하지 않는다.
- AWS authentication은 exact repository/production authority에 묶인 GitHub
  OIDC role을 사용한다. Long-lived GitHub AWS/SSH secrets는 만들지 않는다.
- SSH는 Lightsail temporary private key/certificate와 반환된 host keys를
  사용한다.
- 기존 systemd, `LoadCredential=`, Caddy, Supabase, S3 backup, immutable
  release directory와 current/previous symlink 결정은 유지한다.
- migration, application credential 변경, Discord command registration,
  provider/game feature activation과 journald vacuum은 자동 application
  deployment 권한에 포함하지 않는다.
- `main`은 bootstrap 완료 뒤 archived compatibility branch로 남기며
  `develop`과 함께 움직이는 세 번째 장기 branch로 운영하지 않는다.

## Rationale

OIDC와 temporary access detail은 수동 운영자 경로에서 검증한 동일한 bounded
SSH capability를 CI로 옮기면서 장기 cloud/SSH secret을 GitHub에 추가하지
않는다. 보호된 production PR merge는 private repository에서 Environment
required reviewer 지원 여부와 독립적인 변경 승인 기록이 된다. GitHub-hosted
runner는 production host에 새 daemon이나 workflow executor를 상주시킬 필요가
없다.

## Consequences

### Positive

- Orca와 CloudShell UI 장애가 배포를 차단하지 않는다.
- commit, PR, Actions run과 production release SHA를 연결할 수 있다.
- AWS와 SSH credential이 job마다 짧게 발급되고 만료된다.
- 기존 release manager와 rollback contract를 재사용한다.

### Negative

- GitHub Actions, GitHub OIDC, AWS IAM trust와 Lightsail access-detail이라는
  control plane 의존성이 추가된다.
- GitHub-hosted runner에서 production SSH 22 접근이 가능해야 한다.
- branch/ruleset 오구성이 production deploy authority를 넓힐 수 있다.
- `develop`/`production` 승격과 hotfix 역병합 절차가 필요하다.

### Risks

- workflow 파일을 변경할 수 있는 production merge가 deployment role code도
  변경할 수 있다.
- OIDC trust의 wildcard 또는 잘못된 environment subject가 다른 ref에 권한을
  줄 수 있다.
- temporary access JSON, private key나 certificate가 Actions log/artifact에
  유출될 수 있다.
- 두 production push가 겹치면 current/previous rollback target이 흔들릴 수
  있다.
- application deploy가 migration이나 secret change를 암묵적으로 수행하면
  기존 approval gate를 우회한다.

## Validation

- workflow lint와 action SHA pin 검사
- PR CI에는 `id-token: write`와 AWS call이 없음을 검사
- disposable or no-op IAM simulation으로 exact production subject만 assume 허용
- 다른 repository/ref/environment, no OIDC, wrong audience와 wildcard subject 거부
- exact Lightsail target read/access-detail 허용; 다른 instance, region, lifecycle,
  IAM, S3, DNS, firewall와 snapshot action 거부
- synthetic temporary access fixture로 private key/certificate/host-key file mode,
  strict host checking, stdout/stderr redaction과 cleanup 검증
- disposable Ubuntu fixture에서 stage, activation, health failure rollback,
  concurrent deployment serialization과 immutable file count 검증
- production bootstrap은 metadata-only preflight 후 별도 owner 승인

## Rollback or migration

Workflow를 비활성화하고 production branch protection을 유지한 채 기존 named
human operator/CloudShell runbook으로 돌아간다. AWS CI role trust를 먼저
비활성화한 뒤 role/provider를 제거한다. Host의 systemd, credential, current와
previous release는 변경하지 않는다. 실패한 deploy는 migration을 되돌리지
않고 previous symlink를 재활성화한다.

Branch bootstrap은 `develop`을 current reviewed candidate에, `production`을
pre-candidate deployed-source baseline에 생성한다. 첫 승격은 별도 PR로 수행한다.
Hotfix는 production에서 직접 개발하지 않고 reviewed commit을 두 branch에
동일하게 적용한다.

## Conditions for reconsideration

- Lightsail temporary access detail이 GitHub-hosted runner에서 신뢰성 있게
  동작하지 않는다.
- GitHub Actions 또는 AWS OIDC outage가 허용 가능한 배포 시간보다 길다.
- 여러 host/region 또는 signed image registry가 필요해진다.
- production SSH public exposure를 제거해야 하며 outbound-poll runner 또는
  다른 deployment service가 더 작은 경계를 제공한다.

## Approval

- Owner decision: Approved — protected `develop`/`production` promotion,
  GitHub-hosted Actions, branch-bound OIDC and temporary host-key-pinned
  Lightsail SSH access
- Approved date: 2026-07-28
