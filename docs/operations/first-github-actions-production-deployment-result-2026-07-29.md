# 최초 GitHub Actions production 배포 결과 — 2026-07-29

- 상태: 실패 — 자동 rollback 확인
- 후보 commit: `464eb99542dfdc375cd75af1efcf29f1938e204e`
- 후보 release: `464eb99542df`
- 이전 active release: `bb53cf2`
- 이전 rollback release: `f08089f`
- GitHub Actions run: `30408412211`
- Production ref: `464eb99542dfdc375cd75af1efcf29f1938e204e`

## 결과

Owner가 보호되지 않은 `production` branch 위험과 정확한 후보를 승인했고
rollback 담당자를 Koh-Du-Beom으로 지정했다. Gate 4 read-only 점검에서 기존
release 경계, service/timer, backup/monitoring, marker freshness, health,
capacity, listener와 credential metadata가 모두 PASS했다.

`production`을 후보 commit으로 fast-forward한 뒤 정확히 하나의
`Deploy production` run이 시작됐다. Checkout, deployment authority, SSH
credential 준비, exact archive stage, typecheck, build와 activation은
성공했다. Archive SHA-256은
`3009174476bbbab8e72ad52fbc0c8be894af7b83e1a6516280bf96e29ec46c3a`였다.

Activation 직후 loopback `127.0.0.1:18080` 연결이 거부돼 workflow가
실패했다. Controller는 current symlink를 `bb53cf2`로 되돌리고 이전 unit
파일을 복구한 뒤 web과 bot을 재시작했다. Runner SSH credential cleanup도
성공했다. Workflow를 재실행하지 않았다.

Rollback 담당자의 read-only 확인 결과:

- `/opt/waw/current`: `/opt/waw/releases/bb53cf2`
- `waw-web.service`: `active`
- `waw-bot.service`: `active`
- loopback `/health`: `{"status":"healthy"}`
- canonical `/health`: HTTP `200`, `{"status":"healthy"}`

따라서 `ROLLBACK OBSERVED=PASS`로 판정한다. 정상 CD 경로는 아직 검증되지
않았다.

## 판단

로그에서 restart와 단일 health probe 사이의 대기 또는 retry가 없으며
activation 후 약 0.3초 만에 연결 거부가 발생했다. Startup readiness race가
가장 유력한 원인이지만, 수정 전에는 확정 원인으로 간주하지 않는다. Service
journal 본문이나 credential을 추가 수집하지 않았다.

재배포 전에 bounded health retry를 설계하고 synthetic fixture로 delayed-start
성공, timeout 실패와 automatic rollback을 검증해야 한다. `production` ref는
후보를 가리키지만 host의 active release는 rollback된 `bb53cf2`이므로 상태를
혼동하지 않는다.

## 후속 조치

Activation 후 loopback health를 5초 간격, 최대 12회(약 2분 경계) 확인하는 bounded
readiness helper를 추가했다. Delayed-start와 timeout synthetic fixture는
로컬에서 통과했으며 timeout은 기존 activation `ERR` trap의 automatic
release·unit rollback을 유지한다. Production 재실행은 아직 수행하지 않았다.

## 변경하지 않은 범위

- Migration: `0`
- Application credential 변경: `0`
- Feature activation: `0`
- Provider call: `0`
- DNS/firewall 변경: `0`
- Journald vacuum: `0`
- 재배포: `0`

Secret, private key, known-host 본문, application credential, Discord 메시지
본문과 provider payload는 기록하지 않았다.
