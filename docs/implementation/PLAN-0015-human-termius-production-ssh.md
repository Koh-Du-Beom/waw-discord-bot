# PLAN-0015: Human Termius production SSH transition

- Status: Completed
- Related requirements: production least privilege and lockout prevention
- Related ADRs: ADR-0024; ADR-0029
- Owner: Product owner

ADR-0029 and this plan are approved. Every production step still requires a
separate exact owner approval. AI agents prepare Git-untracked command sets;
the human owner alone enters them in production or external-service terminals.

## 목표

GitHub Actions exact-commit deployment를 유지하면서 human operator를 전용
Termius SSH key와 host account로 분리하고 SSH hardening을 lockout 없이 단계별
검증한다.

## 범위

- repository 문서 정합성
- read-only external inventory gate
- human key/account bootstrap
- root login, forwarding, fail2ban, Lightsail firewall의 독립 전환
- rollback과 postcondition 기록

## 범위 제외

- AI agent의 external terminal 입력
- GitHub deploy key/account/workflow 변경
- application release, migration, credential 또는 feature activation
- ADR 승인 전 dependency 설치와 production 명령

## 선행 조건

- ADR-0029 Accepted
- This plan approved
- Owner가 human account, sudo 범위, 현재 접속 복구 경로와 source CIDR 결정
- Exact read-only inventory와 각 mutation stage 별도 승인
- 사용자만 접근 가능한 Git-untracked `TEMP_*.md` handoff

## 작업

### Task 1: Read-only inventory

- 목적: host, SSH effective config, authorized-key fingerprints, fail2ban,
  listeners, IPv4/IPv6 firewall, and GitHub deploy identity의 실제 pre-state 고정
- 변경 예상 파일: execution result와 inventory 문서만
- 테스트: 값 없는 metadata read-back; secret/content absence scan
- 완료 기준: 사실·미확인·drift 목록과 exact rollback pre-state
- 위험: read 명령이 credential 내용을 출력
- 롤백: mutation 없음; 출력 폐기 후 중단

### Task 2: Human key and account bootstrap

- 목적: `waw-operator`와 human-only Ed25519 key를 만들고 Termius 두 번째
  session 및 sudo를 검증
- 변경 예상 파일: 후속 runbook/result 문서
- 테스트: key fingerprint match, retained session, second login, identity/sudo
- 완료 기준: GitHub key/account 불변과 human login PASS
- 위험: key disclosure 또는 잘못된 sudo grant
- 롤백: 새 public key, sudo drop-in, account만 역순 제거

### Task 3: Deny root SSH login

- 목적: 별도 snippet에서 `PermitRootLogin no`
- 변경 예상 파일: 후속 runbook/result 문서
- 테스트: `sshd -t`, effective config, reload, fresh operator login/sudo
- 완료 기준: root SSH deny와 operator access PASS
- 위험: non-root recovery 미검증 상태의 lockout
- 롤백: snippet restore/remove, validate, reload

### Task 4: Disable SSH forwarding

- 목적: 별도 snippet에서 `DisableForwarding yes`
- 변경 예상 파일: 후속 runbook/result 문서
- 테스트: workflow static review, `sshd -t`, effective config, human login,
  GitHub no-mutation SSH preflight
- 완료 기준: forwarding deny와 both access paths PASS
- 위험: undocumented tunnel/agent dependency
- 롤백: forwarding snippet restore/remove, validate, reload

### Task 5: Enable fail2ban SSH jail

- 목적: Ubuntu archive package와 최소 local `sshd` jail을 별도 gate로 적용
- 변경 예상 파일: 후속 runbook/result 문서
- 테스트: package source/version record, config test, service and jail status,
  retained/fresh login
- 완료 기준: `sshd` jail active; human IP not accidentally banned
- 위험: dependency/service failure or false ban
- 롤백: disable local jail; stop/remove package only if separately approved

### Task 6: Restrict Lightsail SSH firewall

- 목적: owner-confirmed source CIDRs로 port 22를 IPv4/IPv6 각각 제한
- 변경 예상 파일: current external inventory와 result 문서
- 테스트: complete rule read-back, broad duplicate absence, fresh session from
  every approved path, 80/443 unchanged
- 완료 기준: exact desired rules and working operator access
- 위험: dynamic address or one-family lockout
- 롤백: retained AWS console에서 exact pre-state rules 복원

### Task 7: Reconcile durable documentation

- 목적: `README.md`, `PROJECT_STATUS.md`, external-services inventory,
  production runbook을 verified result에 맞춰 최소 갱신
- 변경 예상 파일: 위 네 문서
- 테스트: link check, `git diff --check`, secret/IP/account-ID scan
- 완료 기준: CloudShell은 break-glass, Termius는 human normal path, Actions는
  exact-commit deploy path로 일치
- 위험: dated evidence를 current truth로 덮어씀
- 롤백: documentation-only revert

## 검증 계획

각 Task는 독립 PASS/FAIL/STOPPED 결과를 남긴다. 이전 SSH session을 닫기 전에
항상 새 session을 검증한다. 한 Task 실패를 다음 Task로 보상하지 않는다.

## 배포 및 마이그레이션

Application 배포와 DB migration은 없다. SSH/fail2ban/firewall mutation은
ADR 승인 뒤에도 각각 별도 owner gate다.

## 문서 갱신

실행 뒤 verified evidence만 `PROJECT_STATUS.md`, external-services inventory,
production runbook에 반영한다. `README.md`는 normal/break-glass 경계가 실제로
전환된 경우에만 갱신한다.

## 승인

- Owner decision: All Tasks approved as the implementation plan — require
  separate execution approval before every production stage, provide the full
  ordered commands as one set, and have the human owner enter every command.
- Approved date: 2026-07-31

## 실행 결과

- Task 1: PASS after correcting login-shell `set -e` isolation; mutation `0`
- Task 2: PASS after partial-account/key and sudo-membership recovery;
  human-only Ed25519 key imported into Termius and `waw-operator` fresh
  login/sudo verified
- Task 3: PASS; root SSH login denied after `sshd -t`, reload and fresh login
- Task 4: PASS; forwarding disabled, human login and owner-confirmed GitHub
  no-mutation SSH preflight passed
- Task 5: PASS; fail2ban installed and `sshd` jail verified active after
  correcting non-interactive package installation
- Task 6: DEFERRED BY OWNER; TCP 22 and any IPv4/IPv6 Lightsail source retained,
  with no firewall mutation
- Final read-back: PASS by owner confirmation; host postcondition and GitHub
  preflight succeeded, exact GitHub run ID unrecorded
- Task 7: durable documentation reconciled locally

Application release, migration, credential, feature flag, DB and backup
mutation remained `0`. AI agent external-terminal input remained `0`.
