# 프로젝트 상태

마지막 갱신일: 2026-07-29

## 현재 단계

2026-07-29 production data-only reset Gate 3의 migration 검증을 raw file
SHA-256 일치가 아니라 exact deployed release의
`acceptedMigrationChecksums(sql, version)` 계약으로 명확히 했다. Production
ledger 0003·0004 값은 현재 SQL의 정확한 CRLF rendering SHA-256이며, Git
이력상 적용 이후 SQL 내용 변경이 없어 정상 historical checksum으로
문서화했다. Ledger rewrite, production DB·host mutation은 `0`이다.

2026-07-29 production data-only reset 준비물을 추가했다. Exact approval GUC와
schema version `1..8` guard를 통과해야만 14개 명시적 application data table을
`CASCADE` 없이 한 transaction에서 비우고 dashboard singleton을 `false:0`으로
복원하며 commit 전 빈 상태를 검증한다. PostgreSQL 17 fixture는 모든 대상
table을 seed하고 미승인 실행의 무변경 실패, 승인 실행, schema/RLS/policy/grant
보존을 검증한다. Local disposable `initdb` 동등 실행은 PASS했고 Docker daemon이
꺼져 있어 container wrapper의 local 실행은 불가했으므로 Ubuntu develop CI
검증이 남았다. Backup restore, write quiescence, postcondition과 commit 후
replacement-DB recovery를 분리한 production checklist를 작성했다. Production
DB·host·backup·service mutation은 `0`이다.

2026-07-29 dashboard admin IPC 결과도 `discord.command` audit event를 사용해
명령어 로그에 섞이던 원인을 확인했다. Audit 원본은 보존하되 사용자용 command
log query에서 `channel_id='dashboard'`를 제외해 실제 Discord interaction만
표시한다. Discord interaction의 guild display name을 기존
`registered_discord_user`에 command audit와 같은 PostgreSQL statement로
upsert하므로 다음 명령 실행부터 해당 사용자의 과거·현재 로그가 실제 서버
닉네임으로 표시된다. 새 migration과 production mutation은 `0`이다.

2026-07-29 Riot 연결 요청 목록에 bot의 기존 guild member cache에서 읽은 현재
서버 display name을 표시하고, 조회할 수 없을 때만 Discord user ID로 fallback
하도록 admin IPC allowlist DTO를 확장했다. Dashboard는 기존 audited 단건
approve/reject API를 순차 재사용하는 일괄 승인·반려를 제공하며, 단건·일괄 처리
중 대상 버튼을 spinner와 함께 비활성화하고 synchronous in-flight guard로
연속 클릭의 이중 요청을 차단한다. 새 migration과 production mutation은 `0`이다.

2026-07-29 loading state의 oversized heading을 줄이고 panel text와 spinner를
중앙 정렬했다. Riot 목록에서 같은 사용자·platform·Riot ID의 active link와
pending request가 함께 보이는 원인은 request 생성이 active identity를 확인하지
않는 데 있었다. Transaction 안에서 case-insensitive active identity를 먼저
확인해 새 pending을 만들지 않고 audited `riot_link_already_active`로 종료하도록
수정했다. 기존 stale pending은 자동 DB mutation하지 않으며 dashboard의 기존
reject API를 `거절` 버튼으로 노출해 current authorization·CSRF·recent auth·audit
경계에서 정리할 수 있게 했다. Unit/UI/disposable PostgreSQL 검증은 PASS했고
production data mutation은 `0`이다.

2026-07-29 production UI 피드백에 따라 initial dashboard load에 reduced-motion
safe spinner를 추가하고 sidebar를 270 px로 넓혔다. Sidebar와 topbar의
`/몰랭검거` 문구는 제거하고 `관리 대시보드`를 primary brand로 정리했다.
Discord login card는 desktop width를 넓히고 responsive no-wrap title로
불필요한 한 글자 줄바꿈을 제거했다. UI/typecheck/build와 dashboard/login
Chromium accessibility·360 px overflow 검증이 PASS했다. Production push와
배포는 `0`이다.

2026-07-29 exact `f1441b086dfb9fe7970ac51414fb71489abd702a`의 develop CI
run `30416488101` 성공 후 production에 fast-forward 승격했다. Deploy production
run `30416842303`은 59초 만에 PASS했고 release `f1441b086dfb`를 stage·activate한
뒤 bounded readiness와 remote activation을 통과했다. 최종 canonical
`https://waw.dubeom.com/health`는 `healthy`, rollback은 발생하지 않았으며
production ref는 exact candidate와 일치한다.

2026-07-29 Owner 피드백에 따라 dashboard information architecture를 실제
운영 작업 중심으로 재구성했다. Discord 연결 의미와 icon을 갖는 전용 로그인,
서버·DB·backup·Riot pending count와 최근 명령 5개를 모은 dashboard, 별도 Riot
승인·cursor pagination 명령 로그·설정·운영 기록 tab을 구현했다. Summary
setting과 audited change history는 제품 정책상 삭제하지 않고 메인 scan path에서
분리했다. 상태는 text와 green/yellow/red cue를 함께 사용한다. Tests 270개 중
263 PASS·7 environment skip, typecheck/build/audit, desktop·360 px dashboard와
360 px login axe/overflow가 PASS했다. Production push와 배포는 `0`이다.

2026-07-29 승인된 Pretendard Direction A를 현재 React SPA에 구현했다. 기존
인증·권한·CSRF·Riot 승인·설정·감사·명령 로그 API 계약은 변경하지 않고,
`/몰랭검거` 브랜드, desktop sidebar, mobile horizontal navigation, dark
operations palette와 labelled mobile table을 production web source에
적용했다. Superseded된 daily quota UI는 복구하지 않았다. UI test 11개,
typecheck, web build와 desktop/360 px Chromium axe·overflow 검증이 PASS했다.
Production push와 배포는 `0`이다.

2026-07-29 Owner 승인 범위에서 `/opt/waw/previous`를 exact `f08089f`로
same-filesystem atomic repair하고 current `bb53cf2`, service PID/start time,
loopback/canonical health와 marker postcondition을 확인했다. Restart는 `0`이고
repair cleanup은 PASS했다. 이어 exact `d6a27c0bef4aa74f689b48a3e67899d936a52fe1`을
production에 fast-forward push했다. Deploy production run `30414602637`은
57초 만에 PASS했고 release `d6a27c0bef4a`를 stage·activate한 뒤 bounded
readiness와 remote activation을 통과했다. SSH credential cleanup과 canonical
`https://waw.dubeom.com/health`의 `healthy`도 PASS했으며 rollback은 발생하지
않았다.

2026-07-29 Owner 승인 재시도에서 AWS 공식 `*-cert.pub` 형식으로 temporary
Lightsail SSH certificate를 materialize해 Phase A read-only preflight를
완료했다. Current와 previous는 모두 `bb53cf2`, original previous `f08089f`의
directory와 두 immutable marker는 exact 일치해
`REPAIR_REQUIRED_ELIGIBLE`이다. Gate 4 section 1·3~9는 service/timer,
latest backup/monitor result, 22.4시간 backup freshness, loopback/canonical
health, 33.7 GiB disk, 437 MiB available memory, listener/identity와
credential metadata가 모두 PASS했다. 결과는 `mutation=0`, CloudShell
cleanup PASS, exit `0`이다. Phase B previous-link repair는 별도 Owner 승인
전까지 실행하지 않는다.

2026-07-29 Owner가 production release-link Phase A read-only preflight 1회를
승인했다. Root CloudShell에서 exact production instance의 temporary Lightsail
SSH access material을 받아 private-key/certificate fingerprint와 pinned host
key를 검증했지만, OpenSSH가 temporary certificate를 `error in libcrypto`로
거부해 `Permission denied (publickey)`로 종료했다. Production SSH session과
remote command는 성립하지 않아 release link read, Gate 4 read와 host
mutation은 모두 `0`이다. CloudShell controller와 access material은 same-run
제거됐고 exit는 `255`였다. 승인된 1회는 소비됐으므로 retry와 Phase B repair는
새 Owner 승인 전까지 `STOPPED`다.

2026-07-29 production release-link read-only preflight와 bounded repair 승인
문서를 작성했다. Phase A는 exact current `bb53cf2`, original previous
`f08089f`와 기존 marker SHA-256만 metadata로 확인하고 `NO_REPAIR`,
`REPAIR_REQUIRED_ELIGIBLE` 또는 `STOPPED`로 fail-closed 판정한다. Phase B는
별도 Owner 승인 뒤 eligible 상태에서 `/opt/waw/previous` 하나만
same-filesystem atomic replace하며 current, service, credential, DB와 release
directory를 변경하지 않는다. Postcondition 실패 시 previous만 pre-state로 한
번 복구하고 retry 없이 중단한다. Production push, workflow 실행, SSH와 host
mutation은 `0`이다.

2026-07-29 exact candidate `d6a27c0bef4aa74f689b48a3e67899d936a52fe1`의
production 재배포 activation checklist로 갱신했다. Develop Ubuntu CI run
`30411214419`에서 test, typecheck, build, browser, audit와 Linux
release-manager/application/controller/readiness fixture가 모두 PASS했다.
Candidate는 future failed activation에서 original current와 previous를 모두
복구하지만 첫 실패가 이미 남긴 host의 potentially-equal release link는
preflight 전에 자동 수정하지 않는다. Named human read-only 확인과 필요한
exact rollback target의 별도 bounded repair 승인 전 상태는 계속 `STOPPED`다.
Production push, workflow 실행, SSH와 host mutation은 `0`이다.

2026-07-29 failed activation rollback이 current만 복구하고 previous를 덮인
상태로 남기는 root cause를 수정했다. Release manager의 optional
restore-previous target은 canonical release-root 내부의 존재하는 distinct
directory만 mutation 전에 허용하며, GitHub remote controller는 preflight에서
기록한 exact `previous_before`를 전달한다. Linux release-manager fixture는
candidate activation 뒤 current와 previous가 모두 원래 값으로 복구되는 계약을
검증하도록 확장했고 deployment contract `6/6`, readiness/controller fixture,
Bash syntax와 diff check는 local PASS했다. Release-manager fixture는 GNU
`stat -c`·`mv -T`가 없는 macOS에서 실행 불가해 새 develop Ubuntu CI 검증이
남았다. Production push, workflow 실행, SSH와 host mutation은 `0`이다.

2026-07-29 exact candidate `4041fc6468884fb697b92cf8794f0dacd8124e7f`의
production 재배포 activation checklist를 작성했다. Develop CI run
`30410513475`는 전체 PASS지만 첫 실패의 release manager가 activation에서
previous를 당시 current `bb53cf2`로 덮은 뒤 rollback 시 current만 복구하므로
host current와 previous가 같을 수 있다. 실제 previous는 실패 후 기록되지
않았고 remote preflight는 두 release가 다르지 않으면
`invalid_release_preflight`로 중단한다. 따라서 named human read-only 확인과
distinct rollback target 복구 방식을 결정하기 전 상태를 `STOPPED`로
판정했다. Production push, workflow 실행, SSH와 host mutation은 `0`이다.

2026-07-29 최초 production CD 실패의 activation 직후 단일 health probe를
기존 운영 패턴과 같은 bounded readiness probe로 교체했다. Candidate release
안의 helper가 loopback `/health`를 5초 간격으로 최대 12회 확인하며, healthy면
즉시 성공하고 약 2분의 bounded 경계 안에 준비되지 않으면 실패해 기존 `ERR` trap의
release·unit rollback을 그대로 실행한다. Synthetic fixture에서 3번째 probe의
delayed-start 성공과 12회 timeout 실패를 확인했고 controller input fixture,
Bash syntax와 diff check도 PASS했다. Production push와 workflow 재실행은
`0`이며 정상 CD 경로는 새 develop CI와 별도 owner-approved production
재실행 전까지 미검증이다.

2026-07-29 최초 GitHub Actions production deploy run `30408412211`이 exact
candidate `464eb99542dfdc375cd75af1efcf29f1938e204e`를 stage·activate했지만
web restart 직후 단일 loopback health probe가 connection refused로 실패했다.
Controller는 이전 release `bb53cf2`와 unit을 자동 복구했고 SSH credential
cleanup도 PASS했다. Rollback 담당자가 current=`bb53cf2`, web/bot active와
loopback healthy를 확인했고 canonical health도 HTTP `200` healthy여서
`ROLLBACK OBSERVED=PASS`로 판정했다. 재실행은 `0`이다. Restart와 probe 사이
bounded readiness retry가 없는 startup race가 유력하지만 아직 확정하지
않았으며, 수정과 delayed-start/timeout fixture 검증 전까지 정상 CD 경로는
미검증 상태다. Production ref는 후보 commit을 가리키고 host active release는
rollback된 `bb53cf2`임을 구분한다.

2026-07-29 production 최초 승격과 실제 GitHub Actions CD 검증을 위한
activation checklist를 작성하고 전체 본문을 한국어로 제공했다. Exact
candidate/CI, unprotected production branch owner acceptance, no-mutation SSH
preflight, production read-only
readiness, 단일 workflow 관찰, post-deploy health와 transient cleanup,
자연 실패 시 rollback 확인을 독립 gate로 구분했다. 정상 배포 성공만으로
고의 rollback 경로까지 검증했다고 간주하지 않으며 controlled failure
rehearsal은 별도 owner approval로 남긴다. 문서 검토 중 기존 production
runbook의 GitHub Actions 절이 폐기된 ADR-0023 OIDC 경로를 설명하는 충돌을
발견해 Accepted ADR-0024의 repository-secret SSH 경로로 정정했다. Production
push, workflow 실행, SSH 접속과 host mutation은 수행하지 않았다.

Owner가 단일 Lightsail host 배포에는 OIDC/AWS IAM control plane이 과도하다고
판단해 GitHub repository secret 기반 전용 SSH key 주입을 승인했다. ADR-0024가
ADR-0023을 대체하며 workflow의 AWS/OIDC 권한과 temporary access-detail 호출을
제거한다. Exact `GITHUB_SHA` archive, pinned host key, serialization, preflight,
health와 previous-release rollback은 유지한다. 현재 GitHub Free/private
repository에서는 branch protection과 environment approval을 강제할 수 없으므로
server public-key 설치, repository secret 등록과 첫 production promotion은
별도 activation gate로 남긴다.
직전 develop CI는 tool-dependent PostgreSQL integration 파일을 일부만 제외한
상태에서 마지막 `web/app.test.tsx` worker가 pending으로 취소됐다. Generic
Ubuntu CI에는 기존 explicit `WAW_SKIP_POSTGRES_INTEGRATION=1` 경계를 적용하고
PostgreSQL integration은 별도 toolchain-required scope로 유지한다.
ADR-0024 전환 review에서 문서가 약속한 synthetic SSH input rejection fixture가
정적 source 검사만으로 남아 있던 간극을 발견해 실제 controller fixture와 CI
step을 추가했다. Local generic suite는 `247`개 중 pass `246`, explicit skip
`1`, fail `0`; typecheck, build, browser accessibility와 production dependency
audit(`0` vulnerabilities)가 PASS했다. 새 controller fixture도 Git Bash에서
PASS했다. Windows host에는 WSL distribution과 실행 중인 Docker daemon이 없어
POSIX permission을 요구하는 기존 application-assets/release-manager fixture의
fresh Linux 실행은 아직 CI 검증으로 남아 있다.

2026-07-29 develop CI에서 browser test의 Chromium launch 실패가 fixture HTTP
server를 닫지 못해 job cancellation까지 process를 유지하던 cleanup 결함을
수정했다. 이어서 unpinned `npx playwright`가 runtime
`playwright-core@1.61.1`과 다른 browser revision을 설치하는 근본 원인을 확인해
checked-in `playwright-core` CLI로 설치 경계를 고정했다. Develop run
`30372905666`, commit `61f69ed`에서 test, typecheck, build, browser
accessibility, dependency audit, application-assets fixture, release-manager
fixture, SSH controller fixture와 diff check가 모두 PASS했다. Production
push와 deployment는 `0`이다.

