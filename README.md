# Discord 통합 봇 프로젝트

개인 Discord 서버에서 사용하는 통합 Discord 봇과 관리 대시보드를 개발하기 위한 프로젝트입니다.

관리 대시보드의 운영 도메인은 **`https://waw.dubeom.com`** 입니다.

이 저장소는 코드를 먼저 작성하지 않습니다. 제품 정책을 정의하고, 기술을 조사하고, 필요한 실험을 수행하고, ADR로 결정을 기록한 뒤 구현 계획과 테스트를 기반으로 개발합니다.

## 프로젝트 목표

다음 기능을 하나의 운영 가능한 시스템으로 제공합니다.

- Discord 대화 요약
- Riot 계정 및 Discord Go Live 상태를 이용한 몰랭 검거
- 명령 실행 기록과 운영 상태를 확인하는 관리자 대시보드
- 백업, 복구, 보안, 마이그레이션이 가능한 데이터 운영

KBO 기능은 현재 제품 명세와 구현 범위에서 제외하며, 별도 제품 결정이 있을
때 후속 기능으로 다시 검토합니다.

구현 기술은 이 문서에서 미리 확정하지 않습니다. 기술 선택은 요구사항, 공식 자료, 실험 결과와 ADR을 근거로 결정합니다.

## 문서 구조

```text
.
├── AGENTS.md
├── README.md
├── PROJECT_STATUS.md
├── CHANGELOG.md
└── docs/
    ├── PROJECT_GUIDE.md
    ├── product/
    │   └── policy.md
    ├── operations/
    │   └── deployment-and-security.md
    ├── ai/
    │   └── codex-workflow.md
    ├── research/
    │   ├── README.md
    │   ├── technology-options/
    │   ├── spikes/
    │   └── benchmarks/
    ├── adr/
    │   ├── README.md
    │   └── TEMPLATE.md
    ├── implementation/
    │   ├── README.md
    │   └── TEMPLATE.md
    ├── standards/
    │   ├── README.md
    │   ├── coding.md
    │   ├── testing.md
    │   ├── logging.md
    │   ├── data.md
    │   └── security.md
    └── prompts/
        ├── README.md
        ├── start-project.md
        ├── research.md
        ├── spike.md
        ├── adr.md
        ├── implementation-plan.md
        ├── implement-task.md
        ├── bugfix.md
        ├── review.md
        └── release.md
```

## 문서의 역할

- `AGENTS.md`: Codex가 작업 전에 따라야 할 최상위 규칙
- `PROJECT_STATUS.md`: 현재 단계, 완료 항목, 다음 작업과 차단 요소
- `CHANGELOG.md`: 사용자에게 의미 있는 변경 이력
- `docs/product`: 무엇을 만들지 정의하는 제품 정책
- `docs/operations`: 배포, 보안, 비밀정보, 백업과 복구 요구사항
- `docs/ai`: AI 개발 절차와 작업 완료 기준
- `docs/research`: 기술 조사, 비교, 벤치마크와 Spike 결과
- `docs/adr`: 기술 선택과 변경 이유
- `docs/implementation`: 승인된 구현 계획과 진행 상태
- `docs/standards`: 코딩, 테스트, 로그, 데이터와 보안 기준
- `docs/prompts`: Codex에 반복해서 사용할 작업 절차

## AI 개발 흐름

```text
정책 확인
  ↓
기술 조사
  ↓
필요한 경우 Spike
  ↓
Proposed ADR
  ↓
사용자 승인
  ↓
Accepted ADR
  ↓
구현 계획
  ↓
작업 하나씩 테스트 기반 구현
  ↓
검토 및 문서 갱신
  ↓
배포 전 점검
```

조사, 결정, 구현을 한 번에 요청하지 않습니다. 각 단계의 결과를 검토할 수 있도록 작업을 분리합니다.

## 처음 시작하는 방법

Codex를 저장소 루트에서 실행한 뒤 아래처럼 요청합니다.

```text
AGENTS.md를 읽고 docs/prompts/start-project.md 절차에 따라
프로젝트 초기 조사를 시작해.
아직 기술을 확정하거나 제품 코드를 구현하지 마.
```

