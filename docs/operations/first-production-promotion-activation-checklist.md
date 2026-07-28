# 최초 production 승격 활성화 체크리스트

- 상태: 초안 — 실행 미승인
- 관련 결정: ADR-0024, PLAN-0011
- 트리거: `production` 브랜치 push
- 워크플로: `Deploy production`
- 정식 도메인: `https://waw.dubeom.com`

이 체크리스트는 최초 `develop` → `production` 승격과 최초 실제 GitHub Actions
배포를 준비하기 위한 문서다. 브랜치 변경, 워크플로 실행, SSH 접속, production
변경, 장애 주입 또는 rollback rehearsal을 승인하지 않는다.

## 성공 기준

다음 항목을 모두 증명해야 활성화에 성공한 것으로 판정한다.

- Owner가 정확한 후보 SHA, 유지보수 시간, rollback 담당자와 보호되지 않은
  `production` 브랜치의 위험을 승인했다.
- 동일한 SHA의 최신 CI가 통과했고 PostgreSQL 통합 테스트 제외 범위를 전체
  검증으로 오해하지 않도록 기록했다.
- 검토된 승격을 통해 `production`이 승인된 SHA로 이동했으며 관련 없는 commit이
  포함되지 않았다.
- 정확히 하나의 `Deploy production` 실행이 동일한 SHA를 배포했다.
- 워크플로가 archive SHA-256을 검증하고 immutable release를 stage 및
  activate한 뒤 두 application service를 재시작해 `healthy` 상태를 반환했다.
- `/opt/waw/current`는 후보 release를 가리키며 `/opt/waw/previous`에는 후보와
  다른 유효한 rollback release가 남아 있다.
- Backup·monitoring timer가 계속 enabled·active 상태이며 정식 HTTPS health와
  bot singleton/Gateway 경계가 정상이다.
- Migration, credential 변경, feature 활성화, firewall/DNS 변경과 journald
  vacuum이 모두 `0`이다.
- Runner와 host의 임시 배포 파일이 제거됐고 수집한 증거에 secret이 없다.

정상 경로가 성공해도 자동 rollback 경로까지 증명되는 것은 아니다. 통제된 장애
rehearsal은 별도 Owner 승인 게이트다.

## Gate 0 — 활성화 작업 식별

- [ ] 정확한 40자리 후보 commit을 기록한다:
      `________________________________________`.
- [ ] 예상 12자리 release ID를 기록한다:
      `____________`.
- [ ] 유지보수 시작·종료 시각을 UTC와 Asia/Seoul로 기록한다.
- [ ] 승격 실행자와 별도의 rollback 담당자를 지정한다.
- [ ] Actions 실행 관찰자를 지정한다.
- [ ] Rollback 담당자가 credential을 공유하거나 출력하지 않고 named human
      break-glass 경로를 사용할 수 있는지 확인한다.
- [ ] Owner가 이 정확한 한 번의 승격에 대해 현재 보호되지 않은 `production`
      브랜치의 위험을 명시적으로 수락한다.
- [ ] Owner가 정상 배포 경로만 승인한다. Migration, credential rotation,
      feature 활성화, DNS/firewall 변경, journal vacuum 또는 의도적인 장애
      주입을 같은 작업에 포함하지 않는다.

후보, 작업 시간, 담당자 또는 위험 수락 중 하나라도 없으면 중단한다.

## Gate 1 — Immutable 후보와 저장소 상태

읽기 전용 확인:

```sh
git fetch origin --prune
git status --short --branch
git rev-parse origin/develop
git rev-parse origin/production
git log --oneline origin/production..origin/develop
git diff --check origin/production..origin/develop
```

- [ ] Worktree가 깨끗하며 local-only 파일이 결정 범위에 포함되지 않았다.
- [ ] `origin/develop`이 승인된 후보 SHA와 일치한다.
- [ ] `origin/production`이 기록된 이전 release와 일치한다.
- [ ] 후보가 force push나 관련 없는 이력 없이 이전 commit에서 이어진다.
- [ ] 검토된 diff에 migration 실행, application secret 변경, production feature
      활성화 또는 정식 도메인 변경이 없다.
