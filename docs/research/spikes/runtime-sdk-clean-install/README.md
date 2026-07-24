# Runtime·SDK clean-install Spike

- 상태: Completed — credential 없는 임시 환경 검증
- 일자: 2026-07-21
- 범위: D-04 `ADR-0003`의 Node/Python shortlist 후속 검증

## 실행

저장소와 분리된 임시 directory에서 다음 artifact를 실제 설치했다.

- Node.js 24.18.0 환경에서 `discord.js@14.27.0`
- 현재 Python 환경의 virtualenv에서 `discord.py==2.7.1`

각 환경에서 package version, declared runtime engine, import와 `Client` symbol 로드를 확인했다. 두 환경 모두 통과했으며 lockfile·virtualenv와 install log는 검증 직후 폐기했다.

```text
node_artifact=14.27.0
node_engine=>=18
node_import=passed; client=function
python_artifact=2.7.1
python_import=passed; client=type
clean_install_import=passed
```

## 한계

- 실제 Discord credential, Gateway 연결, disconnect/Resume과 Go Live reconciliation은 실행하지 않았다.
- `discord.js` artifact metadata와 versioned documentation의 Node 요구 차이는 여전히 채택 시점의 lockfile·runtime 조합으로 판단해야 한다.
- Python package의 `>=3.8` 하한은 CPython upstream 지원을 의미하지 않으므로 production 후보는 지원 중인 CPython에서 고정해야 한다.
- 이 Spike는 설치·import 가능성만 좁히며 Node/Python 최종 선택을 하지 않는다.

첫 검증에서는 `--package-lock-only`만 실행한 뒤 import를 시도해 모듈 부재 오류가 났다. 이를 호환성 실패로 판정하지 않고 실제 `npm install --ignore-scripts`를 수행해 재검증했다. 이후 package export 경계를 우회해 package metadata를 읽고 import를 확인했다.
