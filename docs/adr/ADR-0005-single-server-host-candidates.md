# ADR-0005: 단일 지속 server host 후보

- Status: Proposed
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OWN-005`, `OWN-016`~`OWN-021`, `OWN-034`, `OWN-036`~`OWN-038`, `OPS-001`~`OPS-008`
- Related research: `docs/research/technology-options/single-persistent-server-hosting-options.md`, `docs/research/spikes/one-gb-runtime-capacity/README.md`, `docs/adr/ADR-0001-single-persistent-server-boundary.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

첫 MVP는 `ADR-0001`에 따라 web과 bot을 하나의 지속 server 배포 경계에 둔다. `ADR-0004`에서 TypeScript·Node.js·discord.js를 선택했고, 서울 Lightsail 1GB fixture에서 Node·Python 합성 workload를 각각 60분 측정해 모든 verifier 기준을 통과했다. 이 증거는 1GB Linux fixture의 자원 여유를 보여주지만 provider의 운영 적합성, backup·복구, 실제 Gateway와 production ingress를 증명하지 않는다.

## Considered options

### Option A: 서울 Lightsail 1GB급 외부 임대 VM

월 약 USD 7의 public IPv4 fixture가 실제로 생성·접속·삭제됐고, SSH `/32` 제한·임시 HTTPS·Node/Python capacity 결과를 확보했다. 초기 비용과 자원 경계가 명확하지만 backup·복구·운영 보안은 별도 검증해야 한다.

### Option B: 보유 MacBook 자체 hosting

추가 임대료 없이 기존 장비를 사용할 수 있고 Node runtime을 실행할 수 있다. 그러나 절전·전원·재부팅 자동복구·교육장 회선 승인·원격 장애 대응이 운영 경계가 된다.

### Option C: 대체 Windows 노트북

보유 장비 fallback으로 비용을 줄일 수 있지만 전원·절전·자동 시작·원격 접근과 Windows service 운영을 실제로 검증하지 않았다.

## Decision

최종 host 선택은 보류한다. 첫 운영 후보는 서울 Lightsail 외부 임대 VM으로 유지하고, MacBook을 비용 절감 fallback, Windows를 복구 fallback으로 둔다. 다음 증거가 확보되기 전에는 어느 후보도 production host로 Accepted하지 않는다.

- 선택 host에서 Node·web+bot idle/peak memory와 event-loop pause
- 재부팅·crash·배포 중 singleton, health와 복구 시간
- 외부 backup과 빈 대체 host restore, RPO 24시간·RTO 8시간
- `waw.dubeom.com` canonical HTTPS ingress와 secret/process 권한
- VM·backup·domain·GPT를 합친 월 30,000원 상한

## Rationale

Lightsail은 이미 승인된 임시 비용 범위와 Linux capacity 증거가 있어 가장 빠른 다음 검증 경로다. Mac과 Windows는 신규 provider 결정을 피할 수 있지만 물리 전원·회선·원격 복구 증거가 부족하다. 이 ADR은 기존 D-09 shortlist를 유지하며 provider·region·OS의 최종 Accepted 결정을 다음 Spike 뒤로 남긴다.

## Approval

- Owner decision: Pending — 서울 Lightsail 우선 후보와 Mac·Windows fallback 범위 승인 필요
- Approved date: Pending