2026-07-29 GitHub repository에 등록된 SSH secret을 실제 배포
전에 검증하기 위한 manual-only `workflow_dispatch` preflight를 추가했다.
Workflow는 production deployment와 같은 concurrency group을 사용하고,
private key와 pinned known-host를 runner temporary mode `0600` 파일로 검증한
뒤 원격에서 `true`만 실행한다. Checkout, archive, SCP, sudo, service와 release
mutation은 포함하지 않는다. Commit `bd28a05`, develop CI run `30374365190`은
전체 PASS했고 preflight 자체의 수동 실행과 production push/deployment는
각각 `0`이다.

2026-07-29 GitHub repository 기본 브랜치를 승인된 branch model에 맞춰
`main`에서 `develop`로 전환했다. 이에 따라 deploy와 preflight workflow가
GitHub에 등록됐고, no-mutation SSH preflight run `30406139720`을 exact
`bd28a05572ce5d10a5e080a22b9a27356db156eb`에서 실행해 PASS했다. 전용 private
key 파싱, `waw.dubeom.com` pinned host-key lookup, `ubuntu` 계정의
host-key-pinned SSH `true`와 runner temporary credential cleanup이 모두
성공했다. Actions log에서 두 secret은 마스킹됐고 secret 값, private key와
known-host 본문은 출력되지 않았다. Workflow의 `environment: production`
선언으로 보호 규칙이 없는 environment deployment record `5648817399`가
생성됐지만 checkout, archive, SCP, sudo, service와 release mutation은 `0`이다.
`production` branch는 계속
`30d6f1763195950a9f45710c8825a3a4f9aaa156`이며 보호되지 않은 production
승격과 실제 deploy는 별도 owner activation gate로 남긴다.

브랜치 정리 확인에서 GitHub 기본 브랜치와 로컬 작업 브랜치를 `develop`로
맞췄다. 호환용 `main`, `develop`과 현재 작업 HEAD는 모두 exact
`bd28a05572ce5d10a5e080a22b9a27356db156eb`이고 divergence는 `0/0`이다.
별도 force push나 production 변경은 수행하지 않았으며, 이후 integration
작업은 `develop`을 기준으로 한다.

Owner가 ADR-0023을 승인해 Accepted로 전환하고 PLAN-0011을 Approved로
작성했다. GitHub Actions CI와 production workflow, exact `GITHUB_SHA` archive,
branch-bound OIDC, Lightsail temporary SSH certificate/host-key pinning,
serialized deployment, timer/service/health preflight와 failed-activation
rollback controller를 local 구현했다. CI에는 AWS 권한이 없고 normal deploy는
migration, credential과 feature activation을 호출하지 않는다. Workflow action
세 개는 official tag가 가리키는 full commit SHA로 고정했다. 정적 deployment
계약 5개, typecheck와 build가 PASS했다. Windows host에 Bash/WSL distribution이
없어 shell syntax와 disposable Linux fixture는 GitHub Ubuntu CI에서 검증해야
한다. GitHub branch/ruleset/variable과 AWS OIDC/IAM, production
connection/change는 아직 `0`이다.

2026-07-28 local Orca/CloudShell UI 의존성을 application 배포 critical path에서
제거하기 위해 GitHub Actions→Lightsail 배포 대안을 조사했다. Private
repository의 Environment required reviewer는 account plan에 따라 사용할 수
없으므로 production 승인 자체는 보호된 `develop`→`production` PR merge로
기록하고, Actions는 GitHub OIDC short-lived AWS role과 Lightsail temporary
SSH key/certificate·host key pinning을 사용하는 Option을 권고했다. Static
AWS/SSH secret과 production self-hosted runner는 채택하지 않았다.
`ADR-0023-github-actions-lightsail-deployment.md`를 Proposed로 작성했고 이후
owner가 권고안을 승인했다.

2026-07-28 dashboard policy-alignment audit에서 Pretendard refresh와 redacted
command log는 `main`에 있지만, ADR-0021이 폐기한 일일 quota DTO·API·DB
mutation·React UI가 default-off gate 뒤에 남아 있음을 확인했다. 새 ADR 없이
Accepted ADR-0021을 적용해 이 active-source 경로와 web feature flag를
제거했고 command log, Riot 승인, OAuth/session/CSRF/recent-auth 경계와
rolling-hour bot enforcement는 유지했다. Local test `249` 중 pass `241`,
PostgreSQL-tool explicit skip `8`, fail `0`; typecheck, build, browser
accessibility/keyboard check와 diff check가 PASS했다. Canonical root와
`/health`는 read-only HTTP `200`, health `healthy`였다. Production mutation은
`0`이며 exact immutable candidate와 별도 activation 승인이 남았다. 결과는
`docs/operations/dashboard-policy-alignment-audit-2026-07-28.md`에 기록했다.

2026-07-28 owner가 production Discord에서 실제 `/요약`을 직접 실행해 정상적인
요약 결과 반환을 확인했다. 이 확인으로 등록 사용자 real-content smoke와
사용자 관점의 summary production 활성화는 PASS로 종료한다. 정확한 실행 시각,
선택 범위, 메시지 원문과 요약 결과 본문은 저장소에 기록하지 않았으며 이번
갱신에서 production 로그나 persistence를 추가 조회하지 않았다. 별도
`/도움말` private read-back과 redaction 재검수는 summary 기능 차단 요소가 아닌
최종 운영 acceptance 항목으로 유지한다. 결과는
`docs/operations/summary-owner-smoke-result-2026-07-28.md`에 기록했다.

실제 read-only 진단에서 최근 10분 메시지는 `0`, 최근 24시간 메시지는 `100`,
본문이 있는 최근 24시간 메시지도 `100`으로 확인됐다. 따라서 기존
`읽을 수 있는 대화 본문이 없습니다` 안내는 Discord 권한 문제가 아니라 빈
선택 범위를 잘못 분류한 것이었다. 빈 범위는
`summary_range_empty`와 `선택한 시간 범위에 요약할 대화가 없습니다. 더 긴
범위를 선택해 주세요.`로, 메시지는 있으나 모든 본문이 비어 있는 경우만
`summary_content_unavailable`로 구분했다. production release `bb53cf2`,
archive SHA-256
`bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed`,
`207414` bytes를 활성화했다. 전체 회귀 `264` 중 pass `257`, explicit skip
`7`, fail `0`, typecheck와 build가 PASS했다. Production build, Map fixture,
Message Content intent, 새 안내문, bot/web restart, health/singleton과 flag
검증이 모두 PASS했다. Provider call과 migration은 `0`, transient remainder는
`0`이다. 등록 사용자는 메시지가 실제로 포함된 `/요약 최근 범위:최근 1시간`
이상의 범위로 실제 provider smoke를 완료할 수 있다. 결과는
`docs/operations/summary-empty-range-guidance-result-2026-07-28.md`에
기록했다.

실제 메시지가 있었지만 네 summary section이 모두 비어 나온 원인을 교정해
production release `f08089f`, archive SHA-256
`f08089fb57f3c0645c2f845648bcca05c53c3ed9a05cd480ae3ea4bfe02605b4`,
`207305` bytes로 활성화했다. Discord Developer Portal의 기존 로그인 세션에서
승인된 `Message Content Intent`만 활성화·저장했고 token이나 다른 intent는
변경하지 않았다. Runtime도 `GatewayIntentBits.MessageContent`를 요청하도록
교정했다. 수집 범위 안 메시지가 없거나 모든 본문이 비어 있으면 quota 예약과
OpenAI 호출 전에 `summary_content_unavailable`로 중단한다. 전체 회귀 `263`
중 pass `256`, explicit skip `7`, fail `0`, typecheck/build/audit/diff check가
PASS했다. Production Map fixture와 intent 검증, activation, bot/web restart,
health/singleton과 flag 검증도 PASS했다. Provider call과 migration은 `0`,
transient remainder는 `0`이다. 등록 사용자는 `/요약 최근`을 다시 실행해
실제 content smoke를 완료할 수 있다. 결과는
`docs/operations/summary-message-content-activation-result-2026-07-28.md`에
기록했다.

실제 `/요약 최근` smoke가 `summary_range_incomplete`로 실패한 원인을
수정해 production release `7cb6c24`, archive SHA-256
`7cb6c248c97cb05629531856352b3de03df94176915f832576c2423e0a175b86`,
`207004` bytes로 활성화했다. Discord `messages.fetch()`의 실제 반환값은
Map 계열 `Collection`인데 어댑터가 iterable을 배열처럼 펼쳐 `[ID, message]`
entry를 message로 검증한 것이 근본 원인이었다. `fetched.values()`로 교정하고
테스트 fixture도 실제 Map 형태로 바꿨다. Production Map fixture, build,
activation, bot/web restart, health/singleton과 flag 검증은 PASS했다.
Provider call과 migration은 `0`, transient remainder는 `0`이다. 등록 사용자는
동일한 `/요약 최근` 요청을 다시 실행해 실제 provider smoke를 완료할 수 있다.
결과는
`docs/operations/summary-history-collection-fix-result-2026-07-28.md`에
기록했다.

승인된 summary time UX release `f8bf082`, archive SHA-256
`f8bf082e6524a07775222e97bd889a97a77bb87ab41d1a140e16b48374e58393`,
`222679` bytes를 production에 활성화했다. `/요약 최근`은 10분, 30분,
1/3/6/12/24시간 선택형 범위를 제공하고 `/요약 직접`은 한국 시간
`20:00`, `어제 23:30`, `오늘 00:30` 형식을 받는다. 최대 범위는 24시간이며
외부 처리 고지는 별도 섹션 대신 요약 도움말의 `※ 외부 처리 안내`로 배치했다.
첫 등록 시도는 절대 디렉터리 ESM import가
`ERR_UNSUPPORTED_DIR_IMPORT`로 실패해 자동 rollback됐다. 절대 경로
`createRequire`로 교정한 재실행은 command schema/register/readback, release
activation, bot/web restart, health/singleton과 flag 검증을 모두 통과했다.
Provider call과 migration은 `0`, transient remainder는 `0`이다. 남은 확인은
등록 사용자의 private `/도움말` read-back과 선택형 `/요약 최근` 1회
bounded smoke다. 결과는
`docs/operations/summary-time-ux-activation-result-2026-07-28.md`에 기록했다.

OpenAI summary disclosure release `3a73844`, archive SHA-256
`3a73844cc5b1cc8f016f9b1e65b00559abe23eb0788ce26517ab766a500a39f3`,
`221481` bytes를 production에 활성화했다. Multi-file browser upload가 bundle만
전달하고 key를 누락한 것이 반복 credential 실패의 원인이었고, key-free
diagnostic으로 target ABSENT와 healthy default-off 상태를 증명한 뒤 key와
bundle을 각각 업로드해 해결했다. Credential은 root:root `0600`, bot direct
read DENY이며 모든 key transient를 제거했다. Runtime archive는 local과
production에서 build/typecheck/disclosure PASS 후 stage됐다. Daemon reload
`1`, bot/web restart 각 `1`, health/singleton PASS, failed unit `0`,
provider/quota `1`, game observation `0`, provider call/migration `0`이다.
Authenticated dashboard와 private `/도움말`에 승인된 고지가 포함됐다. 남은
smoke는 등록 사용자의 `/도움말` read-back과 1회 bounded `/요약` 호출이다.
결과는
`docs/operations/openai-summary-disclosure-activation-result-2026-07-28.md`에
기록했다.

Owner가 실제 summary 외부 처리 고지 정책을 승인했다. OpenAI 공식 data-control
문서를 재확인해 API input/output 기본 학습 제외, default abuse-monitoring
content 최대 30일 보존 가능, Responses `store:false`가 application-state
저장은 끄지만 abuse-monitoring 보존은 제거하지 않는 경계를 확정했다. Accepted
ADR-0022와 product policy에 기록하고, 동일한 한국어 고지를 authenticated
dashboard summary panel과 private `/도움말`에 추가했다. Local test `261`
(pass `254`, explicit skip `7`, fail `0`), typecheck, build, production
dependency audit와 diff check가 PASS했다. 아직 disclosure release는 production에
활성화하지 않았고 Discord 공지, provider call과 production change는 `0`이다.
등록 공지 채널 authority가 없으므로 임의 채널/수신자를 선택한 direct message는
보내지 않았다. Owner가 전용 OpenAI project key를 발급·복사했고, one-time
handoff로 production root-only `0600` credential source 설치를 완료했다.
Bot-user direct read는 DENY, bot PID/start timestamp 불변, restart/provider
call `0`, provider/quota flag `0`이며 CloudShell/local/remote key transient는
제거됐다. 다음 작업은 disclosure release 활성화와 bot-only LoadCredential
연결 뒤 provider/quota 동시 활성화 및 bounded smoke다.
결과는
`docs/operations/openai-summary-disclosure-and-key-handoff-2026-07-28.md`에
기록했다.

Exact candidate `f42e2b0`의 default-off production rollout이 PASS했다.
Candidate bot/web unit을 설치하고 임시 provider-zero bridge를 같은 bounded
change에서 제거한 뒤 release symlink를 활성화했다. Daemon reload `1`,
bot/web restart 각 `1`, loopback health와 singleton PASS, failed unit `0`,
summary provider/quota, game observation, dashboard quota flag 모두 `0`이다.
Provider call과 DB migration은 `0`이며 controller/CloudShell/remote transient는
제거됐다. 첫 controller 시도는 허용되지 않은 `180s` timeout을 로컬 SSH
경계가 거부해 production command가 실행되지 않았고, 기존 허용값 `600s`로
교정한 두 번째 실행만 production rollout을 수행했다. 결과는
`docs/operations/default-off-f42e2b0-rollout-result-2026-07-28.md`에 기록했다.
다음 product gate는 실제 Discord content를 외부 처리하기 전 등록 사용자
고지와 provider/model/data-control 재확인, provider/quota flag 활성화 결정이다.

OpenAI marker synthetic spike가 exact candidate `f42e2b0`에서 PASS했다.
staging wrapper의 `umask 077`로 build output이 root 전용이 됐지만 release
manager가 쓰기 권한만 제거해 bot-user compiled import가 실패한 것이
근본 원인이었다. Secret-free release tree를 `a+rX`로 정규화한 뒤 모든 write
bit를 제거하도록 manager를 수정했고, 비활성 staged release만 같은 방식으로
수리했다. CloudShell Linux release-manager fixture는 `umask 077`에서도
other-user read, directory traverse, writable file `0`을 통과했다. Bot-user
import/validate와 systemd `LoadCredential` 심화 진단은
network/request `0`, bootstrap/import/credential/stdout/stderr 각 `1`,
cleanup PASS였다. 실제 invented Korean marker 요청은 정확히 `1`회, retry
`0`, `2,895 ms`, input `444`, output `79`, total `523` tokens로 완료됐다.
Strict schema와 omission/duplicate/wrong-section/unmarked/invented/unexpected
모두 `0`/PASS다. Credential, transient, CloudShell/local handoff는 제거됐고
네 flag `0`, activation/restart `0`을 유지했다. Owner의 전용 key usage
1회 확인과 폐기도 완료됐다. Synthetic gate는 종료됐으며 남은 provider
credential은 없다. 결과는
`docs/operations/openai-summary-marker-spike-pass-2026-07-28.md`에 기록했다.

두 번째 OpenAI marker synthetic spike는 exact staged candidate, health,
credential metadata와 네 default-off flag preflight를 통과했지만 transient
실행 단계에서 allowlisted runner metadata를 내기 전에 실패했다. 재시도하지
않았고 production credential, CloudShell/controller artifact와 로컬
clipboard를 정리했다. Owner 확인 결과 usage view의 1 request와 342 tokens는
2026-07-27 기존 spike 기록이며 2026-07-28 이번 시도의 provider 사용 기록은
`0`이다. 따라서 이번 실패는 provider 요청이 기록되기 전 transient
실행/전달 경계로 좁혀졌다. 실패 시도에 사용한 key는 폐기됐고 새로 발급한
key는 production에 설치하거나 사용하지 않았다. 실행기가 transient 시도 자체를
`request_total=1`로 잘못 기록한 accounting 결함도 발견해, runner의 고정
`observed_requests` 증거가 없으면 `UNKNOWN`을 기록하도록 수정했다. 실제
provider request는 `0`이며 marker/schema 결과는 미확인이다.
새 credentialed spike는 기존 no-retry 경계상 systemd-only 원인 수정과 Gate A
재통과 전까지 금지한다. 다음 내부 작업은 network/API가 없는 systemd-only
transient result-delivery 진단이다. 결과는
`docs/operations/openai-summary-marker-spike-second-result-2026-07-28.md`에
기록했다.

