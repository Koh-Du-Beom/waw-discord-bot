# ADR-0012: Caddy로 단일 host HTTPS ingress 운영

- Status: Proposed
- Date: 2026-07-22
- Owners: Project owner
- Related requirements: `SEC-001`~`SEC-006`, `SEC-010`, `OPS-001`~`OPS-004`, `DEP-001`~`DEP-002`
- Related research: `docs/research/technology-options/lightsail-https-ingress-options.md`
- Supersedes: None
- Superseded by: None

## Context

Accepted `ADR-0010`은 Fastify API와 Vite/React Router SPA를, `ADR-0011`은 서울 1GB Lightsail의 systemd 직접 배포를 선택했다. Fastify는 loopback-only로 유지하면서 canonical `https://waw.dubeom.com`의 TLS 종료, certificate 갱신과 HTTP redirect를 담당할 ingress가 필요하다.

## Decision drivers

- Public plaintext 없이 canonical HTTPS와 OAuth secure-cookie 경계 제공
- Fastify port를 public firewall에 열지 않는 default-deny 구조
- 1GB host와 월 3만 원 총예산에서 component·고정비 최소화
- 자동 certificate renewal, config validation, graceful reload와 systemd 복구
- Clean-host 복원과 Nginx/LB로의 명확한 전환 경로

## Considered options

### Option A: Caddy systemd service

Caddy가 80/443을 소유하고 Automatic HTTPS와 redirect를 관리하며 loopback Fastify로 reverse proxy한다.

### Option B: Nginx와 Certbot

Nginx가 proxy/TLS를 담당하고 Certbot timer와 deploy hook이 certificate issuance·renewal을 담당한다.

### Option C: Lightsail load balancer

Lightsail managed certificate를 월 USD 18 load balancer에 attach하고 instance로 proxy한다.

## Decision

첫 MVP HTTPS ingress로 **Caddy systemd service**를 사용한다.

- Caddy만 public 80/443을 bind하고 Fastify는 `127.0.0.1`의 고정 high port만 bind한다.
- Canonical site label은 `waw.dubeom.com` 하나이며 HTTP는 HTTPS로 redirect한다.
- Caddyfile은 root-owned configuration으로 version control/template에서 관리하고 배포 전 `caddy validate`를 통과시킨다.
- Caddy package와 service version을 inventory에 기록하고 upgrade는 certificate expiry, health와 rollback gate를 거친다.
- Access log에는 cookie, authorization header, OAuth code, session identifier와 request body를 남기지 않는다. 구체적 log retention/alert는 D-11 ADR에서 정한다.
- Caddy certificate state는 application release와 분리하고, clean host에서는 DNS control을 전제로 재발급한다.

## Rationale

Caddy는 certificate issuance/renewal, HTTP redirect와 reverse proxy를 한 systemd component로 제공한다. Nginx+Certbot은 같은 기능을 제공하지만 certificate renewal과 web server reload라는 두 lifecycle을 운영한다. Lightsail load balancer는 단일 instance MVP에 월 USD 18 고정비와 추가 resource를 만든다.

## Consequences

### Positive

- Fastify와 application secret을 public listener에서 분리한다.
- TLS/renewal/reverse proxy의 configuration과 health surface가 작다.
- 기존 systemd/journald 운영 모델을 재사용한다.
- 별도 load balancer 고정비가 없다.

### Negative

- Caddy package source와 ACME state를 host runbook에서 관리한다.
- TLS availability가 단일 host와 public 80/443 reachability에 묶인다.
- Managed load balancer의 independent health와 multi-instance failover를 얻지 못한다.

### Risks

- DNS가 잘못된 host를 가리키거나 firewall이 challenge traffic을 막으면 issuance/renewal이 실패한다.
- Proxy/header 신뢰 설정이 과도하면 spoofed client identity가 authorization/log에 들어갈 수 있다.
- Certificate log나 access log에 민감한 query/header를 남길 수 있다.
- Caddy와 application을 함께 잘못 reload하면 전체 dashboard ingress가 중단된다.

## Validation

- Credential-free loopback fixture에서 config validation, HTTP→HTTPS, proxy health, header boundary와 graceful reload
- Owner-approved DNS window에서 canonical hostname certificate issuance와 mismatch 실패
- Certificate expiry/renewal 상태 관측과 failure alert contract
- 1GB host에서 Caddy 포함 idle/request RSS와 reboot recovery
- Firewall read-back에서 public application port 부재와 80/443만 확인

## Rollback or migration

이전 Caddyfile/package version으로 rollback하고 application loopback contract는 유지한다. Nginx+Certbot 또는 Lightsail load balancer로 전환할 때 한 시점에 하나의 ingress만 80/443과 canonical DNS authority를 갖게 하며 certificate/private key를 application release에 복사하지 않는다.

## Conditions for reconsideration

- Caddy issuance/renewal 또는 clean-host 복원이 반복 실패한다.
- Multi-instance failover, WAF/CDN 또는 managed origin health가 요구된다.
- Nginx 운영 표준과 renewal monitoring이 이미 필요해 두-component 비용이 사라진다.
- 월 USD 18 load balancer 비용이 availability 요구와 총예산 안에서 정당화된다.

## Approval

- Owner decision: Pending
- Approved date:
