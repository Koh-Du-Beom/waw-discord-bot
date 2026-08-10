# KBO production activation checklist

- Status: Gate B default-off rollout complete; operator deny evidence and Gate C remain
- Canonical dashboard: `https://waw.dubeom.com`
- Scope: migrations `0013`~`0019`, KBO Discord commands, dashboard and flags

이 문서는 KBO 구현을 Production에 적용할 때 사용할 실행 전 체크리스트다. 현재
완료 상태는 배포 후보 준비까지이며, migration, Discord REST 등록, release 배포와
feature 활성화를 승인하거나 수행한 기록이 아니다. 비밀값, Discord message 원문과
사용자 식별자는 증거에 남기지 않는다.

## Gate 0 — 외부 활성화 조건

다음 항목을 모두 서면 증거로 고정하기 전에는 KBO 데이터 수집과 public betting을
활성화하지 않는다.

- [ ] 외부 봇의 exact application ID, 허용 guild/channel과 공개 응답만을 수집하는
      schema allowlist가 확정됐다.
- [ ] 정상 경기 응답에서 stable game ID, 홈/원정 팀, KST 시작 시각, 경기 상태,
      source 관측 시각과 revision을 확인했다.
- [ ] 종료·취소·연기·더블헤더·공식 정정 응답과 revision 연결 규칙을 확인했다.
- [ ] 외부 봇 개발자가 WAW의 공개 응답 수집·저장·파생 정산·dashboard/Discord
      재표시를 허용했다.
- [ ] Discord Developer Policy와 해당 application 설정상 필요한 Gateway intent 및
      message 접근이 허용된다.
- [ ] 한국 법률 자문, 게임물관리위원회 및 Discord의 public 제공 gate가 모두
      명확하다. 하나라도 불명확하면 betting/rankings는 `0`을 유지하고 정보 조회만
      별도 승인한다.

취소일 Components V2와 월요일 `no_game` 응답만 관찰됐으며, 정상 경기와 정정
schema는 아직 관찰되지 않았다. 관찰되지 않은 field나 parser를 추측해 채우지 않는다.

## Gate A — exact candidate와 read-only preflight

- [x] 검토된 clean commit, source archive SHA-256, byte 수와 CI run을 기록했다.
- [x] `npm test`, `npm run typecheck`, `npm run build`,
      `bash deploy/test-production-application-assets.sh`, `git diff --check`가 같은
      candidate에서 통과했다.
- [x] Build가 source와 byte-identical한 migration 19개를 포함하고 기존 KBO flag 세 개가
      모두 `0`임을 확인했다.
- [x] 새 source candidate의 `WAW_KBO_COMMANDS_ENABLED=0`과 모든 KBO command의 delegate/store
      미호출 회귀를 확인한다.
- [x] Active/previous release, schema version/checksum, workload grants/RLS, backup·
      monitoring·Gateway 상태를 approved read-only identity로 확인했다.
- [x] 새 encrypted backup이 24시간 이내이며 disposable empty PostgreSQL 17에서
      restore rehearsal과 schema/data invariant를 통과했다.

Archive staging과 host preflight는
`production-application-deployment-runbook.md`의 exact SHA·secret 비출력·고정
host-key 경계를 그대로 사용한다. Mismatch는 preflight 안에서 수리하지 않는다.

## Gate B — migration과 release

- [x] One-shot migration identity와 maintenance window를 고정하고 reviewed additive
      migrations `0013`~`0019`만 순서대로 적용한다.
- [x] Version/checksum, constraints, RLS, grants와 `purge_expired_kbo_accounts`의 exact
      bot EXECUTE/web deny를 read back한다.
- [x] Migration credential을 제거하거나 폐기한다.
- [x] Default-off unit을 포함한 exact immutable release를 배포하고 web/bot health,
      singleton Gateway, admin IPC, backup·monitoring을 확인한다.
- [ ] Canonical dashboard에서 administrator만 KBO aggregate를 읽고 operator는
      거부되며, signed adjustment의 stale/confirmation/recent OAuth 경계를 확인한다.
      Administrator empty aggregate read는 2026-08-10 PASS했다. 별도 operator 계정이
      없어 Production operator deny는 미검증이다.