Production access와 summary synthetic gate 선행조건을 복구했다. AWS
access-details CLI option을 `--protocol ssh`로 교정하고 returned private
key/certificate와 pinned host keys를 사용하는 단일 bounded SSH 경로에서
client 17, URI parse, connection-only handshake를 PASS했다. 운영 URI의
`uselibpqcompat=true`는 정확히 `true`일 때만 허용하고 `psql` 환경에는
전달하지 않도록 고쳤다. 최소 권한 `waw_bot`은 의도적으로
`app_schema_version` SELECT가 없으므로 권한을 넓히지 않고, 이미 같은 조회를
수행하는 기존 backup role로 canonical aggregate를 정확히 1회 실행해 schema
version `8`을 확인했다. DB URL, host, username, password와 provider error는
출력하지 않았고 transient remainder는 `0`이다.

Exact default-off bridge를 `root:root 0644`, approved SHA-256으로 재설치했다.
Provider declaration/resolved count는 `zero=1, one=0, other=0`, daemon-reload
`1`, service restart `0`, bot identity unchanged, health PASS, failed unit
`0`이다. 이어 exact candidate `f42e2b0`, archive SHA-256
`962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`,
`640107` bytes를 `/opt/waw/releases/f42e2b0`에 stage했다. Build, migration
`8`, writable file `0`, 네 feature flag `0`, activation/restart/migration
`0`을 확인했고 전달 transient를 제거했다. OpenAI Platform API-key 페이지는
login으로 redirect되어 로그인·암호·MFA·key 생성과 API 호출은 수행하지
않았다. 결과는
`docs/operations/openai-summary-production-preflight-and-stage-result-2026-07-28.md`
에 기록했다. 다음 외부 gate는 owner의 OpenAI Platform 로그인이다.

Owner가 exact candidate `f42e2b0`의 synthetic-only OpenAI spike 범위를
승인했다. Read-only production preflight를 재개했지만 production host 명령
실행 전 access 경계에서 중단했다. 첫 CloudShell access-details 응답의
`hostKeys`가 null이었고, fresh 응답의 세 host key를 고정한 private-key-only
SSH는 `Permission denied (publickey)`였다. 응답에는 별도 SSH certificate가
있으므로 certificate를 함께 쓰지 않은 연결 방식이 불완전했다. 이미 로그인된
Lightsail browser terminal은 canvas input을 안전하게 구동할 수 없었고 paste
control이 unrelated local clipboard text를 hidden input에 넣어 즉시 Enter 전
clear했다. Production command, staging, credential, OpenAI request와 mutation은
모두 `0`이며 CloudShell/local transient artifact를 제거했다. 이후 returned
private key와 certificate를 함께 사용하고 세 returned host key를 고정한
channel proof는 production host에서 통과했지만, 뒤따른 read-only preflight
assertion 중 하나가 불일치해 `rc=1`로 중단했다. 승인된 stop condition에 따라
개별 assertion 진단을 재시도하지 않았으며 staging, credential과 OpenAI
request는 여전히 `0`이다. 다음 재개는 각 불변조건의 pass/fail만 출력하는
별도 승인된 labelled read-only diagnostic이다. Synthetic spike PASS 뒤에도
default-off release rollout, real-summary disclosure/activation, consented
Riot/game-observation, final release acceptance와 독립 journald vacuum gate가
남는다. 전체 순서는
`docs/operations/project-completion-gates-2026-07-28.md`에 기록했다.

Owner 승인으로 labelled read-only diagnostic을 정확히 1회 실행했다. Current
`2ac0996`, previous `cb93ed8`, rollback distinct, candidate와 summary credential
부재, bot/web/timer active, timer enabled, backup/monitor success, failed unit
`0`, summary quota/game observation/dashboard quota flag `0`, canonical health
`healthy`와 capacity metadata는 PASS였다. Bot unit의 exact
`WAW_SUMMARY_PROVIDER_ENABLED=0` 선언은 `0`개라 FAIL했고 schema readback은
`UNKNOWN`이라 version `8`을 증명하지 못했다. 추가 조회나 재실행은 하지
않았다. Staging, credential, OpenAI request와 production mutation은 모두
`0`이고 one-time access material과 transient를 제거했다. 다음 gate는 이 두
실패 assertion만 다루는 별도 read-only 조사 승인이다.

Owner가 두 실패 원인만 대상으로 한 sanitized read-only 조사를 승인했다.
Provider flag는 `/etc/systemd/system/waw-bot.service`와 유일한
`admin-command-ipc.conf` drop-in 어디에도 선언되지 않았고 resolved environment
count도 `zero=0, one=0, other=0`이었다. 즉 absent를 exact zero로 인정하지 않는
preflight 계약 때문에 실패했다. Schema credential source는 `root:root 0600`,
존재·nonempty·root-readable이고 `waw-bot` 직접 read는 거부돼 credential
경계가 유지됐다. Node는 존재하지만 current `2ac0996`에서 `postgres` dynamic
import가 실패해 credential parse, DB connect와 query에 도달하지 못한 것이
`UNKNOWN`의 원인이다. 오류 본문, URL, credential과 unit body는 출력하지
않았고 추가 조회도 하지 않았다. Staging, credential, OpenAI request와
production mutation은 `0`, controller cleanup은 `rc=0`이고 transient를
제거했다. 다음 단계는 두 preflight 가정을 교정하는 exact change set 제안이며
production mutation은 아직 승인되지 않았다.

두 preflight 불일치의 production-free 교정안을
`docs/operations/openai-summary-preflight-correction-proposal-2026-07-28.md`
로 작성했다. Provider는 current older unit용
`summary-provider-default-off.conf` bridge를 exact `root:root 0644`,
SHA-256
`b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a`
로 제안하며 daemon-reload만 하고 bot restart는 금지한다. Rollback은 exact
hash/metadata가 유지된 target만 제거하고 PID/start timestamp/health 불변을
검증한다. Candidate base unit 교체 시 zero 선언 중복을 막기 위해 bridge를
같은 bounded change에서 제거해야 한다. Schema readback은 current release
Node dependency와 잘못된 `schema_migrations` 가정을 버리고 host PostgreSQL
17 `psql`로 canonical `public.app_schema_version`의 `max(version)`만 조회한다.
DB URL은 argv/history/file/output에 두지 않고 OS Python 표준 URI parser로
분해한 libpq 필드만 root-owned `psql` child environment에 잠시 넣으며 fixed
stage metadata만 출력한다. 이
교정안은 문서와 disposable 검증 제안뿐이며 production mutation, daemon
reload, credential과 OpenAI call은 수행하지 않았다.

Owner 승인으로 교정안의 local/disposable 구현을 완료했다. Exact provider
drop-in, conflict-safe manager와 fake-systemd fixture를 추가해 source hash,
production `root:root 0644`, install/idempotency, wrong-mode/content conflict,
checksum-guarded rollback, already-absent와 simulated PID change 거부를
검증했다. Manager는 daemon-reload 외 service 명령을 허용하지 않고 bot
MainPID/start timestamp 불변을 요구한다. Release-independent schema runner는
PostgreSQL client major 17, regular non-symlink credential metadata와 정확히 한
줄을 요구하고 canonical `public.app_schema_version`만 조회한다. Fake psql
fixture는 secret argv/output 부재, missing/empty/multiline/symlink/wrong mode,
wrong client major, query failure/multiline/wrong version 거부를 통과했다.
실제 disposable PostgreSQL 17.10의 version rows `1..8`에서도 runner가
정확히 `8`을 반환하고 cluster/temp cleanup을 통과했다. 관련 asset test와
짧은 `TMPDIR=/tmp` 전체 회귀
`260 tests / 253 pass / 7 explicit skips / 0 fail`, typecheck, build,
8 migration asset copy와 diff check가 통과했다. 실제 production host,
credential, DB, daemon-reload, restart와 OpenAI는 사용하지 않았다. 다음
gate는 exact production 교정 change set의 별도 owner 승인이다.

구현 검토 중 첫 candidate `7fd13ed35ae7cff8c4ab9727ee0131a34b9373e3`
의 Linux Gate A가 provider rollback fixture에서 실패했다. Fixture가 로그를
비운 뒤 발생한 daemon-reload 1회를 3회로 잘못 기대했고 macOS 기본 Bash가
마지막 false assertion을 후속 성공 echo 때문에 은폐한 것이 원인이었다.
기대값만 1로 교정한 exact candidate는
`78c8a1db6d96e7cb7cfa3d267ff4f5cfebab0fd5`, archive SHA-256
`fdae4c072f0e4ceaec0e909d421f5981c35f330661bc06072dade6ed5af66dfb`,
`656396` bytes다. 이 exact archive는 local Gate A와 CloudShell Linux Gate A를
통과했다. Linux 결과는 Node `v24.18.0`, 전체 회귀
`260 tests / 253 pass / 7 explicit skips / 0 fail`, typecheck, build,
provider/schema fake fixtures, production asset test, production dependency
audit, 8 migration byte 일치와 writable file `0`이다. CloudShell에 PostgreSQL
도구가 없어 real-PostgreSQL fixture만 명시적으로 skip했으며 동일 fixture는
local disposable PostgreSQL 17.10에서 통과했다. CloudShell/local transient는
제거했다. Production host, credential, DB query, daemon-reload와 OpenAI는
사용하지 않았다.

Gate A를 통과한 exact tuple의 production correction approval request를
`docs/operations/openai-summary-preflight-production-correction-approval-request-2026-07-28.md`
로 작성했다. 요청 범위는 metadata-only preconditions, exact default-off
bridge 설치와 최대 1회 daemon-reload, 정확히 1회의 labelled read-only
`public.app_schema_version` aggregate query다. Query 실패는 재시도하지 않고
checksum-guarded bridge rollback과 최대 1회의 추가 daemon-reload 후 정지한다.
Service restart, staging/activation, credential 생성·변경, DB mutation과 OpenAI
호출은 모두 제외했다. 이는 승인 요청서 작성만이며 production access,
credential read와 DB query는 수행하지 않았다.

Owner가 exact production correction 범위를 승인했다. Exact archive tuple과
세 asset hash를 CloudShell에서 재검증한 뒤 production precondition은
`provider_zero=0`, failed units `0`, canonical health `healthy`로 PASS했다.
Default-off bridge 설치와 첫 daemon-reload는 PASS했고 service restart는
`0`이었다. Labelled schema query는 허용된 1회 시도에서 `schema_query`로
FAIL했다. Stop condition에 따라 query를 재시도하지 않았고,
checksum/metadata-guarded bridge rollback과 두 번째 daemon-reload가 PASS했다.
Production transient와 CloudShell controller/access/archive remainder는 모두
`0`이다. DB mutation, staging/activation, credential 생성·변경과 OpenAI
request는 `0`이며 production provider 선언은 원래 absent/default-off 상태로
복구됐다. 다음 단계는 query를 수행하지 않는 별도 read-only failure-stage
diagnostic 승인이다.

직전 `schema_query` 실패를 query 없이 분리하는 승인 요청서를
`docs/operations/openai-summary-schema-failure-readonly-diagnostic-approval-request-2026-07-28.md`
로 작성했다. 요청 범위는 OS client 실행, 기존 credential의 메모리 내 URI
parse, 정확히 1회의 connection-only libpq handshake와 runner의 SQL dispatch
계약 정적 검증이다. 실제 SQL dispatch와 DB query는 `0`이며
`sql_dispatch` label은 `mode=STATIC_ONLY`로만 판정한다. Fixed PASS/FAIL label
밖의 credential, DB URL, host, username, provider/parser error와 row 내용은
출력하지 않는다. Bridge 재설치, daemon-reload, service restart, production
mutation과 OpenAI 호출도 제외했다. 이는 승인 요청서 작성만이며 production
access, credential read, connection과 query는 수행하지 않았다.

Owner가 no-query 진단을 승인해 exact commit의 schema runner hash를 다시
검증하고 CloudShell controller를 한 번 제출했다. 그러나 허용된 관찰 시간 안에
production stage label이나 prompt가 반환되지 않아 동일 진단을 재실행하지
않았다. 별도 CloudShell terminal에서 exact controller/SSH process를 종료하고
controller/access transient를 제거했으며 fixed 결과는 `query_total=0`,
`cleanup=PASS transient_remainders=0`, `result=FAIL`이다.
`client_execution`, `uri_parse`, `connection`, `sql_dispatch` label은 반환되지
않아 모든 stage와 production remote 도달 여부가 `UNKNOWN`이다. SQL query,
DB row read/mutation, bridge/daemon/service/release 변경과 OpenAI 호출은 `0`이다.
결과는
`docs/operations/openai-summary-schema-failure-readonly-diagnostic-result-2026-07-28.md`
에 기록했다. 계속하려면 bounded SSH connect timeout과 controller/remote entry
label을 포함한 새 no-query 실행 승인이 필요하다.

후속 transport-only 승인 요청서를
`docs/operations/openai-summary-transport-timeout-readonly-diagnostic-approval-request-2026-07-28.md`
로 작성했다. 요청 범위는 controller start, 15초 bounded read-only access
acquisition, `ConnectTimeout=10`/`ConnectionAttempts=1`/15초 전체 deadline의
remote-command 없는 SSH master connection, 동일 connection을 재사용한 10초
remote shell entry 확인뿐이다. Controller 전체 deadline은 45초이며 각 단계는
fixed PASS/FAIL label만 출력한다. Production/application file과 credential,
DB/OpenAI credential, DB connection/query, production mutation,
bridge/systemd/service, staging/activation과 OpenAI 호출은 모두 `0`이다. 이는
승인 요청서 작성만이며 access API, SSH와 production command는 실행하지 않았다.

Owner가 exact transport-only 범위를 승인했다. Exact commit의 runner와
controller hash를 재검증한 뒤 15초 bounded access acquisition,
`ConnectTimeout=10`/`ConnectionAttempts=1`의 SSH master connection,
control-socket check와 동일 connection의 10초 remote entry를 각각 한 번
실행해 모두 PASS했다. Cleanup도
`transient_remainders=0`, 최종 result는 PASS다. 이전 timeout의 원인은 AWS
access, SSH 또는 production remote entry가 아니라 긴 command를 CloudShell
terminal receiver에 제출하는 UI/input 경계였다. Application/DB/OpenAI
credential, production file/config, DB connection/query, production mutation,
bridge/systemd/service, staging/activation과 OpenAI 호출은 모두 `0`이다.
결과는
`docs/operations/openai-summary-transport-timeout-readonly-diagnostic-result-2026-07-28.md`
에 기록했다. Schema failure-stage 조사는 이 transport 결과를 전제로 새 실행
승인을 받아야 한다.

Transport PASS를 선행조건으로 한 새 schema failure-stage no-query 재실행
승인 요청서를
`docs/operations/openai-summary-schema-failure-stage-second-execution-approval-request-2026-07-28.md`
로 작성했다. 요청 범위는 click-before-Enter controller 제출, bounded
transport, client major 17 확인, existing credential의 메모리 내 URI parse,
정확히 1회의 `\quit` connection-only handshake와 `mode=STATIC_ONLY` dispatch
계약 검증이다. SQL/query와 row read, transport/DB retry, production mutation,
bridge/systemd/service, staging/activation, credential 생성·변경·복사와
OpenAI 호출은 모두 `0`이다. 이는 Owner 검토용 문서 작성만이며 production/API,
SSH, credential과 DB에는 접근하지 않았다.

Owner가 새 schema failure-stage no-query 범위를 승인했다. Exact runner와
controller hash를 검증하고 CloudShell textbox click 후 controller를 한 번
실행했다. Controller start와 fresh read-only access acquisition은 PASS했지만
bounded SSH master connection이 FAIL했다. Stop condition에 따라 retry 없이
remote entry 전에 중단했고 cleanup은 `transient_remainders=0`으로 PASS했다.
따라서 client execution, application credential read/parse, DB
connection/query와 row read/mutation, production mutation, bridge/systemd/
service/release 작업과 OpenAI 호출은 모두 `0`이다. 결과는
`docs/operations/openai-summary-schema-failure-stage-second-execution-result-2026-07-28.md`
에 기록했다. 계속하려면 직전 transport PASS invocation과 이번 SSH FAIL
invocation의 차이를 local/static으로 비교하는 새 gate가 필요하다.

