# 구현 계획: KBO 베팅 접수 정책 판정

- Status: Completed (source/local only)
- Related requirements: `FUN-025`, `OWN-041`, `OWN-044`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0026` schema contract
- Owner: Product owner

## 목표

후속 PostgreSQL transaction이 호출할 수 있도록 KBO 베팅 접수의 공급자 독립
정책을 순수 TypeScript 함수와 표 기반 단위 테스트로 고정한다. 이 작업은 실제
경기나 계정을 읽거나 쓰지 않고, 이미 정규화된 입력을 허용 또는 고정 거부
사유로 판정한다.

## 현재 구현 상태

- `PLAN-0026`은 bet 입력 형태와 중복·원장 참조 schema를 local/disposable에서
  완료했지만 transaction store와 canonical game FK는 없다.
- `ADR-0029`는 가입 활성, correction debt 0, 충분한 잔액, 1,000~50,000 단위,
  KST 일일 원금 50,000, 권리·신선도·경기 시작 잠금을 결정했다.
- `ADR-0032`은 allowlist된 외부 봇 공개 응답만 trust boundary에서 정규화하고
  stale·unknown·권리 미확인 입력을 실패 폐쇄하도록 결정했다.

## 범위

- 공급자 독립 베팅 접수 입력과 allowlisted 결과 type
- 기존 `KboGameOutcome` 재사용
- active enrollment, correction debt, available balance 검증
- 1,000 단위의 1,000~50,000 stake 검증
- KST 당일 순원금 합계 50,000 한도 검증
- 선택 점수의 양쪽 동시 입력과 non-negative 정수 검증
- 권리 gate, fresh game evidence, `scheduled` 상태와 예정 시작 시각 이전 검증
- 서버 시각에서 KST stake date 계산
- 표 기반 단위 테스트

## 범위 제외

- `kbo_game` projection, FK, migration과 PostgreSQL transaction store
- account/game lock, bet·ledger insert와 balance update
- 중복 operation·bet 조정과 audit persistence
- 공급자 adapter, 외부 Discord 봇 listener/parser와 source별 상태 mapping
- 신선도 임계값 결정, 경기 ingestion·revision·정산·무효·정정
- Discord command/component, dashboard와 runtime assembly
- Production migration·배포와 feature activation

## 선행 조건과 고정 경계

1. 함수는 DB나 외부 API를 호출하지 않고 이미 정규화된 값만 판정한다.
2. 금액은 `bigint`를 사용한다. 당일 순원금은 같은 KST 날짜의 접수 원금에서
   공식 무효로 반환된 원금만 뺀 non-negative 값으로 후속 store가 제공한다.
3. 권리 확인, 신선도와 경기 상태가 하나라도 불명확하면 허용하지 않는다.
   구체 공급자나 외부 Discord 응답 schema는 이 계획에서 선택하지 않는다.
4. `now < scheduledStartAt`일 때만 시작 시각 gate를 통과한다. Client 시각과
   client 날짜는 받지 않는다.
5. 같은 account/game 중복과 transaction 재검증은 DB lock·constraint가 필요한
   후속 계획에 남긴다. 이 순수 판정을 접수 완료나 잔액 차감으로 간주하지 않는다.
6. 기존 KST 날짜 계산과 `KboGameOutcome`을 재사용하고 새 dependency나 범용
   validation abstraction을 추가하지 않는다.

## 작업

### Task 1: 접수 정책 함수와 단위 테스트

- 목적: 공급자·DB 연결 전에 승인된 접수 규칙과 경계값을 작은 순수 함수로
  재현한다.
- 변경 예상 파일: `src/kbo/bet-placement.ts`,
  `src/kbo/bet-placement.test.ts`, `PROJECT_STATUS.md`, 이 계획
- 테스트:
  - 최소 1,000·최대 50,000과 1,000 단위만 허용
  - 점수 미입력 또는 유효한 양쪽 점수만 허용
  - 미가입·비활성, correction debt, 잔액 부족 거부
  - 당일 순원금 0·49,000에서 허용하고 50,000 초과 거부
  - 같은 날 공식 무효 반환분이 반영된 순원금은 다시 사용 가능
  - 권리 미확인, stale·unknown, 비예정 상태와 시작 시각 도달 거부
  - 시작 1ms 전 허용, 정확한 시작 시각과 이후 거부
  - UTC/KST 날짜 경계에서 server-derived stake date 반환
  - 잘못된 bigint·날짜·상태 입력은 원문을 반영하지 않는 고정 오류로 거부
- 완료 기준: 대상 단위 테스트, 전체 test, typecheck와 diff check가 통과하고
  DB·network·runtime 변경이 없다.
- 위험: 순수 판정 뒤 DB 상태가 바뀔 수 있으므로 후속 store는 account와 game을
  잠근 뒤 같은 조건을 transaction 안에서 다시 검증해야 한다.
- 롤백: 새 순수 함수와 테스트를 제거한다. schema와 저장 데이터에는 영향이 없다.

## 검증 계획

- `node --import tsx --test src/kbo/bet-placement.test.ts`
- `TMPDIR=/tmp npm test`
- `npm run typecheck`
- `git diff --check`

## 배포 및 마이그레이션

없다. Task 1 승인도 source/local 순수 정책과 테스트만 허용한다. 이 결과는
canonical game projection·FK와 PostgreSQL transaction 계획 없이 실제 베팅을
활성화하지 않는다.

## 문서 갱신

- 구현 시 이 계획의 상태와 검증 결과
- `PROJECT_STATUS.md`

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- 공급자·DB 호출 없이 가입, 권리·신선도, 경기 상태·시작 시각, correction
  debt, 잔액, stake와 KST 일일 한도를 순서대로 판정하는 순수 함수를 추가했다.
- 기존 `KboGameOutcome`과 KST 날짜 계산을 재사용하고 새 dependency나 범용
  abstraction은 추가하지 않았다.
- 대상 단위 테스트 `3/3`, 전체 test
  `324 pass / 7 기존 환경 skip / 0 fail`, typecheck가 통과했다.
- Schema, provider, Discord/runtime과 Production 변경은 수행하지 않았다.
