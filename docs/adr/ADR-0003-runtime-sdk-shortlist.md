# ADR-0003: Discord bot runtime·SDK shortlist

- Status: Accepted
- Date: 2026-07-21
- Owners: 프로젝트 소유자
- Related requirements: `OWN-035`, `OPS-001`~`OPS-003`, `FUN-010`~`FUN-015`, `SEC-001`~`SEC-010`
- Related research: `docs/research/technology-options/language-runtime-discord-sdk-options.md`, `docs/research/spikes/one-gb-runtime-capacity/README.md`
- Supersedes: 없음
- Superseded by: 없음

## Context

첫 MVP는 단일 지속 server 경계에서 Discord Gateway를 유지하고 Voice State의 `self_stream`으로 Go Live를 관측해야 한다. TypeScript·Node.js·discord.js와 Python·CPython·discord.py는 모두 유지 후보이며, Java·JDA는 두 후보가 기준을 충족하지 못할 때 재평가한다.

서울 Lightsail 1GB 합성 workload에서 Node 22.23.1과 Python runner가 각각 60분 동안 13개 수용량 기준을 모두 통과했다. 이는 runtime/SDK가 없는 합성 capacity 증거이지 Discord Gateway 호환성·재연결·Go Live 정확성의 증거는 아니다.

## Decision drivers

- Gateway heartbeat·Resume·Identify와 Voice State `self_stream` 지원
- 합성 event를 통한 중복·재연결·unknown 상태 테스트
- web·bot 단일 server 경계에서의 process·secret 분리
- 지원 중인 runtime, lockfile과 공급망 검증 가능성
- Windows·macOS·Linux 배포 경로와 1GB급 host 자원

## Considered options

### Option A: TypeScript + Node.js LTS + discord.js

web·bot의 type/test toolchain을 공유할 가능성이 가장 크다. 다만 discord.js 14.27.0 artifact의 Node `>=18` metadata와 버전별 문서의 Node 24.17+ 요구가 다르므로 정확한 artifact·lockfile 빈 환경 검증이 필요하다.

### Option B: 지원 중인 CPython + discord.py

작은 async bot에 단순하고 `VoiceState.self_stream`, reconnect와 Resume event를 제공한다. discord.py 2.7.1의 Python `>=3.8` metadata는 EOL runtime까지 포함하므로 CPython 3.13 또는 3.14 등 지원 중인 버전에서 실제 install/import/start를 검증해야 한다.

### Option C: OpenJDK + JDA

강한 compile-time 경계와 Gateway/voice event 기능을 제공하지만 현재 규모에서 build/runtime dependency와 JVM 자원 증거가 부족하다.

## Decision

최종 runtime·SDK 선택은 보류하고 Option A와 B를 공동 최종 후보로 유지한다. Option C는 A/B가 기준을 충족하지 못할 때만 재평가한다.

최종 선택 전에 다음을 모두 수행한다.

1. 정확한 artifact version과 dependency lock을 고정한다.
2. 지원 중인 runtime의 빈 환경에서 install/import/start와 dependency provenance를 검증한다.
3. 실제 credential 없이 합성 Gateway event로 policy adapter, duplicate와 unknown 상태를 시험한다.
4. 별도 승인 후 실제 Gateway disconnect/Resume 및 Go Live reconciliation을 검증한다.

## Consequences

Node 22 또는 Python capacity 통과만으로 production runtime을 고정하지 않는다. 최종 선택 전까지 제품 dependency와 운영 credential은 추가하지 않으며, KBO는 범위 밖으로 유지한다.

## Validation

clean-install Spike, dependency audit/lock 검토, 합성 adapter test, 선택 host의 bot+web memory/event-loop 측정, 실제 Gateway 장애와 Go Live reconciliation을 결과·한계와 함께 문서화한다.

## Conditions for reconsideration

- Option A의 artifact·docs 호환성 또는 reconnect 증거가 실패함
- Option B의 지원 runtime·type/error 통제가 기준을 충족하지 못함
- JVM 자원·운영 단순성에서 Option C가 명확한 우위를 실측함

## Approval

- Owner decision: Approved — Node/discord.js와 Python/discord.py shortlist 유지 및 credential 없는 clean-install/Gateway Spike 범위 승인. 최종 runtime·SDK 선택은 별도 ADR로 남김.
- Approved date: 2026-07-21