두 historical controller의 local/static 비교를 완료했다. 두 승인 문서의 SSH
계약은 returned private key/certificate/host keys only, strict host-key,
`ConnectTimeout=10`, `ConnectionAttempts=1`, 15초 master connection과
control-socket check로 동일하지만 실제 controller byte stream은 저장소에
보존되지 않았고 서로 다른 SHA-256과 sanitized 결과만 남았다. 따라서 option
order/path/destination/control-socket까지 byte-level로 비교하거나 controller
drift, ephemeral access state와 external SSH 중 하나를 원인으로 확정할 수 없다.
결과는
`docs/operations/openai-summary-transport-invocation-static-comparison-2026-07-28.md`
에 기록했다. 재발 방지를 위해 output-silent bounded SSH master 계약을
`scripts/lib/bounded-lightsail-ssh.sh`로 단일화하고 synthetic fixture에서 exact
ordered options, certificate/host-key/identity 경계, retry `0`, `ssh -O check`,
bounded exit, destination binding, symlink 거부와 output silence를 검증했다.
Asset SHA-256은
`0245330bcbc4d94347df61181de968b9a265f6ab505e851e0ab4801a112765b1`,
fixture SHA-256은
`032115c7b1be9ef912538480890dc7d3d40900e57a1dbb67ff32a6e8a6ccf443`다.
AWS, production, credential, DB와 OpenAI 접근은 `0`이다.

같은 shared asset을 사용하는 새 no-query controller와 remote diagnostic을
production-free로 고정했다. Controller는 library/remote/canonical schema
runner hash를 시작 전에 검증하고, ephemeral access JSON을 private
directory에서만 구조화하며, 한 번의 public-key/certificate SSH master,
`ssh -O check`, `ProxyCommand=false`를 이용한 master-only remote execution과
bounded exit를 수행한다. Remote는 PostgreSQL client 17, root-owned regular
credential metadata, URI parse와 `psql -X --no-password --command '\quit'`
connection-only handshake만 허용하고 SQL/query는 `0`으로 유지한다. Synthetic
success와 SSH-start failure에서 access call `1`, SSH retry `0`, fixed label
allowlist, secret/endpoint output 부재와 cleanup `0` remainder를 통과했다.
Controller SHA-256은
`b54243a4f1112af28cfce1698719e68ffa410d0b72392381f9588722034e7be8`,
remote SHA-256은
`e9b2a694b956af2f8a2812e1e5accf4367292823a7aedb2890de573bcedf54f3`,
shared library SHA-256은
`8e099f8210e9e0193ba2ae96e57fbbfad509c21385e7d85092d6e5cd8d8af23b`다.
짧은 `TMPDIR=/tmp` 전체 회귀는
`260 tests / 253 pass / 7 explicit skips / 0 fail`, typecheck, build,
production application/provider/schema asset fixtures와 production dependency
audit finding `0`, diff check를 통과했다. Shellcheck는 local toolchain에 없어
Bash syntax와 executable fixtures로 검증했다. 실제 AWS/production/credential/
DB/OpenAI 접근은 `0`이다. 다음 gate는 existing root-only DB credential read와
connection-only handshake를 포함하므로 별도 owner 승인이 필요한 exact
external 실행이다.

Owner가 이 exact third execution을 승인했고 CloudShell에서 controller bundle
hash와 pinned asset hash를 검증한 뒤 controller를 정확히 한 번 제출했다.
Controller start는 PASS했지만 access acquisition이 FAIL해 첫 stop condition에서
재시도 없이 종료했다. 이 고정 label은 access API 실행 실패와 access response
검증 실패를 구분하지 않고 원문 provider output도 보존하지 않으므로 원인은
미확정이다. SSH connection/remote entry, application credential
metadata/read/parse, DB connection/query와 row read/mutation, production
file/config/systemd/service/release mutation과 OpenAI 호출은 모두 `0`이다.
Controller private transient cleanup은 즉시 PASS했다. Interactive CloudShell
wrapper의 `EXIT` trap은 terminal이 열린 동안 실행되지 않아 outer bundle과
run directory가 처음에는 남았지만, exact user-owned 두 항목만 cleanup-only로
삭제하고 최종 `transient_remainders=0`을 재검증했다. 결과는
`docs/operations/openai-summary-schema-failure-stage-third-execution-result-2026-07-28.md`
에 기록했다. 이 controller는 재실행하지 않으며 다음 gate는 API 실행과 response
schema 검증을 분리하는 더 작은 access-only controller다.

그 access-only controller를
`scripts/run-lightsail-access-response-diagnostic.sh`로 구현했다. 15초 bounded
access API exit를 `access_api`, 필수 response field의 type/shape 검증을
`access_response`로 분리하고 원문 provider/parser output과 access value는
출력하지 않는다. SSH, production command, application credential, DB와
OpenAI 경로는 존재하지 않는다. Synthetic success, API failure와 invalid
response fixture에서 각각 access call `1`, retry `0`, fixed label, 원문 오류
비노출과 cleanup remainder `0`을 통과했다. Controller SHA-256은
`77ffa2c53ec88ebcd3cfc201ce62a9fdf94fbd5fe83f31204d3fe93144080525`,
fixture SHA-256은
`91487a1e421bbf9e17144d774c6a1f28ccbc79912f9279a1ed04cbc5b2dbb855`다.
실제 AWS/API/production/credential/DB/OpenAI 접근은 추가로 수행하지 않았다.
새 external access API 1회 실행 범위는
`docs/operations/openai-summary-lightsail-access-response-diagnostic-approval-request-2026-07-28.md`
에 고정했으며 별도 owner 승인 전에는 실행하지 않는다.

Owner가 access-only 범위와 현재 AWS 사용을 승인했다. Exact bundle과 controller
hash를 CloudShell에서 검증하고 controller를 정확히 한 번 실행했으며
`controller_start=PASS`, `access_api=FAIL`에서 zero-retry stop condition으로
중단했다. Response validation, SSH/production command, application credential,
DB connection/query, production mutation과 OpenAI 호출은 모두 `0`이다.
Controller와 outer CloudShell/local transient cleanup은
`transient_remainders=0`으로 PASS했다. Cleanup 뒤 값과 응답을 모두 버리는
별도 session-liveness API 1회는 PASS했으므로 현재 CloudShell AWS session
자체는 유효하다. 뒤이어 제안한 일반 Lightsail read command는 terminal
receiver에 제출되지 않아 외부 호출 `0`이며 해당 terminal을 닫아 폐기했다.
따라서 새 IAM user/key/token은 필요하지 않지만, provider error를 출력·보존하지
않고 retry도 금지한 현재 증거만으로 action/target/region/CLI execution 경계
중 어느 원인인지는 확정할 수 없다. 결과는
`docs/operations/openai-summary-lightsail-access-response-diagnostic-result-2026-07-28.md`
에 기록했으며 이 controller는 재실행하지 않는다.

후속 output-silent Lightsail read-boundary controller와 fixture를 추가했다.
Regional instance list와 exact-target read를 각각 최대 1회, 15초로 제한하고
access-detail, SSH, production command, credential, DB와 OpenAI 경로는 포함하지
않는다. Success와 service API/response, target API/response 실패 fixture에서
stop-first, retry `0`, fixed label만 출력, provider 원문과 target 비노출을
통과했다. Controller SHA-256은
`4af081a2ac09015c3d5a9e222a4bba78686fc5af3b382c4662c8f8c907c65c8e`,
fixture SHA-256은
`4385b5aa9374eb5e3bf9a9b706529fca15532e78dd85e791d99dc69e2df90385`다.
CloudShell에서 exact archive와 controller hash를 검증하고 controller를 한 번
실행했으며 session/service response/target response와 cleanup이 모두 PASS했다.
외부 호출은 regional list `1`, exact-target read `1`, retry `0`이고
access-detail/SSH/production/credential/DB/OpenAI 호출과 mutation은 `0`이다.
CloudShell/local transient는 모두 제거했다. 따라서 기존 session, region,
Lightsail service와 exact target 조회는 정상이며 미해결 실패는 access-detail
action 또는 그 action-specific 실행 경계로 좁혀졌다. 새 IAM user/key/root
credential은 필요하지 않다. 결과는
`docs/operations/openai-summary-lightsail-read-boundary-diagnostic-result-2026-07-28.md`
에 기록했으며 failed access-only controller는 재실행하지 않는다.
Fresh verification은 Bash syntax, read-boundary/access-response/bounded
SSH/schema controller·remote fixture, application integration/production
application/provider default-off/production schema asset fixture를 모두
통과했다. 전체 회귀는 `260 tests / 253 pass / 7 explicit external skips /
0 fail`, typecheck, build, production operator policy, dependency audit
finding `0`과 diff check를 통과했다.

OpenAI summary synthetic spike의 marker oracle 불일치를 수정했다. Adapter
prompt와 합성 evaluator가 marker 원문 보존, 정확히 1회 출력, CORE→
`coreDiscussion`, DECISION→`decisions`, ACTION→`actionItems`,
UNRESOLVED→`unresolved` 귀속, marker 입력 시 unmarked output 금지를 공유한다.
Evaluator는 응답 원문 없이 omission, duplicate, wrong-section, unmarked-item
count만 반환하며 각 실패 조건의 fake 회귀가 통과했다. 짧은 macOS `TMPDIR`에서
전체 회귀는 `260 tests / 253 pass / 7 explicit external skips / 0 fail`이고
typecheck, build, production dependency audit와 diff check가 통과했다. 실제
OpenAI 호출, credential 사용, production mutation과 provider/quota/game
observation 활성화는 수행하지 않았다. 새 immutable candidate
`f42e2b06b23695bee113091581aba635ec343494`, exact archive SHA-256
`962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b`,
`640107` bytes를 고정했다. CloudShell Amazon Linux에서 official Node
`24.18.0` checksum, `247 tests / 240 pass / 7 explicit PostgreSQL-tool skips /
0 fail`, typecheck/build/prune/audit, Linux fixture, compiled marker contract,
8개 byte-identical migration, writable file `0`과 네 default-off flag `0`을
재검증했다. 최종 home/tmp artifact는 모두 `0`이며 Gate A가 통과했다. 다음
단계인 이 exact tuple의 synthetic-only OpenAI spike 승인 요청서를 작성했다.
승인 전 credential 생성, OpenAI 호출, production staging/activation은 없으며,
요청 범위도 invented Korean input 1회, retry 0, 응답 원문 없는 네 marker count,
cleanup과 네 flag `0` 유지로 제한된다.

OpenAI summary adapter를 production 비활성 상태로 bot assembly에 조립했다.
고정 snapshot `gpt-5.4-mini-2026-03-17`, Responses API `store:false`,
strict structured output, 4,096 output-token 상한과 120초 deadline을 사용한다.
`/요약`은 provider 작업 전에 Discord interaction을 defer하며, provider flag가
exact `1`일 때만 bot-only systemd credential을 읽는다. Base unit의 provider,
rolling-hour quota와 game observation flag는 모두 `0`이다. 합성 transport
회귀만 수행했고 credential 주입, 실제 원문 전송과 production mutation은 하지
않았다. 로컬 전체 회귀는 `254 tests / 247 pass / 7 explicit external-URL
skips / 0 fail`이며 typecheck, build, production asset과 dependency audit가
통과했다. Immutable candidate
`cff6308846a447cda17cdf9c496a8b85192ce3ae`, exact archive SHA-256
`9badc975212b2d6d3d23bc7db6a3d2598760b69d3a9d71825bd55d1c78051fd9`,
`632208` bytes를 고정했고 clean Linux exact archive Gate A가 통과했다.
CloudShell Amazon Linux 2023에서도 official Node `24.18.0` checksum, exact
archive identity, fixtures, isolated stage, build/prune/audit, compiled adapter,
8개 migration, writable file 0과 네 flag `0`을 재검증했다. 최종 home/tmp
matching artifact는 모두 `0`이다. Owner가 provider retention 경계와
synthetic-only production spike를 승인한 뒤 exact candidate를 비활성 stage하고
OpenAI Responses API를 정확히 1회 호출했다. 호출은 2,613 ms에 structured
response까지 파싱했지만 `marker_validation_failed`로 실패했고 재시도하지
않았다. OpenAI usage는 1 request, 342 total/input tokens, 표시 비용 `$0.00`이며
owner가 전용 key를 폐기했다. 근본 원인은 adapter prompt/schema가 marker 보존
계약을 요구하지 않는데 일회성 runner는 marker 정확히 1회·정확한 section·
unmarked item 0을 요구한 test-oracle 불일치다. Credential, runner, transient
unit과 실패한 staged release를 제거했고 current/previous, health와 네
default-off flag는 유지됐다. 새 prompt/evaluator 계약, 회귀, immutable
candidate와 별도 spike 승인이 다음 gate다.

ADR-0021/PLAN-0010 owner 승인에 따라 `/요약` quota를 등록 사용자별 rolling
1시간 1회로 교체했다. Migration `0008`은 daily default, 개인 override,
한국 날짜 counter와 reset 모델을 제거하고 operation-idempotent reservation
ledger만 유지한다. 등록 사용자 row lock으로 20개 동시 요청 중 정확히 1개만
예약됐고, 59분 59.999초 거부·정확히 60분 허용·다른 사용자 독립성을 disposable
PostgreSQL 17에서 확인했다. Production web assembly는 legacy dashboard quota
flag를 읽지 않으며 summary quota와 game observation flag는 계속 `0`이다.
로컬 전체 회귀는 `247 tests / 240 pass / 7 explicit external-URL skips /
0 fail`, clean PostgreSQL 17 Linux 전체 회귀와 typecheck·build·production
asset 검증도 통과했다. 새 immutable candidate와 exact archive Gate A 고정이
다음 단계다.

KBO는 2026-07-27 owner 결정으로 현재 제품 명세, 구현, 완료 기준과 배포
범위에서 제외했다. 과거 연구 ID와 기록은 추적성만 유지하며, 재개하려면 새
제품 정책과 요구사항부터 승인한다.

Candidate `1785255`의 production migration은 checksum mismatch에서 안전
중단됐다. Read-only 진단 결과 `0003`/`0004`의 CRLF historical checksum은 exact
staged compiled module이 정상 허용했고, 실제 원인은 migration `0005` ledger에
canonical SHA-256의 `a6` 두 글자가 빠져 62자로 기록된 historical 오기였다.
이 exact 값은 version 5와 canonical `0005` SQL이 모두 일치할 때만 허용하도록
제한했다. 새 candidate `1d9a1fa37e0049a9de4281704d369e35ae7ee275`,
archive SHA-256
`867aa6e4b64906626d3c322c661f10c8da8af2e5e5075d167ef147f5225855b4`,
`611980` bytes를 고정했다. Disposable PostgreSQL 17 전체 검증은
`246 tests / 239 pass / 7 explicit external-boundary skips / 0 fail`이며,
clean Linux Node 24 exact archive stage와 compiled checksum scope 검증도
통과했다. CloudShell Amazon Linux 2023에서도 official Node `24.18.0` checksum,
release-manager fixture, exact isolated stage, migration asset 7개,
compiled version-5 compatibility scope, migration `0007` hash와 quota flag
`0`/`0`을 재검증했다. 최종 CloudShell `/tmp`와 home matching artifact count는
각각 `0`이다. Production mutation은 수행하지 않았고 Gate A는 통과했으며 새
exact production 승인이 남았다.

Linux fixture cleanup을 한 줄 수정한 새 candidate `1785255`를 고정했다.
CloudShell Amazon Linux 2023에서 exact archive SHA-256과 `611578` bytes,
checksum 검증한 임시 Node `24.18.0`, release-manager test exit `0`, exact
stage, migration runner와 byte-identical SQL 7개, migration `0007` hash,
quota flag 두 개의 default-off를 확인했다. 최종 CloudShell `/tmp`와 home
artifact count는 모두 `0`이고 production mutation도 `0`이다. Gate A exact
archive stage는 통과했으며 exact production mutation은 별도 owner 승인을
기다린다.

저장소에 기록된 운영 상태를 기준으로 소유자가 직접 보관해야 하는 offline
`age` 복구 identity, 외부 계정 복구 수단, 재발급 가능한 service credential과
최소 장애 복구 순서를 루트 `OWNER_BACKUP_AND_ACCOUNT_CHECKLIST.md`에 정리했다.
비밀값은 기록하지 않았으며 계정별 MFA/recovery code, identity 두 번째 사본,
도메인 갱신 상태는 실제 보유 여부를 확인해야 한다.