- [ ] `.github/workflows/deploy-production.yml`이 계속 `production` push에서만
      실행되고 `contents: read`, `environment: production`,
      `waw-production`, `cancel-in-progress: false`를 사용한다.
- [ ] Checkout과 setup action이 검토된 전체 commit SHA에 고정돼 있다.
- [ ] 앞 단계가 실패해도 `always()` 단계에서 runner의 임시 SSH 파일을
      제거한다.

Worktree가 깨끗하지 않거나 SHA·이력·workflow 권한이 예상과 다르면 중단한다.

## Gate 2 — 정확한 SHA의 CI 증거

```sh
gh run list --workflow ci.yml --branch develop --limit 10
```

- [ ] 정확한 후보 SHA에 대해 완료된 성공 CI가 있다.
- [ ] `npm ci`, test, typecheck, build, 고정된 Chromium browser 검사,
      production dependency audit, application-assets fixture,
      release-manager fixture, SSH deployment-controller fixture와 diff check가
      모두 통과했다.
- [ ] 일반 CI의 `WAW_SKIP_POSTGRES_INTEGRATION=1` 제외 범위를 기록했다.
- [ ] Migration 관련 변경이 있다면 별도 PostgreSQL 통합 검증 증거가 있다.
      없다면 일반 CI만으로 충분하지 않으므로 중단한다.
- [ ] 승인을 모호하게 만드는 pending 상태 또는 더 최신 후보가 없다.

## Gate 3 — 연결 및 배포 권한 사전점검

- [ ] Repository variable 이름은 `LIGHTSAIL_HOST`와 `LIGHTSAIL_USER`다.
- [ ] Repository secret 이름은 `LIGHTSAIL_DEPLOY_SSH_KEY`와
      `LIGHTSAIL_SSH_KNOWN_HOSTS`다.
- [ ] Deploy key는 배포 전용이며 독립적으로 폐기할 수 있고 사람의 operator
      key가 아니다.
- [ ] Pinned host-key record를 독립적으로 검증했다. 해당 값은 활성화 기록에
      복사하지 않는다.
- [ ] 최신 `Preflight production SSH` 실행이 동일한 variable·secret으로
      성공했고 원격에서는 `true`만 실행했다.
- [ ] Preflight log에서 두 secret이 마스킹됐으며 private key, known-host 본문,
      application credential 또는 session 정보가 없다.
- [ ] `waw-production` concurrency group에 실행 중이거나 대기 중인 workflow가
      없다.

기록된 preflight 성공 이후 host, user, key, host key 또는 관련 workflow가
변경된 경우에만 무변경 preflight를 다시 실행한다. 재실행에는 Owner 승인이
필요하지만 application 배포는 아니다.

## Gate 4 — Production 읽기 전용 준비 상태

이 점검에는 named human operator runbook을 사용한다. GitHub deploy key를
재사용하거나 외부로 내보내지 않는다.

- [ ] 현재 release와 previous release ID를 기록한다. 둘 모두
      `/opt/waw/releases` 아래로 resolve되고 서로 다르다.
- [ ] `waw-web.service`와 `waw-bot.service`가 active 상태다.
- [ ] Loopback `/health`가 HTTP 200과 `status=healthy`를 반환한다.
- [ ] `waw-backup.timer`와 `waw-monitor.timer`가 enabled·active 상태다.
- [ ] 두 timer의 최근 service가 성공했고 검증된 backup marker가 최신이다.
- [ ] Journald가 active이고 승인된 retention 설정이 변경되지 않았다. Vacuum은
      실행하지 않는다.
- [ ] Disk와 memory에 release 하나를 추가로 stage·build할 여유가 있다.
- [ ] 예상 unit 파일이 존재하고 뜻밖의 listener, release directory 충돌 또는
      credential path 충돌이 없다.
- [ ] 사용자 데이터가 포함된 응답 본문 없이 현재 정식 HTTPS health와 인증서
      결과를 기록한다.
- [ ] Metadata만 사용해 bot singleton/Gateway health 결과를 기록한다.

