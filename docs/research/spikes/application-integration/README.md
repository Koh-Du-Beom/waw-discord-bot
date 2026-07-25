# Application systemd integration Spike

- 상태: Passed — G4 owner-approved disposable AWS integration 완료
- 일자: 2026-07-25
- 연결 계획: `PLAN-0004` Task 5
- 비범위: production host, production Supabase/Discord/OAuth credential, DNS,
  public certificate, firewall 80/443 공개와 production migration `0003`

## 목적

Ubuntu 24.04/1GB disposable host에서 exact Node.js 24.18.0, PostgreSQL 17,
built product artifact, synthetic-only web/bot integration entrypoint, systemd
`LoadCredential=`, Caddy loopback proxy와 immutable release rollback을 함께
검증한다.

## 검증 범위

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

Local committed source를 `waw-application-source.tgz`로 만들고 Orca
내장 브라우저의 AWS CloudShell에 archive와
[`run-aws-spike.sh`](./run-aws-spike.sh)를 업로드한다. Runner는 서울
`micro_3_0` instance와 일회용 key만 만들고 SSH를 CloudShell egress `/32`로
제한한다. 종료 trap은 instance, key, static IP, disk와 snapshot의 prefix
count가 모두 `0`이 될 때까지 확인한다.

## 2026-07-25 G4 실행 결과

- Owner가 서울 `ap-northeast-2`의 disposable Ubuntu 24.04
  `micro_3_0` 인스턴스와 일회용 SSH key 생성을 승인했다.
- CloudShell caller는 `waw-spike-operator`였고 SSH는 실행 당시 CloudShell
  egress `/32`에만 열었다. Production host, DNS, Supabase, Discord/OAuth
  credential과 production firewall은 사용하거나 변경하지 않았다.
- Exact Node.js 24.18.0 install, lockfile clean install, typecheck, build,
  non-PostgreSQL tests `124/124`, high-severity audit absence와 PostgreSQL 17
  fixture를 통과했다.
- Loopback web/storage health, service별 runtime credential 파일명 allowlist,
  process argument/environment/journal synthetic canary 부재, duplicate bot exit
  `73`, web crash restart, PostgreSQL unavailable health, failed-release rollback,
  256MiB cgroup ceiling과 existing operations asset 보존을 통과했다.
- 실제 reboot 뒤 변경된 boot ID, web/bot enabled·active와 connected storage
  health를 확인해 `reboot_recovery_passed`와
  `application_aws_integration_passed`를 기록했다.
- 실행 중 fresh Caddy package default 충돌, release directory traversal,
  PostgreSQL peer-role 불일치, systemd runtime credential introspection과
  restart-listener race를 발견해 production-free runner의 검증을 보정했다.
  각 실패 실행도 종료 trap으로 정리한 뒤에만 다음 실행을 시작했다.
- Final trap과 별도 read-only inventory 모두 instance, key, static IP, disk,
  snapshot prefix count `0`을 반환했다. CloudShell source/derived archive와
  extracted runner도 제거했다.

## 공식 공급 근거

- Node.js 24.18.0 LTS release의 Linux x64 archive와 공개 SHA-256을 고정한다.
- PostgreSQL 공식 Ubuntu Apt repository의 Noble 지원 경로로 PostgreSQL 17을
  설치한다.
