# PLAN-0015 Task 1 production read-only inventory approval request

- Status: Completed after approved corrected retry
- Date: 2026-07-31
- Related plan: `docs/implementation/PLAN-0015-human-termius-production-ssh.md`
- Command handoff: root-level Git-untracked
  `TEMP_PLAN_0014_PRODUCTION_SSH_TRANSITION.md` Stage 1

## Purpose

Human owner가 현재 production SSH와 Lightsail network pre-state를 읽기만 해
후속 account/key 전환의 rollback 기준을 고정한다. AI agent는 production,
CloudShell, Termius 또는 외부 서비스 terminal에 명령을 입력하지 않는다.

## Exact authorized actions

Owner approval 뒤 human owner만 다음을 정확히 한 번 수행한다.

1. 현재 검증된 human SSH 경로로 production host에 접속한다.
2. 제공된 read-only host command block을 한 번 실행한다.
3. Lightsail console에서 exact instance의 IPv4/IPv6 firewall rule 전체를 읽고
   제공된 redacted result template에 기록한다.
4. 명령 출력에서 secret, public key body, public address, account ID와
   application data를 저장하지 않는다.
5. 결과를 이 worktree에 전달하고 접속을 종료한다.

## Explicitly prohibited

- File, user, group, key, sudo, sshd, fail2ban, package, service 또는 firewall 변경
- `apt update`, dependency 설치, service reload/restart
- GitHub secret/variable/workflow 실행 또는 변경
- Application deployment, migration, credential, feature flag, backup,
  database 또는 Discord/Riot/OpenAI 접근
- `authorized_keys`, sudoers, environment, credential file의 내용 출력
- AI agent의 external terminal 입력

## Expected metadata

- OS release와 kernel
- Effective SSH controls: root/password/public-key authentication and
  forwarding
- SSH service state and TCP listeners without public address retention
- Existing local user names relevant to `ubuntu`/`waw-operator`
- SSH public-key fingerprints only
- fail2ban package/service/`sshd` jail presence
- Complete Lightsail IPv4/IPv6 rules for ports 22, 80 and 443, with source
  addresses redacted to scope categories

## Stop conditions

- Exact production target를 독립적으로 확인할 수 없음
- Command가 mutation, secret/content 출력 또는 broader inventory를 요구함
- SSH access가 불안정하거나 예상하지 않은 privilege prompt/error 발생
- Output에 secret, public key body, public address 또는 account identifier가
  노출됨

Stop 시 retry하거나 명령을 수정해 우회하지 않고 session을 종료한 뒤
metadata-only failure stage를 보고한다.

## Success criteria

- 모든 명령 exit와 expected label을 기록
- Mutation `0`
- Sensitive content retained `0`
- IPv4와 IPv6 firewall을 별도 확인
- 확인된 사실, drift와 미확인 항목을 구분
- 후속 Task 2 approval에 필요한 exact rollback pre-state 확보

## Approval

- Owner decision: Approved — the human owner will run the provided command set
  exactly once and return only redacted results.
- Approved date: 2026-07-31

## Execution result

- Result: STOPPED
- Attempt count: 1
- Observed failure: the SSH session disconnected while the owner ran Stage 1.
- Mutation observed: none reported; not independently verified
- Root cause: unconfirmed. The handoff applied `set -eu` directly to the login
  shell, so an otherwise read-only command returning non-zero could terminate
  that shell. Termius one-shot command/session behavior and transport failure
  are not yet excluded.
- Retry: prohibited until the last visible stage and Termius execution mode are
  recorded, the command is isolated in a subshell, and a new exact approval is
  granted.
- Follow-up: the owner confirmed immediate multi-line-paste disconnect before
  results were visible and confirmed that a fresh SSH login still succeeds.
  A child-shell-isolated retry is proposed in
  `plan-0015-task-1-readonly-inventory-retry-approval-request.md`.

## Corrected retry result

- Human-executed corrected attempt: PASS
- Host result: `WAW_STAGE1_RESULT=PASS mutation=0`
- Child exit: `0`
- Ubuntu: `24.04`; kernel `6.17.0-1019-aws`
- SSH: active; unit reported disabled
- Effective authentication: public key enabled; password and keyboard
  interactive disabled; root key login still permitted
- Effective forwarding: X11 and TCP enabled; aggregate forwarding not disabled
- Accounts: `ubuntu` present; `waw-operator` absent
- Existing `ubuntu` authorized-key fingerprint: owner verified and
  intentionally withheld
- fail2ban: absent
- Listening ports observed without bind-address retention: 22, 53, 80, 443,
  and 18080
- Lightsail console: the single visible rules for TCP 22, 80 and 443 each allow
  any IPv4 or IPv6 address; no duplicate port-22 rule was visible
- Remaining uncertainty: `ssh.service` disabled/active may reflect socket
  activation; listener bind scope was intentionally not retained
- Production mutation: `0`