Service 장애, 오래된 backup, monitoring 실패, 유효하지 않은 rollback 대상,
용량 부족 또는 예상하지 못한 host 상태가 있으면 중단한다.

## Gate 5 — 최종 GO/NO-GO

- [ ] Owner가 Gate 0~4와 정확한 후보를 대조한 후 `GO`를 선언한다.
- [ ] 승격 실행자가 production push에 승인된 후보 이력만 포함됨을 확인한다.
- [ ] Rollback 담당자가 전체 유지보수 시간 동안 대기한다.
- [ ] 관찰자가 Actions 실행 페이지를 열고 run ID, SHA, 시각, 결론과 secret이
      없는 단계별 결과를 기록한다.
- [ ] 실패 시 즉시 `STOP`하며 증거를 덮는 재실행이나 force push를 하지 않기로
      합의한다.

이 문서에는 승격 명령이 포함되지 않는다. 명시적인 `GO` 이후에만 저장소의
검토된 branch promotion 절차를 사용한다.

## Gate 6 — 최초 실제 배포 관찰

Production push가 자동으로 workflow를 시작한다. 별도의 배포를 dispatch하거나
동시에 실행하지 않는다.

- [ ] 정확히 하나의 `Deploy production` 실행이 시작된다.
- [ ] 실행의 `headSha`가 승인된 40자리 후보와 일치한다.
- [ ] Checkout과 배포 권한 검증이 통과한다.
- [ ] Secret 노출 없이 SSH credential 준비가 완료된다.
- [ ] `Deploy exact commit`이 예상 12자리 release ID와 하나의 archive
      SHA-256을 보고한다.
- [ ] 원격 preflight가 변경 전에 서로 다른 current/previous release, active
      web/bot service, enabled·active backup/monitor timer와 정상 loopback
      health를 확인한다.
- [ ] Stage, unit 검증, activation, web restart, bot restart와 최종 health가
      성공한다.
- [ ] 앞 단계가 실패해도 runner SSH credential cleanup이 실행된다.
- [ ] 전체 workflow가 20분 제한 안에 끝난다.

즉시 중단 조건:

- SHA 또는 release ID 불일치
- Host-key, SSH, archive hash 또는 staged release 충돌
- 비정상 preflight, 없거나 변형된 rollback 대상 또는 inactive timer
- Unit 검증, service restart 또는 최종 health 실패
- Log에 secret 또는 application credential 노출
- 두 번째 production 실행 시작 또는 미승인 production 변경 발견

## Gate 7 — 배포 후 읽기 전용 인수검사

- [ ] Workflow 결론이 `success`다.
- [ ] `/opt/waw/current`가 예상 12자리 후보 release를 가리킨다.
- [ ] `/opt/waw/previous`가 Gate 4의 이전 current release를 가리키며 후보와
      다르다.
- [ ] 두 application service가 active이고 각각 의도한 process 하나만 가진다.
- [ ] Loopback `/health`가 HTTP 200과 `healthy`다.
- [ ] `https://waw.dubeom.com/health`가 HTTP 200과 `healthy`이며 TLS와 정식
      hostname이 유효하다.
- [ ] Bot singleton과 Discord Gateway health가 정상이다.
- [ ] Backup·monitoring timer가 enabled·active 상태이며 최근 service 결과가
      계속 성공이다.
- [ ] Journald가 active이고 vacuum이 실행되지 않았다.
- [ ] 이 배포에서 migration ledger, credential 파일, feature flag, Discord
      registration, DNS 또는 firewall 상태가 변경되지 않았다.
- [ ] `/tmp/waw-actions-<run>-<attempt>` directory가 남지 않았다.
- [ ] 예상하지 못한 failed unit 또는 새 public listener가 없다.

사용자 콘텐츠 smoke test는 delivery mechanism을 증명하는 데 필요하지 않다.
별도로 승인해 실행한다면 결과 metadata만 기록하고 Discord 메시지 본문, 요약
본문, token, cookie 또는 session identifier는 기록하지 않는다.

## 실패 및 rollback 처리

