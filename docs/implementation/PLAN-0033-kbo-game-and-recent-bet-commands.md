# 구현 계획: KBO 접수 경기와 최근 베팅 조회

- Status: Completed
- Related requirements: `FUN-021`, `FUN-024`, `DAT-001`~`DAT-005`
- Related ADRs: `ADR-0029`, `ADR-0032`
- Depends on: `PLAN-0030`, `PLAN-0032`
- Owner: Product owner

## 목표

최신 canonical projection의 접수 가능 경기 ID와 가입 사용자의 최근 5개 베팅을
내부 식별자 노출 없이 Discord에서 조회한다.

## 범위

- 5분 이내 scheduled 경기 최대 5개와 source/수집 시각
- 최근 5개 bet의 경기·예측·금액·상태·실제 점수·canonical 반환액·정정 표시
- `/베팅 경기`, `/베팅 내역` 정의·정규화·ephemeral 응답과 local runtime
- 고정 오류와 기존 command audit

## 범위 제외

- 외부 parser·ingestion, 팀 표시명과 KBO 순위
- 공개 랭킹과 관리자 dashboard
- Discord REST 등록·Production 배포·기능 활성화

## 선행 조건

1. 경기 조회는 기능·권리 flag가 모두 exact `1`일 때만 허용한다.
2. 최근 내역은 incident 중 베팅 접수가 닫혀도 계속 조회할 수 있다.
3. DTO에는 raw Discord ID, account/operation/ledger/settlement ID를 포함하지 않는다.
4. 새 schema나 dependency를 추가하지 않는다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- `/베팅 경기`는 시작 전 scheduled 상태와 source/수집 시각이 모두 5분 이내인
  canonical 경기 최대 5개만 경기 ID와 함께 표시합니다.
- `/베팅 내역`은 기능 비활성화와 무관하게 active 가입자의 최근 5개를 안정적으로
  정렬하고 현재 정산·무효·정정 결과만 표시합니다.
- 대상 test `28/28`, 전체 test `340 pass / 7 기존 환경 skip / 0 fail`,
  typecheck, production build와 diff check가 통과했습니다.
- 외부 parser·ingestion, Discord REST 등록과 Production 변경은 수행하지 않았습니다.