PLAN-0008 Gate B의 exact encrypted archive를 offline recovery identity가 있는
별도 Mac에서 disposable PostgreSQL 17로 복원했다. Wrong identity 거부,
archive byte/hash·manifest 일치, schema version 6, expected row count 97,
invalid constraint/FK 0, 21초 복원과 임시 IAM reader·archive·container 정리를
확인했다. Gate B는 통과했으며 migration 0007과 default-off 후보 배포는
여전히 별도 owner 승인 대상이다.

PLAN-0008 production 후보의 선행 검토에서 migration 0007 전 quota store와
dashboard quota API/UI가 무조건 조립되는 결함을 발견했다. Bot enforcement는
`WAW_SUMMARY_QUOTA_ENABLED=1`, dashboard quota API/UI는
`WAW_DASHBOARD_QUOTA_ENABLED=1`일 때만 각각 독립적으로 활성화하며 systemd
asset은 두 값을 모두 `0`으로 고정했다. 기본 상태에서 quota API는 404이고
browser는 quota endpoint를 호출하거나 UI를 표시하지 않는다. 전체 local 검증은
`231 tests / 223 pass / 8 PostgreSQL tool skips / 0 fail`,
typecheck·build·production asset test·diff check 통과다. 새 immutable 후보를
고정한 뒤 metadata-only Gate A를 재개한다.

PLAN-0008 Tasks 2–7을 local/disposable 범위에서 구현했다. Migration 0007은
기본 10회, 등록 사용자 override/disable, 한국 날짜 counter와 operation별
reservation을 additive하게 추가한다. PostgreSQL 17 disposable 검증에서
20-way 동시 요청 중 정확히 10건만 예약됐고 duplicate, RLS 및 workload 최소
권한을 확인했다. Redacted command-log/quota API와 administrator optimistic
mutation, Pretendard Direction A React UI, 모바일 labelled row, Riot 승인
후속 refresh 및 recent-auth 안내를 구현했다. Production Task 8은 미수행이며
Gate A metadata preflight와 Gate B fresh encrypted backup/restore 승인이 남았다.

Discord 연결 UX를 `/라이엇계정 연결 계정:<이름#태그>` 한 입력으로 단순화했다.
Discord slash command의 이름 없는 위치 인자 제약 때문에 `연결` subcommand와
`계정` option label은 유지하되, Riot 로그인 사용자명은 받지 않는다.
초기 배포에서 interaction 변환기가 제거된 option 이름을 계속 읽어 응답 전에
실패한 결함을 수정하고, 등록 정의와 runtime option 이름의 통합 회귀 테스트를
추가했다.

ADR-0020/PLAN-0009 owner 승인에 따라 Dashboard PUUID 직접 입력을 제거했다.
관리자 승인 IPC는 request/version만 전달하고, bot-only Riot credential을 가진
adapter가 pending KR game name/tag line을 Account API로 조회한다. 일치하는
bounded 응답의 PUUID만 기존 원자 mutation에 전달하며 browser DTO·IPC 요청·
로그·감사에는 PUUID를 싣지 않는다. 연결 표시는 계속
`admin_approved_unverified`로 소유권 인증과 구분한다.
최근 OAuth가 필요한 high-risk mutation을 운영자가 다시 인증할 수 있도록
Dashboard 상단에 서버 세션 폐기 기반 로그아웃 버튼도 추가했다.

`/라이엇계정 연결 계정:<이름#태그>`로 사용자 입력을 단순화하고 platform은
서버에서 `KR`로 고정했다. Dashboard `/api/session`이
계약에는 선언됐지만 누락했던 CSRF 토큰을 JS-readable double-submit cookie에서
반환하도록 수정했으며, 관리자 전용 Riot 요청 목록과 PUUID existence 검증 후
승인 UI를 추가했다. UI는 PUUID를 password input으로 다루고 KR이 아닌 기존
요청의 승인을 비활성화한다. 로컬 회귀 검증 후 새 immutable 후보를 배포하고,
기존 잘못된 요청은 감사 가능한 거절로 정리한 다음 올바른 KR 요청으로 Gate
C/D를 재개한다.

`/도움말`을 네 번째 최상위 Discord 명령으로 추가했다. 응답은 ephemeral이며
`/요약`, `/라이엇계정`, `/몰랭검거`의 목적과 입력 예시, 관리자 전용
정정·취소, 관리자 승인 Riot 연결이 공식 소유권 인증은 아니라는 경계를
안내한다. 명령은 기존 command audit 경로를 사용하며 등록 payload·interaction
handler·bot listener 계약 테스트와 typecheck가 통과했다. Production 배포와
길드 command 등록 readback은 immutable release 검증 뒤 수행한다.

2026-07-27 `dashboard-design-refresh`를 main에 병합하고 문서 번호 충돌을
ADR-0019/PLAN-0008로 정리했다. 승인된 dashboard 후속 계획은 Riot
ADR-0018/PLAN-0007 production Gate C/D와 Gateway 장애 해소 뒤에 시작하도록
선행 조건을 명시했다.

Production 후보 `d6b2e7a`의 식별자 없는 고정 상태·단계 카운트만 관찰한 결과,
Discord login과 lifecycle ready까지는 성공했지만 초기 guild/member
reconciliation이 pending 상태로 무기한 머물렀다. 후보는 이전 immutable
release로 rollback했으며 rollback 조건 외 production mutation은 수행하지
않았다. 근본 원인은 외부 reconciliation 경계에 deadline과 bounded retry가
없던 것이다. PLAN-0004의 승인된 provider timeout·정규화 실패 계약에 따라
각 시도 15초 deadline, 2초 뒤 1회 retry, 식별자 없는
`gateway_member_reconciliation_timed_out` 및
`gateway_member_reconciliation_retry_exhausted` 진단을 구현했다. 로컬 전체
검증은 `218 tests / 211 pass / 7 PostgreSQL tool skips / 0 fail`,
typecheck·server/web build·diff check 통과다. 새 immutable release 후보를
만들어 Gate C에서 최소 45초 동안 connected/current 또는 고정 실패 code를
확인한 다음, 통과한 경우에만 같은 Orca Dashboard 세션에서 Gate D를 재개한다.

첫 후보 `d4f166b`의 Gate C는 systemd bot unit에 세 번째 bot-only Riot
credential 전달 선언이 설치되지 않은 운영 결함을 수정한 뒤 통과했다. Gate D
list는 socket request accepted 뒤 DB execute 단계에서 실패했다. Production
schema version 6, admin result table과 최소 권한은 정상이었고 `waw_bot`의
operation ledger SELECT 거부도 정책대로였다. 원인은 insert-only ledger
claim이 `ON CONFLICT (operation_id) DO NOTHING`으로 arbiter를 명시해
PostgreSQL SELECT 권한을 추가 요구한 것이다. 권한을 넓히는 대신 conflict
target을 생략하는 최소 코드 수정으로 중복 claim 의미와 insert-only 경계를
보존하고 새 후보로 Gate C/D를 재시도한다.

최종 production release `90611ee`는 Gate C의 45초 Gateway
connected/current 관찰과 canonical health HTTP 200을 통과했다. 같은 Orca
Dashboard 세션의 Gate D pending list도 HTTP 200으로 복구됐다. 현재 pending
요청은 0건이므로 owner-approved 승인 mutation, stale 409와 duplicate
reconciliation은 대상을 다시 만든 뒤 완료해야 한다.

PLAN-0008 Task 1의 첫 bounded 계약을 시작했다. Command-log와 사용자 quota의
식별자 비노출 DTO, same-origin endpoint path, 기본 50/허용 1–100 pagination,
opaque cursor 형식, quota reservation port와 `Asia/Seoul` 날짜 경계를
고정했다. 관련 계약 테스트 5개와 typecheck가 통과했으며 persistence/API
구현과 migration은 아직 시작하지 않았다.

2026-07-26 dashboard design refresh의 승인 전 1단계를 시작했다. 기존 React
화면, 정보 구조, 접근성, 반응형과 인증·권한·API 계약을 감사하고 관찰 가능한
성공 기준을 `docs/design/dashboard-refresh-audit.md`에 기록했다. Production
코드는 변경하지 않았으며, 합성 데이터만 쓰는 세 정적 방향(작전 상황판, 수사
기록부, 친구 서버 콘솔)을 `docs/design/dashboard-directions/`에 만들었다.
권고안은 작전 상황판을 구조 기반으로 하고 증거 타임라인과 절제된 slash-command
모티프를 결합하는 것이다. 방향 승인 전 production UI 구현은 시작하지 않는다.
Orca 앱이 `stale_bootstrap`으로 내장 브라우저 runtime을 열지 못해 실제 browser
및 accessibility 검증은 차단 상태이며, production 배포와 main 병합은 수행하지
않았다.

Owner 피드백으로 선택 방향을 Pretendard 기반 현대적 대시보드, 주 콘텐츠인
명령어 사용 로그 테이블, 요약 명령어 일 10회 한도 관리 화면으로 좁혔다.
정적 Direction A를 이 명세로 갱신했다. 조사 결과 bot `command_audit` 쓰기는
존재하지만 현재 dashboard `/api/audit`는 설정 변경만 조회하며,
`LowRiskSettingsDto`에도 enable/version 외 일일 한도·사용량·초기화 계약은 없다.
따라서 프로토타입은 합성 데이터만 사용하고 production 계약을 추가하지 않았다.
실제 구현 전 read model, 한국 날짜 경계, 원자적 사용량 증가, 관리자 mutation,
감사·보존·pagination을 별도 bounded plan으로 승인해야 한다.

후속 architecture를 `ADR-0019-command-log-and-summary-daily-quota.md`
로, bounded sequence를
`PLAN-0008-dashboard-command-log-and-summary-daily-quota.md`로 작성했다.
2026-07-26 owner가 등록 사용자별 quota 모델을 승인해 ADR-0019는 Accepted,
PLAN-0008은 Approved로 전환했다. 각 사용자는 기본 10회를 상속하며 관리자가
1–100 개인 override 또는 사용 중지를 설정한다. `(guild, registered user,
Asia/Seoul date)`별 provider invocation 직전 원자 reservation, 실패·timeout
포함 시도 차감, version 1 수동 reset 제외, redacted cursor command log와
browser DTO의 Discord ID 비노출을 유지한다. 정적 prototype의 `요약 한도
관리`도 등록 사용자 table과 설정 dialog로 갱신했다. Production code와
migration은 아직 구현하지 않았고 PLAN-0008 Tasks 1–7은 후속 bounded 작업,
Task 8 production은 별도 approval gate다. ADR-0018/PLAN-0007의 Riot
PUUID validator Gateway 수정과 production Gate C/D 완료가 PLAN-0008의
선행 조건이다. 처리 시간 열 추가 계약과
command/quota retention은 미해결이다.

PLAN-0005는 2026-07-26 기준 Local/Disposable Complete다. Tasks 1~8의
summary·Riot link·game observation port, domain, PostgreSQL과 fake Discord
통합이 완료됐다. Exact-source PostgreSQL 17 전체 실행은
`215 pass / 6 explicit external-URL integration skips / 0 fail`이며, bot은
감사 INSERT만 가능하고 감사 SELECT·UPDATE는 거부됨을 실제 workload role로
검증했다. 외부 summary provider, Riot API/RSO, Discord command 등록과
production Task 9는 별도 승인 gate를 유지한다.

Clean commit `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b`의 immutable source
archive SHA-256은
`7a72e9fe5bc2c9b3ed87ca86e60efae7b1033ac47b62c3f33c39b63b65c7d27b`이며,
격리 release stage·clean install·typecheck·build·production asset 검증을
통과했다. 이 archive는 preflight 증거일 뿐 production에 배포하지 않았다.

Production `/health`는
2026-07-25 재확인 시 HTTP 200 `healthy`로 회복됐으며 이전 transient
`degraded`의 정확한 component는 미확정. 외부 provider/RSO/API key, Discord
등록, production migration·배포는 승인 gate 유지.

Dashboard의 Riot 관리자 기능을 bot executor에 연결하는 경계는
`ADR-0017-dashboard-bot-admin-command-ipc.md` Accepted 상태다. 결정은 기존
4 KiB member-role lookup socket을 범용화하지 않고 별도 권한 제한 Unix socket,
bot-side current-role 재확인, 안정된 operation ID와 timeout 후 영구 결과 조회,
mutation·terminal result·감사 원자 transaction을 사용한다. PLAN-0006 승인과
구현 전까지 production dashboard port는 계속 503 fail-closed다.
후속 `PLAN-0006-dashboard-bot-admin-command-ipc.md`는 owner 승인 뒤
In Progress 상태다.

2026-07-26 owner가 PLAN-0006 bounded sequence를 승인했고 Tasks 1~7은
local/disposable 완료다. Version 1은 네 관리자 command만 허용하고 32KiB
frame, 최대 15초 TTL, exact keys, request/operation ID 분리와 allowlisted
response를 강제한다. `0006_admin_command_result`와 bot application service는
current administrator 선검사, bounded cursor pagination, durable duplicate
readback, stale·active PUUID conflict·validator unavailable을 처리한다.
Disposable PostgreSQL 17에서 강제 audit 실패 시 domain mutation·operation·
terminal result 전체 rollback을 확인했다. 별도 socket transport는 기본 3초
deadline, 한 request/reply, 최대 8 connection과 안전한 owned-stale-path 검사를
구현했고 mutation timeout은 `outcome_unknown`이다. Bot/web assembly, systemd와
production 연결은 아직 구현하지 않아 기본 dashboard port는 계속 503
fail-closed다. 주입형 dashboard IPC ports는 HTTP current admin·CSRF·recent
OAuth·confirmation 뒤 영구 web 감사를 먼저 저장하고, 감사 실패 시 IPC를
호출하지 않는다. Unavailable/stale/unknown은 각각 503/409/504이며 duplicate는
원 operation 결과를 조회해 mutation 재실행 없이 재조정한다.
Bot/web main assembly와 repository systemd assets에는 관리자 IPC가 기본
비활성 feature gate로 조립됐다. Duplicate bot은 socket listen 전에 종료하고
shutdown은 admin socket→member-role socket→Gateway→DB 순서다. 전용 runtime
path/group과 web supplementary group을 선언했으며 web의 bot token, bot의 OAuth
secret·CSRF key 비주입을 asset test로 확인했다. Production host의 unit, group,
directory와 실행 서비스는 변경하지 않았다.
Disposable Ubuntu 24.04/PostgreSQL 17 process 검증에서 실제
`waw-bot:waw-admin-command` socket `0660`, directory `0750`, `waw-web` 허용,
unrelated user 거부, SIGKILL stale restart, malformed flood와 8 connection
상한 후 회복을 통과했다. Concurrent 승인은 link 하나만 만들었고 50ms timeout
뒤 terminal success를 조회했으며 audit trigger 실패는 request·operation·result
전체를 rollback했다. Harness 종료 뒤 container/network/image는 모두 0개다.
Task 7 최종 증거는 local `198 pass / 1 intentional Windows Unix-path skip`,
typecheck/build, production·integration asset dry-run, Ubuntu 24.04/PostgreSQL
17 migration 1~6 process 재검증과 forbidden canary 부재다. PLAN-0006은
Local/Disposable Complete이며 production Task 8은 별도 owner approval,
read-only AWS/Supabase preflight, 새 backup/restore와 provider 결정 전에는
시작하지 않는다.
PLAN-0006 Task 8 Gate A는 2026-07-26 owner 승인 뒤 metadata-only로
완료했다. Canonical `/`와 `/health`는 각각 HTTPS 200이고 health body는
`healthy`였다. Production release, unit, identity, group/socket 부재,
backup/monitor, schema ledger 0001–0004, RLS/grant와 workload role을
read-only로 확인했다. Owner가 제공한 인증된 Chrome AWS session에서는
Lightsail `StatusCheckFailed` alarm이 enabled/`OK`, threshold `1`, 5분 period,
evaluation/datapoints `2/2`, missing data 미평가임을 확인했다. 알림 대상
상세는 기록하지 않았다. Production 변경은 0이며 Gate B는 별도 owner 승인을
기다린다.