- [ ] 탈퇴 event/reconciliation, 열린 bet 정산 보존과 daily retention 호출의 고정
      진단을 확인한다. 실제 사용자 식별자나 message content를 로그로 남기지 않는다.

Application rollback은 previous immutable release로 복귀하되 additive schema와
ledger/audit/settlement를 down-migrate하거나 삭제하지 않는다.

## Gate C — Discord 등록과 단계적 활성화

- [ ] current release와 systemd read-back에서 KBO command/data rights/rankings/betting
      네 flag가 모두 exact `0`인지 확인한다.
- [ ] `scripts/manage-discord-guild-commands.mjs`로 현재 4-root 계약과 reviewed payload
      SHA-256을 확인하고 root-only rollback JSON을 보관한 뒤 `/크보`를 등록·read back한다.
- [ ] 등록 뒤 master `0` 상태에서 `/크보` 한 건이 고정
      `kbo_commands_unavailable`로 끝나고 KBO row가 증가하지 않는지 확인한다.
- [ ] 시험 guild에서 ephemeral 가입·잔액·지급·내역, 경기 ID 노출, public ranking과
      administrator dashboard를 최소 계정으로 smoke test한다.
- [ ] Gate 0의 권리와 실제 ingestion smoke가 통과한 뒤에만
      `WAW_KBO_DATA_RIGHTS_AUTHORIZED=1`로 바꾼다.
- [ ] Canonical game freshness·revision·settlement smoke가 통과한 뒤에만
      `WAW_KBO_RANKINGS_ENABLED=1`을 활성화한다.
- [ ] 잔액·KST 한도·동시 접수·terminal 정산·정정 debt와 Discord 정책 gate가 모두
      통과한 마지막 단계에서만 `WAW_KBO_BETTING_ENABLED=1`을 활성화한다.
- [ ] 위 gate와 backup이 모두 PASS한 뒤 마지막으로 `WAW_KBO_COMMANDS_ENABLED=1`을
      활성화하고 전체 `/크보` command smoke를 수행한다.
- [ ] 각 flag 변경마다 bot을 한 번만 재시작하고 health, fixed reason-code metrics,
      backup/monitoring을 확인한 뒤 다음 단계로 간다.

현재 새 candidate의 기본값은 네 flag 모두 `0`이다. 데이터 ingestion/parser가 없는 candidate에서
rankings나 betting flag를 켜지 않는다.

## 즉시 rollback

1. 새 접수 또는 public 노출 이상이면 commands, betting, rankings, rights flag를 모두 `0`으로
   되돌리고 bot을 재시작한다.
2. 이미 접수된 bet의 settlement와 탈퇴·retention 생명주기는 유지한다. 원장,
   operation, audit와 settlement를 수동 보정하거나 삭제하지 않는다.
3. Release 결함이면 previous immutable release로 복귀하고 호환 migration은 유지한다.
4. Discord command 계약 결함이면 보관한 이전 command JSON을 복원한다.
5. `/health`, Gateway singleton, dashboard, backup·monitoring을 다시 확인하고
   식별자 없는 fixed reason code로 증거를 남긴다.

## 현재 출발 상태

- Source/local 구현: `PLAN-0017`~`PLAN-0038` 완료
- 검증: 전체 `399 pass / 7 기존 환경 skip / 0 fail`, PostgreSQL 포함,
  typecheck/build/production asset/diff check 통과
- Build asset: migrations `0001`~`0019`; 배포된 Production KBO flags `0/0/0`, 새
  source candidate flags `0/0/0/0`
- Production 완료: migrations `0012`~`0019`, exact-tree release `79be3fc04c07`,
  administrator empty KBO aggregate read, KBO flags `0/0/0`
- 미수행: operator deny, Discord REST 등록, 시험 guild command smoke, feature 활성화
- 외부 잔여: Gate 0 전체와 정상 경기·정정 schema 기반 ingestion/parser
