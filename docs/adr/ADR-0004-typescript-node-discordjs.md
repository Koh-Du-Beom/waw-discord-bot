# ADR-0004: TypeScript·Node.js·discord.js runtime 선택

- Status: Accepted
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OWN-035`, `OWN-039`, `OPS-001`~`OPS-003`, `FUN-010`~`FUN-015`, `FUN-021`~`FUN-031`, `SEC-001`~`SEC-010`
- Related research: `docs/research/technology-options/language-runtime-discord-sdk-options.md`, `docs/research/spikes/one-gb-runtime-capacity/README.md`, `docs/research/spikes/runtime-sdk-clean-install/README.md`
- Supersedes: 없음
- Superseded by: 없음

## Decision

첫 MVP의 runtime·SDK는 **TypeScript + 채택 시점의 지원 중인 Node.js LTS + discord.js**로 선택한다. Node major와 정확한 discord.js artifact는 구현 시작 시 lockfile과 함께 고정한다.

## Rationale

단일 지속 server의 web·bot 경계에서 TypeScript의 type contract와 Node test toolchain을 공유하기 쉽고, discord.js가 Gateway·Voice State API를 제공한다. Node 22.23.1 capacity fixture와 discord.js 14.27.0 clean-install/import Spike가 통과했으며, 사용자가 TypeScript/JavaScript에 익숙해 구현·검토 비용도 낮다.

## Constraints

- `discord.js` artifact와 versioned docs의 Node 요구 차이를 lockfile·clean-install 검증으로 재확인한다.
- 실제 Gateway disconnect/Resume, Go Live reconciliation과 singleton은 후속 credential Spike에서 검증한다.
- bot token은 web process/module에 노출하지 않고, Discord 원문·credential·session identifier를 로그에 남기지 않는다.
- KBO는 2026-07-31 제품 범위에 다시 포함됐지만, 허가된 공급 경로와 별도
  Accepted ADR·구현 계획을 확인하기 전까지 runtime dependency와 운영
  활성화에서 제외한다.

## Approval

- Owner decision: Approved — TypeScript + Node.js LTS + discord.js
- Approved date: 2026-07-21
