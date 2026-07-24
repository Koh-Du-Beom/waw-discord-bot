# Caddy HTTPS ingress Spike

- 상태: Completed
- 일자: 2026-07-22
- 연결 결정: `ADR-0012`
- 가설: Caddy가 credential 없이 local CA를 사용해 HTTPS를 종료하고 loopback-compatible fixture로 proxy하면서 redirect, hostname deny, graceful reload와 민감 로그 redaction을 만족한다.
- 비범위: `waw.dubeom.com` DNS, public ACME certificate, production Lightsail/firewall, OAuth/Discord/Supabase credential, production package 설치

## 성공 기준

- Caddy `2.11.4` configuration validation이 성공하고 의도적으로 잘못된 config는 거부된다.
- HTTP 요청은 synthetic hostname의 HTTPS endpoint로 permanent redirect된다.
- Local CA를 신뢰한 HTTPS health 요청이 fixture에 도달하고 원래 Host와 `X-Forwarded-Proto=https`를 유지한다.
- 다른 hostname은 certificate hostname validation으로 실패한다.
- Authorization, Cookie와 OAuth-like `code`/`state` fixture가 access log 원문에 남지 않고 redaction marker가 남는다.
- Config reload 전후 container PID는 같고 response version만 v1→v2로 바뀐다.
- Caddy RSS가 96MiB 미만이고 종료 뒤 container, listener, temporary CA/config/log와 새로 받은 image가 정리된다.

## 실행

Docker Desktop이 실행 중인 macOS/Linux 개발 환경에서 다음을 실행한다.

```bash
./run-caddy-https-ingress-spike.sh
```

Runner는 `caddy:2.11.4-alpine` official image를 사용한다. 기존에 image가 없었던 경우에만 종료 시 해당 image를 제거한다. 실제 secret은 사용하지 않으며 출력 marker에는 credential이나 request header 값이 포함되지 않는다.

## 실행 결과

2026-07-22 Docker Desktop의 official `caddy:2.11.4-alpine` image에서 실행했다. 이는 production Docker 배포 선택이 아니라 macOS에서 Linux Caddy binary와 filesystem을 격리하기 위한 research harness다.

최종 실행 marker:

```text
config_validation_passed
http_redirect_passed
proxy_header_boundary_passed
wrong_hostname_denied
sensitive_log_redaction_passed
graceful_reload_passed
caddy_rss_kib=52572
caddy_https_ingress_spike_passed
cleanup_container_count=0
cleanup_temp_count=0
```

Local CA를 신뢰한 `waw-spike.invalid` HTTPS 요청은 loopback-bound Node fixture로 전달됐고 original Host, `X-Forwarded-Host`와 `X-Forwarded-Proto=https`가 확인됐다. HTTP는 synthetic HTTPS endpoint로 `308` redirect됐으며 다른 hostname은 certificate validation에서 실패했다. 의도적으로 잘못된 Caddyfile은 거부됐다.

Authorization, Cookie와 OAuth-like `code`/`state`에 synthetic marker를 넣었지만 access log 원문에는 남지 않았고 `REDACTED` marker만 남았다. Reload 전후 container PID는 유지되고 response header만 v1에서 v2로 바뀌었다. Caddy RSS `52,572 KiB`는 Spike 상한 `96 MiB`보다 낮았다.

초기 실패는 개발 환경 proxy 우회 누락과 protocol status-line 문자열에 의존한 redirect 판정, macOS Docker bind mount에서 `sed -i`가 inode를 교체한 reload harness, cleanup 중 무해한 nonzero command를 ERR marker로 오인한 문제였다. 각각 `--noproxy '*'`, curl status/redirect URL read-back, same-inode overwrite, cleanup ERR trap 해제로 보정했다. 모든 실패 실행도 container/temp count `0`을 확인한 뒤 재실행했다.

최종 별도 absence 검사에서 matching container, ports `18080`/`18443`/`19080`, temporary directory와 새로 받은 Caddy image가 모두 없었다. Production DNS, certificate, Lightsail firewall과 credential에는 접근하지 않았다.
