# 기존 codex-settings 저장소에 병합하기

## 먼저 저장소를 클론합니다

```bash
git clone https://github.com/Koh-Du-Beom/codex-settings.git
cd codex-settings
git switch -c feat/discord-bot-project-docs
```

## 기존 구조를 확인합니다

```bash
find . -maxdepth 3 -type f | sort
```

특히 다음 파일의 존재 여부를 확인합니다.

- `README.md`
- `AGENTS.md`
- `.gitignore`
- `docs/`

## 오버레이를 미리 비교합니다

```bash
rsync -avn /path/to/codex-settings-discord-bot-overlay/ ./
```

## 충돌이 없는 파일부터 추가합니다

```bash
rsync -av \
  --exclude README.md \
  --exclude AGENTS.md \
  --exclude .gitignore \
  /path/to/codex-settings-discord-bot-overlay/ ./
```

## 기존 루트 문서 처리

### codex-settings가 이 봇 프로젝트 자체가 되는 경우

- 기존 README의 유용한 설치/설정 안내를 새 README에 병합합니다.
- 기존 AGENTS의 전역 Codex 규칙을 유지하고 새 AGENTS의 프로젝트 규칙을 추가합니다.
- `.gitignore`는 합집합으로 병합합니다.

### codex-settings가 여러 프로젝트용 설정 저장소인 경우

루트 문서를 덮어쓰지 않고 이 스타터 전체를 하위 폴더로 넣는 편이 안전합니다.

```text
codex-settings/
├── 기존 설정 파일
└── projects/
    └── discord-integrated-bot/
        ├── AGENTS.md
        ├── README.md
        ├── PROJECT_STATUS.md
        └── docs/
```

이 경우:

```bash
mkdir -p projects/discord-integrated-bot
rsync -av /path/to/codex-settings-discord-bot-overlay/ \
  projects/discord-integrated-bot/
```

Codex는 해당 프로젝트 폴더에서 실행합니다.

```bash
cd projects/discord-integrated-bot
codex
```

## 변경사항을 검토합니다

```bash
git status
git diff --stat
git diff
```

## 첫 커밋

```bash
git add .
git commit -m "docs: add Discord bot project workflow"
```

## 첫 Codex 요청

```text
AGENTS.md를 읽고 docs/prompts/start-project.md 절차에 따라
프로젝트 초기 조사를 시작해.
아직 기술을 확정하거나 제품 코드를 구현하지 마.
```

## 추천 구조 판단

`codex-settings`가 Codex 공통 설정을 관리하는 저장소라면 하위 `projects/discord-integrated-bot/` 방식이 더 안전합니다.

이유:

- 공통 설정과 특정 제품 정책을 분리할 수 있음
- 루트 README와 AGENTS 충돌을 피함
- 다른 프로젝트 스타터도 같은 저장소에서 관리 가능
- 프로젝트 폴더에서 Codex를 실행하면 전용 문맥이 명확해짐

반대로 이 저장소를 앞으로 Discord 봇 제품 저장소로 전환할 예정이라면 루트 병합 방식을 사용합니다.