Activation 전에 실패하면 기존 active release를 보존하고 rollback이 필요하지
않았다고 기록한다. 분석을 위해 staged immutable release가 남을 수 있다. 별도
승인 없이 incident 도중 삭제하지 않는다.

Activation 시작 후 실패하면 remote controller가 기록된 previous release와 두
기존 unit 파일을 복구하고 systemd를 reload한 뒤 web과 bot을 재시작하고
workflow를 실패로 종료해야 한다.

- [ ] Rollback 담당자가 상태를 확인하기 전에는 workflow를 재실행하지 않는다.
- [ ] `/opt/waw/current`가 Gate 4의 기존 current release와 일치하는지 확인한다.
- [ ] 두 기존 unit 파일이 복구됐는지 확인한다.
- [ ] Web/bot active 상태, singleton/Gateway 및 loopback/정식 health를 확인한다.
- [ ] Backup, monitoring과 journald가 계속 정상인지 확인한다.
- [ ] 실패 단계와 함께 rollback 결과를 `PASS`, `FAIL` 또는 `NOT_REQUIRED`로
      기록한다.
- [ ] Rollback이 실패하면 필요한 경우 application Caddy route를 비활성화하고
      named human break-glass runbook을 사용한다. Deploy key 무결성이
      의심되면 key를 폐기한다.
- [ ] 호환 가능한 database migration을 자동으로 되돌리지 않는다.

실패 후 production이 복구됐다는 이유만으로 CD 검증 완료로 처리하지 않는다.
정상 경로와 rollback 경로의 증거를 따로 기록한다.

## 별도 rollback rehearsal 게이트

최초 정상 배포는 실제 정상 경로만 증명하며 의도적인 장애 복구는 증명하지
않는다. 통제된 rollback rehearsal에는 다음 사항을 정의하는 새로운 Owner
승인이 필요하다.

- 이미 배포된 정확한 release와 서로 다른 rollback 대상
- Data, credential, migration, provider call 또는 public routing을 건드리지
  않는 synthetic failure 지점과 그 증거
- 유지보수 시간, rollback 담당자, 최대 중단 시간과 중단 기준
- 예상 service restart 횟수와 정확한 cleanup
- Rollback 후 기존 상태 유지 또는 후보 재활성화 결정

Rollback 시험을 위해 잘못된 archive, unit 편집, health endpoint 변경, process
kill 또는 branch rewrite를 즉흥적으로 수행하지 않는다.

## 증거 기록

다음을 기록한다.

- 후보와 이전 commit의 40자리 SHA
- CI, preflight와 deployment run ID 및 link
- 변경 전후 production ref
- Archive SHA-256과 12자리 release ID
- 유지보수 시작·종료 시각과 담당자
- 변경 전후 current/previous release ID
- 단계별 결론, health, timer/service 상태와 rollback 결과
- Migration, credential 변경, feature 활성화, provider call, DNS/firewall 변경,
  journald vacuum이 각각 `0`이라는 기록
- 임시 파일 cleanup 결과와 미해결 문제

Private/public key 본문, known-host 출처 응답, application credential, token,
cookie, OAuth code, session identifier, Discord 메시지 본문, provider payload
또는 전체 environment/process 출력은 기록하지 않는다.

## 완료 상태 분류

- **READY:** Gate 0~4가 통과했고 production 변경은 발생하지 않았다.
- **SUCCESS PATH VERIFIED:** 정확한 후보에 대해 Gate 0~7이 통과했다.
- **ROLLBACK OBSERVED:** 자연스러운 activation 후 실패가 정확한 이전 release를
  복구했고 모든 실패 후 검사가 통과했다.
- **ROLLBACK REHEARSAL VERIFIED:** 별도로 승인된 통제 rehearsal이 통과했다.
- **STOPPED:** 중단 조건 또는 증거 공백이 하나라도 있다.

정상 경로가 검증되기 전에는 CI/CD가 완전히 검증됐다고 표현하지 않는다.
정상 경로가 검증된 후에도 PostgreSQL 통합 테스트 범위와 rollback rehearsal
상태를 명시적으로 보고한다.
