# `d6a27c0` production 재배포 활성화 체크리스트

- 상태: **STOPPED — rollback release 경계 확인·복구 필요**
- 후보 commit: `d6a27c0bef4aa74f689b48a3e67899d936a52fe1`
- 예상 release: `d6a27c0bef4`
- 현재 production ref: `464eb99542dfdc375cd75af1efcf29f1938e204e`
- develop CI: `30411214419` — `success`
- 이전 실패 deploy: `30408412211`
- 관찰된 host current: `bb53cf2`
- 정식 도메인: `https://waw.dubeom.com`

이 문서는 기존
`docs/operations/first-production-promotion-activation-checklist.md`의 재배포
전용 보충 checklist다. Production push, workflow 실행, SSH 접속, host 변경,
재실행 또는 rollback rehearsal을 승인하지 않는다.

## 현재 blocker

첫 실패에서 release manager의 `activate`는 당시 current였던 `bb53cf2`를
`previous`로 기록한 뒤 candidate를 current로 전환했다. 자동 rollback은
current만 `previous`가 가리키던 `bb53cf2`로 되돌린다. 따라서 rollback 직후
current와 previous가 모두 `bb53cf2`일 수 있다.

현재 remote deployment preflight는 current와 previous가 서로 달라야 한다.
둘이 같으면 `invalid_release_preflight`로 activation 전에 중단한다. Host의
실제 previous 값은 첫 실패 후 기록되지 않았으므로 추정으로 GO 처리하지 않는다.

## Gate R0 — 정확한 후보와 범위

- [x] `origin/develop`은 정확히
      `d6a27c0bef4aa74f689b48a3e67899d936a52fe1`다.
- [x] `origin/production`은 정확히
      `464eb99542dfdc375cd75af1efcf29f1938e204e`다.
- [x] 승격 diff는 실패 결과와 Gate 4/checklist 문서, bounded readiness,
      current/previous rollback 복구와 관련 fixture뿐이다.
- [x] Migration, credential, feature flag, provider, DNS/firewall와 journald
      변경은 없다.
- [x] 후보의 CI run `30411214419`에서 test, typecheck, build, browser,
      dependency audit, application/release/controller/readiness fixture와 diff
      check가 모두 통과했다.
- [x] Linux release-manager fixture가 invalid restore target을 mutation 전에
      거부하고 failed activation 뒤 original current와 previous를 모두
      복구했다.
- [ ] Owner가 정확한 후보, 유지보수 시간, 실행자, 별도 rollback 담당자와
      보호되지 않은 production branch 위험을 새로 승인한다.

CI의 PostgreSQL 통합 범위는 기존 explicit skip 경계를 유지한다. 이번 diff에
migration 변경은 없다. Node 20 action deprecation annotation은 있었지만 run
결론은 success였다.

## Gate R1 — rollback release 경계

Named human operator가 기존 Gate 4 읽기 전용 명령으로 다음만 확인한다.

- [ ] `/opt/waw/current`와 `/opt/waw/previous`의 실제 resolved path를 기록한다.
- [ ] 두 경로가 `/opt/waw/releases/` 아래의 존재하는 서로 다른 directory다.
- [ ] Current는 관찰된 복구 release `bb53cf2`와 일치한다.
- [ ] Previous가 current와 같거나 없으면 즉시 `STOP`한다.
- [ ] 실패 candidate `464eb99542df`의 staged directory 존재 여부와
      `/opt/waw`, `/tmp` 여유만 metadata로 기록한다. 삭제하지 않는다.

Current와 previous가 같다면 즉흥적으로 symlink를 바꾸거나 workflow를
재실행하지 않는다. 새 candidate는 future rollback의 previous 복구를
검증했지만 현재 host 상태를 preflight 전에 자동 수정하지 않는다. 별도 Owner
승인 아래 정확한 rollback target을 복구하는 bounded host 절차를 먼저
결정해야 한다. Read-only 확인과 repair 승인 경계는
`docs/operations/production-release-link-repair-approval-request-2026-07-29.md`
를 따른다.

## Gate R2 — 시한성 readiness 재확인

Gate R1이 통과한 뒤 기존 Gate 4 전체를 새로 실행한다.

- [ ] Web/bot/Caddy, backup/monitor와 journald가 정상이다.
- [ ] Loopback과 canonical health가 HTTP `200`, `healthy`다.
- [ ] Backup marker가 36시간 이내이며 최근 backup/monitor 결과가 success다.
- [ ] `/opt/waw`와 `/tmp`에 각각 1 GiB 이상, `MemAvailable`이 256 MiB 이상이다.
- [ ] 뜻밖의 failed unit, public listener, unit/credential metadata 변경이 없다.
- [ ] `GATE4_READONLY=PASS current=<id> previous=<different-id>`를 기록한다.

## Gate R3 — SSH authority와 동시 실행

- [ ] `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`, deploy key와 pinned host key가 성공한
      preflight run `30406139720` 이후 변경되지 않았음을 Owner가 확인한다.
- [ ] 하나라도 변경됐다면 별도 승인으로 no-mutation SSH preflight만 다시
      실행하고 production deploy는 하지 않는다.
- [ ] `waw-production` concurrency group에 running/queued run이 없다.
- [ ] Deploy key와 named human rollback credential이 분리돼 있다.

## Gate R4 — 최종 GO

Gate R0~R3가 모두 통과한 뒤에만 Owner가 이 정확한 한 번의 정상 경로 재배포를
`GO`로 승인한다.

- [ ] Production ref를 변경하기 직전에 develop/production SHA와 diff를 다시
      확인한다.
- [ ] 정확히 하나의 `Deploy production` run만 관찰한다.
- [ ] Run `headSha`와 release ID가 위 후보와 일치한다.
- [ ] Stage, unit 검증, activation, restart와 최대 12회 bounded health가
      성공한다.
- [ ] Workflow 실패 시 재실행하지 않고 rollback 담당자가 먼저 current,
      previous, unit, health와 timer를 읽기 전용 확인한다.
- [ ] Runner와 remote transient cleanup을 확인한다.

## 성공 판정

- Workflow 결론이 `success`다.
- Current는 `d6a27c0bef4`, previous는 배포 전 current이며 서로 다르다.
- Web/bot singleton, loopback/canonical health, backup/monitor와 journald가
  정상이다.
- Migration, credential, feature activation, provider call, DNS/firewall,
  journald vacuum과 controlled failure injection은 각각 `0`이다.
- Secret, Discord 메시지, session 또는 provider payload는 기록하지 않는다.

Gate R1의 distinct release 경계가 확인되고 필요한 bounded repair가 별도
승인·검증되기 전 상태는 `READY`가 아니라 `STOPPED`다.
