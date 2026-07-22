# 서울 Lightsail HTTPS ingress 선택지

- 상태: Research complete — owner decision pending
- 확인일: 2026-07-22
- 연결 결정: D-10, D-11, `ADR-0010`, `ADR-0011`
- 연결 요구사항: `SEC-001`~`SEC-006`, `SEC-010`, `OPS-001`~`OPS-004`, `DEP-001`~`DEP-002`

## 고정 제약

- Canonical production origin은 `https://waw.dubeom.com`이다.
- Fastify는 host의 loopback에만 listen하고 public TLS ingress만 이를 호출한다.
- 첫 MVP는 서울 1GB Lightsail 한 대와 systemd 직접 배포를 사용한다.
- Browser session, OAuth callback과 관리자 요청은 plaintext public ingress를 허용하지 않는다.
- 총 월 예산은 VM, domain, backup과 AI를 포함해 3만 원 목표이므로 별도 고정비는 강한 근거가 있어야 한다.

## 대안 비교

| 대안 | TLS와 갱신 | 운영면 | 1GB/비용 적합성 | 주요 위험 |
|---|---|---|---|---|
| Caddy systemd | Domain이 host를 가리키고 80/443이 열리면 public certificate와 HTTP→HTTPS redirect를 자동 관리한다. | Caddy package/service와 Caddyfile 하나. `reverse_proxy 127.0.0.1:<port>`가 기본 HTTP upstream을 사용한다. | 별도 managed resource 고정비가 없고 기존 systemd 운영면과 맞는다. 실제 RSS와 issuance/reload는 Spike 필요. | 자동화가 DNS/firewall/ACME availability에 의존한다. Package source, config validation, state backup 제외 원칙과 rate-limit 실패를 runbook에 넣어야 한다. |
| Nginx + Certbot | Nginx가 TLS key/certificate를 읽고 Certbot이 별도 renewal lifecycle을 담당한다. | Nginx config, certificate file permission, Certbot timer/hook를 함께 운영한다. | 별도 cloud 고정비는 없지만 두 component와 renewal hook이 추가된다. | Renewal 성공과 Nginx reload가 분리돼 만료·reload 실패를 별도로 감시해야 한다. |
| Lightsail load balancer + managed certificate | AWS certificate를 load balancer에 attach해 TLS를 종료한다. | Certificate validation과 LB health/DNS를 AWS에서 관리한다. | 공식 고정비가 월 USD 18이어서 현재 전체 예산에 비해 크다. | 단일 instance 앞에 별도 resource와 비용을 추가하고 LB→instance 구간과 origin port 제한을 별도로 설계해야 한다. |

## 공식 근거

- Caddy는 hostname을 가진 site에 Automatic HTTPS를 기본 적용하며, public certificate 발급에는 DNS가 server를 가리키고 80/443이 공개되어야 한다. [Caddy reverse proxy quick-start](https://caddyserver.com/docs/quick-starts/reverse-proxy), [Automatic HTTPS option](https://caddyserver.com/docs/caddyfile/options#auto-https)
- Caddy의 Debian/Ubuntu package는 systemd service를 설치하며 production에서는 service 실행을 권장한다. [Caddy install](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)
- Caddy `reverse_proxy`는 `127.0.0.1` upstream을 지원하고 기본 upstream transport는 plaintext HTTP이다. 동일 host loopback이므로 public TLS 종료 뒤 별도 certificate boundary를 만들지 않는다. [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- Nginx는 `proxy_pass`로 localhost upstream을 호출할 수 있지만 HTTPS server에는 certificate와 restricted private-key file을 명시해야 한다. [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Nginx HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- Certbot은 설치 방식에 따라 automatic renewal을 제공하지만 certificate renewal과 web server integration은 별도 component다. [Certbot documentation](https://eff-certbot.readthedocs.io/en/stable/)
- Lightsail certificate는 load balancer, distribution 또는 container service에 attach해야 하며 load balancer 가격은 월 USD 18이다. [Lightsail TLS certificates](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-tls-ssl-certificates-in-lightsail-https.html), [Lightsail billing FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html)

## 잠정 결론

첫 MVP에는 **Caddy를 별도 systemd ingress service로 두는 선택**이 가장 작은 운영면이다. Fastify는 `127.0.0.1`에 유지하고 Lightsail firewall은 public TCP 80/443과 제한된 관리 SSH만 허용한다. Caddy의 certificate state는 재발급 가능한 운영 state로 취급하며 application release나 DB backup에 섞지 않는다.

Nginx+Certbot은 strongest alternative다. 이미 Nginx 운영 표준과 renewal monitoring이 있거나 Caddy package/ACME 동작이 clean-host Spike에서 실패하면 선택 우위가 바뀐다. Lightsail load balancer는 multi-instance, managed TLS availability 또는 origin shielding이 월 USD 18을 정당화할 때 재검토한다.

## 승인 후 검증

1. Synthetic hostname/local CA로 Caddy→loopback Fastify-compatible fixture, header/redirect, config validation과 graceful reload를 먼저 검증한다.
2. Owner가 DNS 변경 시점을 승인한 뒤 `waw.dubeom.com` A/AAAA, static IP와 80/443 firewall inventory를 read-back한다.
3. Production credential 없이 public certificate issuance, HTTP→HTTPS, hostname mismatch deny와 renewal dry-run/expiry 관측을 검증한다.
4. Caddy/fixture의 idle·request RSS를 기존 1GB envelope에 합산하고 rollback 뒤 temporary config/artifact를 정리한다.

DNS 변경과 public certificate 발급은 owner 승인 전 실행하지 않는다.