첫 작업에서는 코드가 아니라 다음과 같은 조사 문서가 만들어져야 합니다.

- 기술적 제약사항
- 요구사항 추적표
- 조사해야 할 기술 결정 목록
- 미해결 정책 질문
- 권장 조사 순서

## 작업별 요청 예시

### 기술 조사

```text
AGENTS.md를 읽고 docs/prompts/research.md 절차에 따라
Discord 봇, 관리 대시보드, 영구 데이터의 배포 구조를 조사해.
```

### 작은 실험

```text
AGENTS.md를 읽고 docs/prompts/spike.md 절차에 따라
Vercel의 waw.dubeom.com 대시보드가 별도 봇 서버의 관리 API에
안전하게 접근할 수 있는지 검증해.
```

### ADR 작성

```text
AGENTS.md를 읽고 docs/prompts/adr.md 절차에 따라
관리 대시보드와 Discord 봇의 배포 구조 ADR을 Proposed 상태로 작성해.
```

### 구현 계획

```text
AGENTS.md를 읽고 docs/prompts/implementation-plan.md 절차에 따라
승인된 ADR을 기반으로 최초 MVP 구현 계획을 작성해.
아직 구현하지 마.
```

### 구현

```text
AGENTS.md를 읽고 docs/prompts/implement-task.md 절차에 따라
승인된 구현 계획에서 다음 미완료 작업 하나만 구현해.
```

### 버그 수정

```text
AGENTS.md를 읽고 docs/prompts/bugfix.md 절차에 따라
[증상과 재현 방법]을 조사하고 수정해.
```

### 배포 전 검토

```text
AGENTS.md를 읽고 docs/prompts/release.md 절차에 따라
현재 변경사항의 배포 준비 상태를 검토해.
```

## `codex-settings` 저장소에 추가하는 방법

이 패키지는 기존 설정 저장소의 루트에 추가하는 오버레이입니다.

```bash
git clone https://github.com/Koh-Du-Beom/codex-settings.git
cd codex-settings

# 다운로드한 ZIP을 원하는 위치에서 압축 해제한 뒤
rsync -av --ignore-existing /path/to/codex-settings-discord-bot-overlay/ ./
```

기존 파일을 덮어써야 하는 경우에는 먼저 변경사항을 확인합니다.

```bash
rsync -avn /path/to/codex-settings-discord-bot-overlay/ ./
```

특히 기존 `README.md`와 `AGENTS.md`가 있다면 그대로 덮어쓰지 말고 내용을 병합해야 합니다. 이 패키지의 `README.md`는 프로젝트 안내로, `AGENTS.md`는 프로젝트 작업 규칙으로 활용합니다.

권장 방식은 다음과 같습니다.

1. 기존 저장소를 별도 브랜치에서 수정
2. 기존 `AGENTS.md`의 전역 Codex 설정을 유지
3. 이 패키지의 프로젝트 규칙을 기존 `AGENTS.md` 아래에 병합
4. 기존 README가 설정 저장소 설명이라면 이 프로젝트 안내를 `docs/discord-bot/README.md`로 이동
5. 저장소가 실제 봇 프로젝트 자체라면 루트 README로 사용
6. `git diff`로 확인 후 커밋

```bash
git switch -c feat/discord-bot-planning
git status
git diff
git add .
git commit -m "docs: add Discord bot planning workflow"
```

## 중요한 원칙

- 기술을 익숙하다는 이유만으로 선택하지 않습니다.
- 공식 문서와 1차 자료를 우선합니다.
- 조사 결과와 추론을 구분합니다.
- 되돌리기 어려운 결정은 ADR 승인 전 구현하지 않습니다.
- 사용자 메시지 원문, OAuth 코드, 토큰과 비밀정보를 로그에 저장하지 않습니다.
- 테스트하지 않은 변경을 완료로 처리하지 않습니다.
- 작업이 끝나면 관련 문서와 `PROJECT_STATUS.md`를 갱신합니다.