Gate A 보완에서 migration checksum을 LF canonical form으로 전환하고, 내용이
동일한 CRLF rendering만 legacy 대안으로 인정하도록 제한했다. Production
0001-0004의 실제 mixed-line-ending ledger 회귀와 disposable PostgreSQL resume,
고정 SHA-256 source archive의 격리 stage/typecheck/build가 GREEN이다. 따라서
checksum portability blocker는 해소됐으며 production 변경은 없었다.
고정 rollout candidate `aaf50697510bb90c04b7678c8e6b1ca0b0bd469b`와
archive SHA-256도 격리 preflight를 통과했다.

PLAN-0006 Task 8 Gate B는 owner가 exact change set을 승인해 시작했다.
Fresh encrypted backup과 valid `published` marker는 확인했으나 offline
recovery identity가 별도 Mac에 있어 empty-target restore는 실행하지 못했다.
Owner는 이 recovery risk를 명시적으로 수용하고 rehearsal을 2026-07-27로
유예했다. 이는 이번 실행에 한정된 prerequisite 예외이며 archive를
`verified`로 만들거나 backup policy를 변경하지 않는다. Git archive branch는
DB 복구 수단이 아니며 mutable하므로, 현재 full commit/archive hash와 release
directory를 rollback evidence로 유지하고 추가 원격 landmark가 필요하면 성공
후 별도 승인된 immutable release tag를 우선한다.

2026-07-25 PLAN-0005 bounded slice에서 owner-approved 한국어 명령 명칭,
`/몰랭검거` 체계, interaction normalization, PostgreSQL command audit,
한국어 summary handler와 cache 없는 Discord history pagination/failure
adapter를 local 구현했다. Discord listener 조립·명령 등록과 외부 provider
연결은 아직 수행하지 않았다.

후속 bounded slice에서 Discord listener 조립을 완료했다. Listener는 singleton
bot에만 부착되고 shutdown 전에 해제되며, 일곱 한국어 명령 dispatch와 command
audit DB 실패의 fixed-code·무응답 경로가 fake client 통합 테스트를 통과했다.
외부 command 등록·Portal 변경과 production bot DB credential 주입은 미실행이다.

PLAN-0005 Task 5 request slice에서 Riot command executor를 bot main에
조립했다. 연결 요청은 PUUID 없이 `pending_admin_approval`로 저장되고,
관리자 승인 adapter가 PUUID를 제공한 뒤에만 활성화된다. Disposable
PostgreSQL에서 활성 PUUID 충돌·감사 보존과 감사 실패 전체 rollback을
검증했다. 외부 Riot API/RSO와 production migration은 미실행이다.

관리자 요청 목록·승인·거절 executor와 주입형 PUUID validation port를
추가했다. Non-admin 선거부, request version 기반 stale·중복 결정 거부,
승인/거절/권한 감사와 transaction rollback이 local/disposable PostgreSQL에서
GREEN이다. 실제 validator adapter와 관리자 UI는 아직 미연결이다.

Riot 관리자 dashboard API의 DTO·route·port와 high-risk 인증 경계를 local
구현했다. Web runtime의 DB 권한은 확대하지 않았으며 production port는
bot local-command IPC가 승인·구현될 때까지 503 fail-closed다.

PLAN-0005 Task 6 persistence slice에서 외부 API를 호출하지 않는 게임 관측
executor와 PostgreSQL store를 추가했다. Riot과 Go Live 증거는 별도 행으로,
비교 결과는 incident에 저장된다. Queue 420 allowlist, `(platform, game ID)`
중복 재사용, stale 거부, 명시적 `unknown`, 5분 시작 유예·2분 중단 허용과
부분 generation 충돌의 transaction rollback이 local/disposable PostgreSQL에서
GREEN이다. Scheduler와 실제 Riot/Discord 관측 adapter 조립은 아직 미실행이다.

Task 7 command slice에서 `/몰랭검거 현황|정정|취소` executor를 bot main에
조립했다. 현황은 Riot·Go Live·비교 상태를 분리해 한국어로 표시한다.
정정·취소는 Discord current-role을 incident 조회 전에 재확인하고, 현재
incident version을 읽어 mutation에 전달한다. Disposable PostgreSQL에서
stale 거부, revision·operation·감사 동시 commit과 감사 실패 전체 rollback을
검증했다. 외부 등록과 production 변경은 수행하지 않았다.

Task 6 scheduler slice에서 주입형 Riot observer와 Discord voice source를
결합하는 scheduler를 구현했다. Link별 동시 poll을 하나로 제한하고,
rate-limit·timeout·adapter 장애를 `unknown`으로 정규화하며 timeout 뒤 늦게
도착한 응답은 저장하지 않는다. Gateway disconnect는 기존 Go Live 증거를
`unknown`으로 바꾸고 reconnect 전체 조회가 끝난 뒤에만 reconciled 상태로
복구한다. Fake source와 실제 비교 executor 통합 테스트는 GREEN이며 외부
Riot/Discord 호출과 production timer 조립은 수행하지 않았다.

후속 scheduler assembly slice에서 활성 PostgreSQL Riot 링크만 조회하는 target
source와 Discord `VoiceStateUpdate`·Ready/Resume·Disconnect adapter를
추가했다. Bot assembly는 singleton claim 성공 뒤 listener·timer를 붙이고
shutdown 전에 timer와 listener를 제거한다. systemd feature gate는 명시적으로
`0`이며 실제 Riot observer가 없는 상태에서 `1`은 fail-fast한다. Fake
discord.js client와 disposable PostgreSQL 검증은 GREEN이고 외부 API·Portal과
production 상태는 변경하지 않았다.

PLAN-0001 Task 1~5 local foundation 완료; PLAN-0002 Task 1~3 production backup/restore 완료; PLAN-0003 Tasks 1~4 production monitoring rollout 완료; PLAN-0004 Approved·Tasks 1~5 및 G1/G4 완료; G5 host preflight 중 발견한 malformed backup marker 수정·재발행 완료; `ADR-0015` Accepted와 production entrypoint/release assembly local GREEN; G2/G3, production migrations `0003`~`0004`, G5 배포·G6~G7와 최초 vacuum은 별도 gate 유지

## 완료

- Discord 운영 경보를 서비스·백업·인증서·저장 공간·시스템 로그별 한국어 임베드로 표시하는 전송 포맷과 안전한 미등록 코드 fallback 구현 및 local test 완료
- 한국어 Discord embed 전환의 exact candidate/predecessor hash, read-only production preflight, one-file rollout acceptance와 state·credential 보존 rollback 절차 확정
- 제품 정책 초안 작성
- 배포 및 보안 요구사항 초안 작성
- Codex 작업 흐름 정의
- 연구, ADR, 구현, 검토용 프롬프트 작성
- 대시보드 운영 도메인을 `waw.dubeom.com`으로 확정
- 로컬 `codex-settings`의 공통 에이전트 규칙을 프로젝트 전용 절차와 충돌 없이 병합
- `codex-settings` 플러그인 설치 스크립트의 명령과 영향 범위 검토
- 초기 기술 제약사항과 안정적인 요구사항 ID 추출
- 요구사항 추적표, 기술 결정 지도와 증거 기반 조사 순서 작성
- `OWN-001`~`OWN-009` 제품·운영 조사 입력 확정
- Discord Gateway·메시지 조회·Go Live·OAuth 공식 가능성과 제약 조사
- Riot 계정 연결과 솔로 랭크 시작·종료 감지 가능성 조사
- KBO 데이터 공급·재표시 권리·갱신 SLA 가능성 조사
- 대화 요약 API의 컨텍스트·지연·비용·보존 제약 조사
- 네 외부 플랫폼 조사의 중복, 요구사항 공백, 가정 경계와 사용자 결정 항목 통합 검토
- `ODR-001`~`ODR-005`, `ODR-007` 소유자 결정 확정 및 `OWN-010`~`OWN-015`로 추적
- KBO 기능을 허가된 공급 경로 확보 전까지 연기
- `OWN-001`~`OWN-015`를 반영한 D-03 데이터 흐름·위협 모델 작성
- 정책의 네 배포 형태와 API·queue·공유 저장소·이벤트 방식의 웹-봇 통신 경계 조사
- MacBook 우선 시나리오를 `waw.dubeom.com`, 월 3만 원, RPO 24시간과 RTO 8시간에 연결
- `D08-Q01`~`D08-Q06`을 확정하고 `OWN-016`~`OWN-021`로 추적
- 외부 임대 단일 서버와 OS 비종속 자가 단일 서버의 경계, Vercel Hobby 비용 기준과 Windows 대체 host 후보 확정
- RPO/RTO 판정 범위, 일반 변경의 제한된 비동기 처리와 heartbeat 기반 상태 요구 확정
- SQLite, 자가 PostgreSQL과 관리형 PostgreSQL의 무결성·접근 경계·백업·복구·비용·이식성 비교
- 초기 분리 배포 가정에서는 관리형 PostgreSQL을 첫 검증 후보로 두었고, `OWN-034` 이후 단일 server 경계에서는 자가 SQLite를 첫 검증 후보로 재정렬하되 저장소 선택은 보류
- `D05-Q01`~`D05-Q04`를 확정하고 `OWN-022`~`OWN-025`로 추적
- 장애 중 dashboard 허용 범위, 월 명령 10,000회, PITR 비필수와 조건부 관리형 무료 tier 허용 확정
- Discord OAuth identity, 현재 guild/role 검증, server-side session과 workload 인증 경계 후보 비교
- Discord `identify` + bot-side member 조회 + opaque session을 첫 검증 조합으로 정리하되 인증 기술 선택은 보류
- `D07-Q01`~`D07-Q06`을 확정하고 `OWN-026`~`OWN-031`로 추적
- Discord OAuth 전용 로그인, 1일 유휴·7일 절대 세션, 5분 read-only 역할 cache와 user token 비보존 확정
- 임의 preview 인증 비활성화와 고위험 작업의 15분 recent-auth·현재 역할·명시적 확인 확정
- D-05·D-07·D-08을 통합해 저장소·session·bot-side 역할 조회·내부 통신의 결합 제약과 후보 조합별 남는 경계 검토
- `GAP-INT-01`~`GAP-INT-07`, `INT-Q01`~`INT-Q02`와 실행하지 않은 최소 Spike 후보 4개 정리
- `INT-Q01`~`INT-Q02`를 확정하고 `OWN-032`~`OWN-033`으로 추적
- host 장애 중 5분 read-only cache와 고위험 작업의 Discord OAuth 재완료 기준 확정
- 경계 왕복·기본 거부 Spike에서 로컬 서명·replay·key rotation·5분 cache와 기본 거부 계약 검증
- 별도 Vercel preview→자가 host 임시 outbound tunnel 왕복이 function timeout으로 5초 기준을 충족하지 못해 Spike 실패 판정
- 임시 Vercel project·deployment, tunnel, server, credential과 project metadata 정리 완료
- 첫 Spike 실패는 Vercel→익명 임시 `ssh -R` tunnel→자가 host 조합만 탈락시키며 직접 API·분리 배포 전체를 탈락시키지 않는 것으로 범위 확정
- 동일 익명 tunnel 반복 검증은 보류하고, D-05 결과에서 공유 저장소가 남을 때만 outbound-pull 경계 Spike를 검토
- 월 10,000회 × 1년 합성 감사·dedupe·session 데이터의 SQLite·PostgreSQL database와 export가 모두 40MB 미만임을 측정
- 두 local engine에서 동일 `operation_id` 32회 동시 제출, transaction 중단·재시도와 foreign key 검증 통과
- 공유 저장소 outbound-pull Spike에서 local DB query와 worker request/result 처리는 확인했지만 Vercel 함수가 pooled·unpooled 모두 timeout되어 실패 판정
- 임시 Vercel project·deployment, Neon resource·integration, DB role·credential과 local metadata 정리 완료
- named ngrok endpoint는 local 이중 인증 요청을 463ms에 처리했지만 Vercel preview가 function timeout되어 세 번째 경계 Spike도 실패 판정
- ngrok·Vercel 시험 endpoint, project·deployment, agent·server와 모든 local credential·metadata 정리 완료
- `INT-Q03`을 확정하고 `OWN-034`로 추적
- 첫 MVP의 web·bot을 단일 지속 server 경계에 두고 public web→bot network 경계를 제거하기로 확정
- Vercel Hobby 필수 배포 의도는 철회하되 개인·비상업·저비용 조건은 유지하고 임대 server와 소유 Mac·Windows 선택은 D-09로 이관
- TypeScript·Node.js·discord.js, Python·CPython·discord.py, Java·OpenJDK·JDA를 D-04 현실 후보로 공식 문서와 공식 저장소 기준 비교
- 세 후보의 Gateway 재연결·Go Live Voice State 지원, 단일 bot 실행의 host 책임, 시험성, Windows·macOS·Linux 호환성과 공급망 통제를 대조
- TypeScript·Node.js·discord.js를 잠정 첫 검증 후보, Python·discord.py를 가장 강한 대안으로 두되 언어·런타임·SDK 선택은 보류
- `D04-Q01`을 확정하고 `OWN-035`로 추적
- TypeScript와 Python을 모두 유지보수 가능한 공동 최종 후보로 유지하고 Java·JDA는 두 후보가 기준을 충족하지 못할 때 재평가하기로 확정
- 저가 외부 임대 Linux VM, 보유 Mac과 대체 Windows 노트북을 D-09 단일 지속 server 후보로 비교
- 임대 VM을 문서상 초기 검증 후보, 보유 Mac을 가장 강한 대안, Windows를 복구·조건부 primary 후보로 비교했으며 host·OS 선택은 보류
- 자가 장비·전원·가정망 ingress, 실제 runtime 자원, 단일 실행과 빈 환경 복구를 `GAP-D09-01`~`GAP-D09-06`으로 추적
- `D09-Q01`~`D09-Q02`를 확정하고 `OWN-036`~`OWN-037`로 추적
- 신규 host 비용 0원을 우선해 보유 장비 자가 hosting을 먼저 검증하고 필수 기준 실패 시 저가 임대 VM으로 돌아가기로 확정
- 장비 한 대의 전용 운용과 필요한 전원·자동 시작·공유기·DNS·tunnel 설정을 허용하되 구체 host·ingress 기술 선택은 보류
- Mac 읽기 전용 확인에서 M5·16GB·충분한 disk와 정상 battery·FileVault·Discord outbound를 확인
- Mac의 AC sleep 활성, firewall 비활성, 보안 update 지연과 정전 후 자동 부팅 미지원 및 교육장 회선 미승인을 확인하되 실제 공인 IP는 비기록
- `OWN-038`로 `OWN-036`의 우선순위를 대체하고 저가 외부 임대 VM을 첫 검증 범주, Mac과 LG Gram 16을 fallback으로 확정
- 서울 Lightsail 1GB, 도쿄 Akamai Shared CPU 1GB와 싱가포르 DigitalOcean Basic 1GiB를 D-09 현실 shortlist로 공식 가격·region·network·backup 자료에 따라 비교
- VM 기준 월 USD 5~7, Akamai·DigitalOcean의 고정 native backup 포함 월 USD 7~7.80과 Lightsail의 사용량 기반 snapshot 비용을 확인하고 provider backup과 독립 backup의 경계를 구분
- 서울 Lightsail을 잠정 첫 검증 후보, 도쿄 Akamai를 가장 강한 외부 대안으로 두되 공급자·region·OS·plan 선택은 보류
- 세 공급자 동시 비교를 생략하고 서울 1GB fixture에서 TypeScript·Python을 순차 비교하는 최소 runtime 수용량 Spike 제안 작성; VM 생성·실행은 미승인
- 서울 Lightsail 1GB Spike의 읽기 전용 사전 확인, 비운영 SSH key, 생성·firewall·측정·HTTPS 확인·삭제와 잔존 과금 resource 검사 runbook 작성; 실행은 미승인
- D-09 TypeScript·Python 폐기 가능 harness의 문법과 3초 local 합성 self-check 통과; VM system metric과 60분 안정성은 미검증
- Linux `/proc` 기반 CPU p95·available memory 연속 저하·swap-out·process exit·실행 시간 측정기와 failure-path verifier local 검증 완료
- AWS 공식 IAM 자료 기준 서울 region·필요 action·Spike tag로 제한한 임시 최소 권한 정책과 IAM으로 제한되지 않는 key pair·bundle·blueprint·CIDR 경계 문서화
- 첫 `aws login` 검증에서 `waw-spike` profile이 IAM 사용자가 아닌 root console session으로 연결된 것을 감지해 resource 생성 없이 즉시 logout·cache 무효화
- 재인증 뒤 최소 권한 `waw-spike-operator` identity 확인; 서울 Ubuntu 24.04 LTS와 public IPv4 `micro_3_0` 2 vCPU·1GB·40GB·월 USD 7 fixture 사전 확인 통과
- 첫 두 생성 시도는 Lightsail `publicKeyBase64`에 bytes와 이중 base64 text를 각각 전달해 key import 단계에서 실패; OpenSSH public key 원문 `file://` import→delete probe 통과 및 VM·key·local private key 잔존 없음 확인
- 후속 생성 시도에서 Lightsail의 교차 resource type 이름 namespace 때문에 동일 timestamp의 key·instance 이름이 충돌함을 확인; 활성 VM·key 잔존 없음 확인 후 UTC timestamp와 `-key`·`-vm` suffix로 분리
- 첫 VM 생성은 성공했으나 API state `running`을 `Running`과 비교한 wait 결함으로 90초 뒤 자동 삭제; instance·key 잔존 없음 확인 후 lowercase 비교로 수정
- 실행 VM 생성·관리 단말 `/32` SSH 제한 성공; `gateway.discord.gg` root의 정상 404를 실패로 본 outbound probe를 credential 없는 `discord.com/api/v10/gateway` 200 경로로 수정
- VM 10초 smoke에서 TypeScript·Python의 application·Linux system 기준 전체 통과; Python Linux RSS를 누적 peak가 아닌 실제 `VmRSS` p95로 보정하고 임시 self-signed HTTPS health fixture local 검증 완료
- Ubuntu 기본 Node 18의 D-04 후보 부적합을 발견해 진행 중 장기 측정을 참고 폐기; 공식 SHA-256으로 검증한 Node 22.23.1과 보정 Python fixture의 VM 10초 smoke 전체 통과
- Supabase Free 검증용 별도 disposable project `waw-storage-spike-20260721` 생성·삭제 완료; 기존 production project는 사용하지 않음. Orca 내장 브라우저에서 RLS 활성화 합성 SQL 10,000행 검증(10,000 unique operation, 1,864 kB) 완료. DB password는 채팅·문서에 기록하지 않음. 삭제 성공 toast 확인
- `ADR-0006`으로 Supabase Free PostgreSQL를 첫 MVP canonical storage로 Accepted; Lightsail은 application runtime만 실행하고 24시간 표준 export·빈 host restore 검증을 후속 구현 계획의 필수 조건으로 확정
- `ADR-0007` Discord OAuth `identify`·bot-side current member 조회·opaque server-side session 인증 경계를 Accepted; token 미보존, 1일 idle/7일 absolute session, 5분 read-only role cache와 고위험 recent-auth 계약 확정
- `ADR-0015`를 owner 승인으로 Accepted 전환하고 versioned JSON Lines Unix
  socket client/server, 4KiB allowlist frame, 3초 fail-closed deadline,
  request-ID binding, unsafe stale path 거부와 AuthService의 tier-only reader
  composition을 구현
