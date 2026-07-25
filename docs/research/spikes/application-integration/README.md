# Application systemd integration Spike

- 상태: Prepared — G4 owner approval 전 AWS resource 미생성
- 일자: 2026-07-25
- 연결 계획: `PLAN-0004` Task 5
- 비범위: production host, production Supabase/Discord/OAuth credential, DNS,
  public certificate, firewall 80/443 공개와 production migration `0003`

## 목적

Ubuntu 24.04/1GB disposable host에서 exact Node.js 24.18.0, PostgreSQL 17,
built product artifact, synthetic-only web/bot integration entrypoint, systemd
`LoadCredential=`, Caddy loopback proxy와 immutable release rollback을 함께
검증한다.

## 준비된 검증

[`run-host-integration.sh`](./run-host-integration.sh)는 repository root에서
root로 실행한다. 다음을 검증한다.

- exact Node archive SHA-256과 lockfile clean install, typecheck, build,
  non-PostgreSQL tests와 high-severity audit absence
- web/bot 별도 user와 credential allowlist, process argument/environment/journal
  synthetic canary 부재
- Fastify `127.0.0.1:18080` bind와 Caddy-only ingress
- PostgreSQL connected/unavailable health 전이
- duplicate bot exit `73`, web crash restart와 failed release rollback
- web/bot 256MiB cgroup ceiling
- 기존 backup/monitor/journald asset byte-for-byte 보존

Actual AWS runner, reboot recovery와 final resource cleanup evidence는 G4 승인 뒤
별도 실행 결과로 이 문서에 추가한다.

승인 뒤 local committed source를 `waw-application-source.tgz`로 만들고 Orca
내장 브라우저의 AWS CloudShell에 archive와
[`run-aws-spike.sh`](./run-aws-spike.sh)를 업로드한다. Runner는 서울
`micro_3_0` instance와 일회용 key만 만들고 SSH를 CloudShell egress `/32`로
제한한다. 종료 trap은 instance, key, static IP, disk와 snapshot의 prefix
count가 모두 `0`이 될 때까지 확인한다.

## 공식 공급 근거

- Node.js 24.18.0 LTS release의 Linux x64 archive와 공개 SHA-256을 고정한다.
- PostgreSQL 공식 Ubuntu Apt repository의 Noble 지원 경로로 PostgreSQL 17을
  설치한다.