- 실제 `dist/server/web/main.js`·`bot/main.js` production assembly, Discord
  live member fetch/role mapping, loopback `/health`, bot health snapshot,
  PostgreSQL `0004` low-risk setting과 operation/audit atomic persistence를 구현
- Production unit과 G4 fixture unit을 분리하고 staged loopback Caddy,
  conflict-safe asset installer, immutable source stage·activate·previous
  rollback manager를 추가; local 136 tests(Windows Unix-path test 1 skip),
  typecheck, server/web build와 shell contract 3종 통과
- TypeScript Node 24 workspace와 local command contract를 추가해 valid/expired/malformed/duplicate operation의 합성 단위 시험 4개를 통과; 외부 credential·network·Supabase 연결 없이 Task 1 완료
- versioned Supabase PostgreSQL migration 초안과 session hash·revocation·idle/absolute expiry persistence contract를 추가해 합성 단위 시험 4개를 통과; remote database에는 연결·변경하지 않아 Task 2 완료
- OAuth state hash·single-use/expiry, 5분 read-only role cache, mutation default-deny, high-risk recent-auth·CSRF·explicit confirmation contract를 추가해 합성 단위 시험 6개를 통과; Discord OAuth credential·network 호출 없이 Task 3 완료
- web·bot·migration/backup의 capability 표와 TypeScript capability injection contract를 추가해 web의 bot token/role reader 접근과 bot의 browser command 접근을 합성 시험 3개로 차단; Task 4 완료
- health/singleton contract를 추가해 Gateway disconnected 시 `degraded`, storage failure 시 `unavailable`, duplicate bot lease claim 거부를 합성 시험 4개로 검증; 실제 Gateway/host 없이 Task 5 완료
- Orca 앱 설치·CLI 연결과 active worktree comment 갱신 완료
- 최신 fixture의 중복 실행을 process inventory로 폐기하고 30초 Node·Python smoke 및 4개 verifier unit test 통과
- 서울 Lightsail 임시 VM에서 Node 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- 서울 Lightsail 임시 VM에서 Python 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- D-09 host 결정 Accepted: 서울 Lightsail을 primary로 사용하고 Windows를 복구·비용 절감 fallback으로 유지하며 MacBook은 운영 후보에서 제외
- 임시 HTTPS `/health` 다섯 회 HTTP 200 확인 후 포트·server·certificate 제거; VM·SSH key·static IP·disk·snapshot 잔존 없음 확인
- AWS session logout과 local 임시 state 정리 완료; capacity Spike 결과는 합성 workload 한계와 함께 문서화
- D-04 공식 runtime·SDK 지원 현황 갱신, D-08 단일 지속 server ADR Proposed 작성 후 owner 승인으로 Accepted 전환
- D-08 Accepted ADR을 기준으로 bounded 구현 계획 Draft 작성
- D-12 backup/restore 후보를 공식 Supabase·R2·S3 자료로 비교하고, Supabase Free의 24시간 logical export·off-site encryption·empty Windows restore 요구를 Proposed `ADR-0008`로 정리
- `ADR-0008` Accepted: 기존 AWS S3에 30일 rolling client-side encrypted PostgreSQL archive를 보관하고 backup 전용 IAM·budget monitoring·empty Windows restore 검증을 필수로 확정
- D-13 backup encryption 도구를 `age`, OpenSSL passphrase, S3 SSE-KMS-only로 비교하고 public recipient/offline identity 기반 Proposed `ADR-0009`를 작성
- `ADR-0009` Accepted: `age` public-recipient encryption을 사용하고 runtime에는 public recipient만, private identity는 owner offline custody에 보관
- synthetic `age` recipient encryption contract에서 temporary key·SQL의 gzip encrypt/decrypt byte round trip과 archive secret marker 부재를 확인하고 temporary directory 자동 정리
- `PLAN-0002` S3 encrypted backup/restore 계획 작성: local manifest verifier, disposable S3 restore Spike, production job·rehearsal을 credential gate별 bounded task로 분리
- PLAN-0002 Task 1의 archive manifest verifier를 추가해 non-secret metadata만으로 hash·schema version·retention·row count·invariant 검증을 수행하고 valid/invalid 합성 unit test 4개 통과
- PLAN-0002 Task 2의 disposable S3 transport Spike에서 client-side encrypted synthetic archive 1개 생성·upload·object 목록 확인·object/bucket 삭제와 최종 bucket count 0을 확인; local Docker PostgreSQL 16 empty-target companion에서 encrypted dump byte round trip·row count·invariant restore를 확인하고 containers/temp artifacts를 삭제. Orca download hook 한계로 S3 downloaded-byte checksum 및 Windows/new-host restore와 least-privilege IAM/lifecycle 검증은 미완료로 기록
- S3 CLI byte-checksum 보완을 위해 temporary self-managed access key를 생성했으나 Orca의 CSV download hook이 expected local path에 파일을 전달하지 못해 실행하지 않음; secret 비저장 상태로 key를 비활성화·삭제하고 final access-key count 0을 확인. owner가 temporary self access-key IAM policy attachment를 제거했고 새 console session의 IAM deny로 확인
- `OPS-005`~`OPS-007` recovery evidence를 위한 Windows/new-host encrypted PostgreSQL restore runbook 작성; S3 download checksum, wrong-identity failure, empty target restore, non-secret verifier와 same-run cleanup 순서를 고정
- 서울 Lightsail Ubuntu 24.04 disposable new host에서 wrong-identity failure, encrypted archive byte/hash equality, empty PostgreSQL 16 restore, schema version `1`, row count `2`, foreign-key orphan `0`, invariant를 통과; containers/temp script와 tagged instance를 제거하고 final instance count `0` 확인
- Lightsail console read 권한 부재로 성공한 제출이 오류 화면 뒤에 가려져 생성된 중복 instance 4대를 발견 즉시 삭제; capacity/restore 정책의 목적 tag 분리를 유지하면서 console inventory/browser SSH용 regional read와 global distribution/domain read를 템플릿에 반영
- PLAN-0002 Task 2 S3/IAM transport 보완에서 uniquely named disposable bucket과 tagged writer/reader로 client-side encrypted object의 실제 upload→download byte count·SHA-256 및 decrypt 비교를 통과; writer Put-only와 read/delete/IAM·bucket-policy 변경 deny, reader Get-only와 put/delete deny, `backups/` 한정 30일 lifecycle read-back을 확인
- transport 결과를 서울 disposable new-host의 wrong `age` identity failure 및 valid PostgreSQL 16 empty-target restore 결과와 연결; access key·inline policy·IAM user·object·bucket·temporary plaintext/ciphertext/passphrase·CloudShell runner를 same-run 제거하고 bootstrap inline policy와 이전 S3 full-access attachment까지 제거. `cleanup_complete`, matching resource/policy count `0`, S3 console bucket count `0` 확인 후 PLAN-0002 Task 2 완료
- PLAN-0002 Task 3의 production-free 준비로 backup publication 계약을 추가; dump/encrypt/upload 성공, uploaded byte/hash manifest 일치와 local plaintext/ciphertext cleanup 전부를 요구하고 부분 실패는 `unverified`로 유지. production credential·Supabase/network·scheduler에는 접근하지 않음
- owner-approved PLAN-0002 Task 3 production 실행에서 backup-only PostgreSQL role, prefix Put-only S3 writer와 서울 Lightsail 일일 scheduler를 배포하고 실제 encrypted logical dump 2회를 게시; 최신 7,084-byte object의 upload→download byte/SHA-256 연속성과 `backups/` 한정 30일 lifecycle 확인
- production writer의 Get/Delete/bucket-policy/IAM deny와 temporary exact-object restore reader의 put/delete/other-get/IAM deny를 확인; wrong identity 실패 뒤 disposable PostgreSQL 17 valid restore에서 schema version `1`, row count `0`, invalid constraint `0`, elapsed `30`초를 확인하고 verified marker 게시
- temporary reader/key/policy, staged archive/dump, restore container/image, deploy key와 CloudShell artifact를 제거하고 expected recurring bucket/writer/access key/host만 유지; timer active/enabled와 secret file mode `0640` 확인 후 PLAN-0002 Task 3 완료
- D-10 dashboard web framework/self-host 연구에서 Fastify API+Vite/React Router SPA, Next.js standalone과 React Router SSR/BFF를 공식 문서로 비교; 명시적인 server authorization·schema/DTO·log 경계 때문에 Fastify+SPA를 잠정 첫 Spike 후보, Next.js를 strongest alternative로 정리하고 실제 선택은 보류
- D-10 Fastify+React Router SPA credential-free vertical slice에서 exact lock clean install/audit `0`, authorization test `4/4`와 Vite production build 통과; 첫 실행의 AJV additional-field silent removal을 발견해 explicit reject로 보정하고 generated dependency/build artifacts 삭제
- D-10 증거를 바탕으로 `ADR-0010` Fastify API+Vite/React Router SPA dashboard 구조를 Proposed로 작성; owner 승인 전 Accepted나 production dependency로 승격하지 않음
- owner 승인으로 `ADR-0010`을 Accepted 전환; Fastify API를 browser command/query 경계로, Vite/React Router SPA를 untrusted same-origin client로 선택
- D-15 서울 Lightsail application 배포에서 systemd 직접 실행과 rootful/rootless Docker Compose를 공식 자료와 현재 1GB/backup 경계로 비교; 추가 daemon·image 관리면 없이 Linux user/cgroup/journald를 재사용하는 systemd를 잠정 추천
- `ADR-0011` systemd 직접 application 배포를 Proposed로 작성; Docker Compose는 host 이전/native dependency/registry 요구가 생길 때의 strongest alternative로 유지하고 production host에는 아직 설치하지 않음
- owner 승인으로 `ADR-0011`을 Accepted 전환; first MVP application은 Docker 없이 별도 Linux user의 systemd web/bot service와 immutable release symlink로 배포
- 서울 disposable Ubuntu 24.04 1GB systemd 배포 Spike에서 web/bot cross-secret deny, web crash 재시작, bot singleton exit `73`, failed-release rollback, service별 `MemoryMax=128M`, localhost-only web bind와 실제 `boot_id` 변경 뒤 reboot recovery를 통과; 실패 실행마다 정리를 확인하고 최종 instance/key 및 CloudShell artifact count `0` 확인
- D-10/D-11 HTTPS ingress에서 Caddy, Nginx+Certbot과 Lightsail load balancer를 공식 자료로 비교; 단일 systemd component로 automatic HTTPS와 loopback proxy를 제공하는 Caddy를 잠정 추천하고 `ADR-0012`를 Proposed로 작성
- Owner 승인으로 `ADR-0012`를 Accepted 전환; Caddy만 public 80/443을 소유하고 Fastify는 loopback-only로 유지하며 production DNS/ACME/firewall은 별도 승인 전 변경하지 않음
- Credential-free Caddy 2.11.4 local CA Spike에서 config validation/invalid deny, HTTP `308`, HTTPS proxy·forwarded header, wrong-host deny, Authorization/Cookie/OAuth query log redaction과 same-PID reload를 통과하고 RSS `52,572 KiB` 측정; container/listener/temp CA·config·log/image 최종 부재 확인
- D-11 application secret 주입에서 systemd credential, EnvironmentFile과 AWS Parameter Store/Secrets Manager를 공식 자료로 비교; Lightsail service role 부재로 AWS bootstrap credential을 추가하지 않고 root-owned source + `LoadCredential=`를 잠정 추천해 `ADR-0013`을 Proposed로 작성
- Owner 승인으로 `ADR-0013`을 Accepted 전환하고 synthetic-only disposable Ubuntu 24.04 credential 격리·rotation·rollback runner를 작성·정적 검증; CloudShell launch 권한 부족을 instance 생성 전에 확인해 최소 임시 managed policy JSON을 저장소 루트에 Git 비추적 상태로 준비
- Owner 지시에 따른 root CloudShell의 서울 disposable Ubuntu 24.04 systemd credential Spike에서 source/runtime·cross-service 격리, process/environment/journal 부재, stop cleanup, atomic rotation, failed rotation rollback과 singleton 복구를 통과; 검증 runner의 sudo redirection·root-only compare 결함과 singleton lock race를 보정하고 최종 `runner_exit=0` 확인
- Matching Lightsail instance·key pair·static IP·disk·snapshot, CloudShell runner/result와 local transfer artifact를 모두 `0`으로 확인; eu-north-1/us-east-1 CloudShell environment와 임시 customer-managed IAM policy를 삭제하고 exact policy 검색 `0`건 및 `temporary-cloudshell-policy.json` 부재 확인. 최종 root 실행으로 `waw-spike-operator` CloudShell 경계는 미검증
- D-11 journald 보존·redaction·경보에서 local persistent journal, WAW namespace와 CloudWatch/remote 수집을 Ubuntu/systemd·AWS·Fastify·Caddy·Discord 공식 자료로 비교; 운영 로그 30일/1GiB/4GiB-free, source allowlist redaction, 별도 Discord webhook과 Lightsail status-check email 조합을 잠정 추천
- `ADR-0014`를 Proposed로 작성하고 `PLAN-0003`을 local 계약, disposable Ubuntu Spike, production-free asset, owner-approved rollout의 네 bounded Task로 분리; repository workflow에 따라 ADR 승인 전에는 계획을 실행하지 않음
- Owner 승인으로 `ADR-0014`를 Accepted 전환; local persistent journald 30일/1GiB, source allowlist redaction, 별도 Discord webhook과 Lightsail status-check 경보 계약을 확정
- PLAN-0003 Task 1에서 새 dependency 없이 operational field allowlist와 alert evaluator를 구현; synthetic forbidden field/redaction, unit·health debounce/recovery, backup·certificate·journal threshold, suppression, 6시간 reminder와 stale input을 targeted `7/7`, 전체 `37/37` test 및 typecheck로 검증
- PLAN-0003 Task 2의 서울 disposable Ubuntu 24.04 systemd 255 Spike에서 persistent journald reboot 보존, invalid config rollback, 축소 30초 retention·16MiB capacity, synthetic web/bot/Caddy/backup allowlist와 credential/journal cross-read deny를 통과
- Loopback fake webhook의 firing/dedupe/6시간 reminder/recovery, 429 `Retry-After`, timeout 2회 제한과 강제 monitor failure rollback을 통과하고 final secret/forbidden-field scan, `journald_alerting_spike_passed`, `runner_exit=0` 확인
- 첫 harness 실행의 root-only request log 검증 권한 오류도 remote/AWS cleanup 각 6개 항목 `0`을 확인한 뒤 보정; 최종 실행과 별도 inventory에서 instance/key/static IP/disk/two snapshot 유형, CloudShell uploaded file과 local temp artifact를 모두 `0`으로 확인하고 서울 CloudShell environment 삭제 후 `No active tabs` 확인
- PLAN-0003 Task 3에서 exact 30일/1GiB/4GiB-free journald drop-in, root monitor service/timer, file-credential Discord sender, non-secret config, reversible default-deny installer와 운영 runbook을 추가
- Loopback fake webhook에서 file credential, 429 one-retry, no mentions, 1,800-byte ceiling, fixed delivery failure와 state 미승격을 targeted `1/1` 및 typecheck로 검증; 새 dependency와 package-lock 변경 없음
- Ubuntu 24.04/systemd 255 clean root에서 idempotent install, exact effective config, unit/timer verify, unrelated config 보존, rollback과 conflicting target deny를 통과해 `monitoring_assets_dry_run_passed`, `ubuntu_24_04_monitoring_assets_passed`, `runner_exit=0` 확인
- 첫 Task 3 disposable 실행의 missing `sysinit.target` test fixture 실패도 AWS 여섯 유형 cleanup `0` 뒤 보정; 최종 별도 inventory, CloudShell/local artifact가 모두 `0`이고 CloudShell environment 삭제 후 `No active tabs` 확인. Production host·실제 webhook·alarm·credential은 변경하지 않음
- PLAN-0003 Task 4 backup-only production preflight에서 Ubuntu 24.04, active/enabled backup timer, 16MiB journal과 36GiB free를 확인하고 runtime health/certificate를 비활성화한 최소 monitoring config를 확정
- Node 24.18.0 공식 checksum, asset SHA-256과 systemd verify 후 persistent 30일/1GiB/4GiB-free journald 설정을 restart/read-back하고 monitor timer/service를 활성화
- 승인된 `waw-discord-bot` channel에서 synthetic backup-timer critical firing과 resolved recovery를 확인; 잘못 연결되거나 노출된 webhook 두 개는 즉시 삭제하고 최종 credential을 no-echo root input과 mode `0600`으로 회전
- Verified recovery email과 Lightsail `StatusCheckFailed` threshold `1`, 5분 period, evaluation/datapoints `2/2`, `ALARM`·`OK` notification read-back 완료
- Monitoring asset/credential 제거와 unit 부재·backup 생존을 확인한 rollback rehearsal 뒤 desired state를 재적용하고 production reboot persistence, monitor/backup active+enabled, journald active, monitor exit `0`, host/CloudShell temporary artifact `0` 확인; 최초 vacuum은 실행하지 않음
- Accepted ADR-0006·0007·0010~0014와 완료 PLAN-0001~0003을 실제 저장소와 대조하고, contract-only 구현과 미구현 Supabase adapter·OAuth/Fastify route·React/Gateway/runtime·production deployment 경계를 명시한 `PLAN-0004` Draft 작성
- PLAN-0004를 Supabase persistence, OAuth authorization, dashboard vertical slice, Gateway runtime, disposable systemd integration, owner-approved Lightsail rollout, canonical DNS/HTTPS/monitoring 확장의 7개 bounded Task와 독립 credential gate로 분리
- PLAN-0004 owner 승인 뒤 Task 1 RED에서 PostgreSQL adapter 부재를 확인하고 exact `pg@8.22.0`·`@types/pg@8.20.0`, transactional migration runner, RLS/grant migration, 최소 persistence adapter와 systemd file-credential loader 구현
- Disposable PostgreSQL 17.10에서 migration/reapply/rollback, FK·RLS와 web/bot deny, session/OAuth/5분 cache, 16-way dedupe·audit rollback, DB size snapshot·failure redaction integration 계약 통과; production Supabase/credential 미사용
- PLAN-0004 Task 2에서 browser-bound single-use OAuth state, bounded callback
  input, exact redirect/Origin, token 미보존, opaque session callback·privilege
  rotation, logout/revoke, 5분 read cache와 mutation/high-risk default-deny를
  framework-neutral service로 연결; targeted `21/21`, disposable PostgreSQL
  `10/10`, 전체 `90/90`과 typecheck 통과
- Production 미적용 `0003` candidate의 privilege rotation과 충돌하던
  `last_oauth_completed_at >= created_at` 하한을 제거하고
  `last_oauth_completed_at <= last_seen_at`는 유지; candidate SHA-256
  `7c807c9113524103eed0314565ac6263facc49098e1d0c5eedf13038ddb97a5f`
- PLAN-0004 Task 3/4 local 구현을 통합해 strict Fastify dashboard API,
  React 접근성 상태 UI, CSRF-bound mutation, fake Gateway lifecycle,
  singleton lease, discord.js signal adapter와 loopback web entrypoint를 추가
- Windows shell glob에 의존하지 않는 TypeScript test discovery runner를 추가;
  non-PostgreSQL test `123/124` 통과, 기존 monitor delivery test 1건은 Node
  20 환경에서 실패했고 PostgreSQL integration은 Windows toolchain 부재로 미실행
- Node 24.18.0 재검증에서 monitor child entrypoint의 Windows path 판정과
  PostgreSQL fixture의 Unix-only `mkdir`를 수정하고 non-PostgreSQL `124/124`,
  browser accessibility `1/1`, typecheck와 build를 통과
- React Router CSRF advisory 범위였던 `8.2.0`을 fixed `8.3.0`으로 갱신해
  `npm audit` high/critical finding `0` 확인
- PLAN-0004 Task 5 production-free 준비로 web/bot 분리 unit, synthetic-only
  integration entrypoint, Caddy fixture, conflict-safe installer와 Ubuntu host
  verifier를 추가; local asset test와 `systemd-analyze verify` 통과
- G4 owner-approved 서울 disposable Ubuntu 24.04/1GB 실행에서 Node 24.18.0,
  PostgreSQL 17, tests `124/124`, web/storage loopback, cross-credential와
  process/journal 격리, duplicate bot exit `73`, crash restart, storage failure,
  failed-release rollback, cgroup와 reboot recovery를 통과
- Fresh Caddy default conflict, release traversal, PostgreSQL peer role,
  runtime credential introspection과 listener readiness race를 실제 host에서
  발견해 runner를 보정; 각 실패와 최종 실행 뒤 prefix resource를 정리하고
  별도 AWS inventory의 instance/key/static IP/disk/snapshot count `0` 및
  CloudShell artifact 제거를 확인

## 진행 중

- 예상 사용량과 고정비가 미확정인 항목의 복수 시나리오 유지
- D-09 세 region의 공개 latency·plan 재고, 1GB 자원과 VM·GPT·domain·backup 총비용 검증 대기
- 서울 VM capacity 결과·HTTPS 확인·resource cleanup 결과를 D-09 문서와 PROJECT_STATUS에 반영 완료
- 선택된 TypeScript·Node.js·discord.js product runtime의 실제 Gateway·Go Live·자원·시험성·공급망 검증 대기
- Accepted 저장소 구조의 local PostgreSQL adapter와 G1 production Supabase migration 완료; 뒤 OAuth/배포 통합은 별도 gate 대기
- G1 exact archive의 SHA-256/7,084 bytes와 manifest를 확인하고 wrong identity 거부 뒤 disposable PostgreSQL 17 restore에서 schema version 1, row count 0, invalid constraint 0을 확인
- Approved hashes의 production baseline ledger adoption과 `0002`를 단일 transaction으로 적용; versions `[1,2]`, checksum/RLS/policy/grant/role deny matrix read-back 완료
- Temporary IAM user/key/policy, archive/manifest/dump, SSH key와 restore container 제거; backup/monitor timers·journald active, timers enabled, services success, Lightsail alarm `OK` 확인
- `journalctl --grep` no-match exit `1`과 empty stdout/stderr만 suppression 0으로 처리하고 다른 실패는 invalid로 유지하는 `journal.dropped` false-critical fix를 production에 배포; 10회 clear 뒤 resolved 전달, timer/service/backup/journald/alarm과 cleanup 확인
- Application web/bot/Caddy와 canonical certificate 배포 뒤 monitor expected unit·health·certificate 범위 확장 대기
- 최초 production journal vacuum은 oldest/newest UTC와 usage를 재확인한 별도 owner-approved maintenance window 대기

## 다음 작업

2026-07-28 현재 제품 완성 critical path는 다음 순서다. 먼저 access-detail
action을 포함한 summary preflight correction, synthetic marker spike,
default-off rollout, disclosure/credential/activation과 owner의 실제 Discord
smoke까지 완료했다. 따라서 summary 사용자 기능은 critical path에서
제거한다. 다음 순서는 owner가 승인한 KR Riot 연결 요청 하나를 생성해
Gate C/D 관리자 승인 경계를 완료하고, 동일한 동의된 계정과 명시된 시간
범위로 Riot/Go Live observation spike를 수행하는 것이다. 그 뒤 clean Linux
exact-archive, canonical HTTPS/OAuth/authorization/singleton/monitoring,
backup/restore applicability, redaction과 rollback을 최종 검수한다. Owner의
offline recovery identity, account recovery, domain renewal과 reissuable
credential 확인도 완료 기준에 포함된다. 최초 journald vacuum은 제품 완성과
독립된 maintenance gate다.

현재 production release `90611ee`는 Gateway Gate C, canonical health와
Dashboard Gate D pending-list 조회를 통과했지만 pending 요청은 `0`건이다.
다음 bounded 외부 단계는 동의한 테스트 사용자가
`/라이엇계정 연결 계정:<이름#태그>`로 본인의 KR 계정 요청 하나를 만드는
것이다. 실제 Riot ID, Discord 사용자 ID와 PUUID는 저장소·운영 문서·로그에
기록하지 않는다. 요청 생성 뒤 owner-approved 관리자 승인 mutation,
stale/duplicate reconciliation을 완료하고, observation spike는 정확한 후보와
시간 범위를 별도로 고정한 뒤에만 `WAW_GAME_OBSERVATION_ENABLED=1`을
일시적으로 사용한다.

Task 5와 G4는 완료됐다. G5 전 production operator 최소 권한 policy
template·renderer·local deny contract와 Task 6 runbook도 준비됐다. Exact instance
inventory, named operator, browser SSH와 host preflight까지 완료했으며 preflight에서
발견한 malformed backup marker도 별도 승인 후 수정·재발행했다. 다음 bounded
local task는 현재 integration fixture를 가리키는 units를 배포 가능한 production
web/bot assembly와 immutable release installer로 교체하는 것이다. Actual OAuth G2,
bot-side member lookup G3, production migration `0003`, application production 배포,
DNS/TLS G6, monitoring G7과 최초 production vacuum은 각각 별도 gate를 유지한다.

2026-07-25 owner-approved AWS console read-only inventory에서 production host가
Running, 서울 1GB/2vCPU/40GB dual-stack이고 public firewall은 IPv4/IPv6 SSH
22만 열려 있으며 status-check alarm은 enabled/OK임을 확인했다. Console UI에
instance UUID/ARN이 노출되지 않았지만 별도 승인된 root CloudShell read-only
조회로 exact UUID와 running state를 확정했다. Exact-target operator policy를
로컬 렌더링하고 SHA-256과 allowlist contract를 검증했으며 IAM 생성/연결과
host SSH preflight는 당시 아직 실행하지 않았다. 그 inventory 단계에서는
AWS/IAM/network/host 변경이 없었다.

이후 owner-approved named-operator SSH preflight에서 Ubuntu 24.04.4, capacity,
SSH-only listener, backup/monitor timers, journald와 protected path를 확인했다.
Backup marker의 migration rows `1`/`2` 직렬화 결함을 발견해 rollout을 중단하고
single latest version validation을 구현·production 적용했으며 새 marker는 valid
JSON, schema version 2, published, row count 0이다. Lightsail alarm은 root
read-only CloudShell에서 다시 `OK`로 확인했다. Production operator의 instance
detail UI는 unrelated distribution/certificate/domain reads를 요구해 aggregate
403을 반환하므로 broad read 권한은 추가하지 않았다.

## 차단 요소

- Homebrew AWS CLI API 경로는 기존 Python 3.14·system `libexpat` 충돌로 사용할 수 없어 공식 AWS CLI container 경로를 사용함; 임시 profile 인증과 서울 VM 실행은 완료
- `codex-settings/scripts/install.sh`는 Codex 사용자 환경에 Ponytail과 Superpowers 플러그인을 설치하므로 프로젝트 외부 변경 승인 전에는 실행하지 않음
- Riot Production/RSO 승인 가능성과 시작·종료 5분 감지는 미확정
- 예상 사용자 수, 메시지량, 월 요약 요청 수와 동시 게임 수가 미확정이므로 외부 API 비용·처리량은 복수 사용량 시나리오로 유지
- 단일 server host, GPT API, 도메인과 외부 백업을 합친 원화 비용이 월 3만 원을 충족하는지 미확정
- 서울 Lightsail·도쿄 Akamai·싱가포르 DigitalOcean의 실제 plan 재고·지연과 1GB bot+web 자원 여유가 미확정
- 자가 Mac은 hardware가 충분하지만 정전 후 자동 부팅 미지원이며 교육장 회선은 서면 승인 전 운영 경로에서 제외
- 월 명령 10,000회의 실제 저장·backup 크기와 무료 관리형 DB 한도 충족 여부가 미확정
- Discord OAuth의 PKCE 지원 범위와 D-05·D-08 경계에 맞는 workload 인증·credential rotation 방식이 미확정
- 익명 임시 outbound tunnel의 Vercel→자가 host 호출이 function timeout으로 실패했으며 원인이 Vercel egress, tunnel 공급자 경로, 지역 또는 연결 정책 중 어디인지는 분리하지 못함
- 공유 PostgreSQL request/result도 worker 처리와 별개로 Vercel function timeout이 발생해 고위험 현재 역할 조회의 5초 동기 경계가 아직 없음
- 계정 고정 managed tunnel도 local 왕복은 성공했지만 Vercel function timeout으로 실패해 공급자 교체만으로 추가 검증할 근거가 낮음

## 현재 확정되지 않은 사항

- Riot 데이터 공급 방식
- 요약 모델 공급자
- 실제 product dependency exact version과 lockfile audit 결과
- Supabase workload role·RLS·connection mode의 production 최소 권한
- Discord OAuth PKCE 실제 지원 범위와 고정 production redirect 검증
- 같은 host의 실제 web·bot local role-query 구현과 production credential read deny
- 선택 host에서 실제 product bot+web+Caddy의 idle/peak memory와 event-loop pause
- 실제 Gateway 단절·Resume, Go Live reconciliation과 배포 중 단일 bot 실행 검증
- Production web/bot main assembly, immutable release installer와 fixture가 아닌
  production systemd ExecStart/rollback contract
- 저가 VM의 1GB급 bot+web 자원 여유와 VM·backup·domain·GPT 원화 총액
- Riot 5분 감지 실패 시 완화할 목표 또는 수동 경로의 장기 정책
