# 프로젝트 상태

마지막 갱신일: 2026-07-20

## 현재 단계

D-03·D-05·D-07·D-08 통합 검토와 경계·저장소 Spike 2개 완료, outbound-pull 경계 Spike 제안 준비

## 완료

- 제품 정책 초안 작성
- 배포 및 보안 요구사항 초안 작성
- Codex 작업 흐름 정의
- 연구, ADR, 구현, 검토용 프롬프트 작성
- 대시보드 운영 도메인을 `waw.dubeom.com`으로 확정
- 로컬 `codex-settings`의 공통 에이전트 규칙을 프로젝트 전용 절차와 충돌 없이 병합
- `codex-settings` 플러그인 설치 스크립트의 명령과 영향 범위 검토
- 초기 기술 제약사항과 안정적인 요구사항 ID 추출
- 요구사항 추적표, 기술 결정 지도와 증거 기반 조사 순서 작성
- `OWN-001`~`OWN-009` 제품·운영 조사 입력 확정
- Discord Gateway·메시지 조회·Go Live·OAuth 공식 가능성과 제약 조사
- Riot 계정 연결과 솔로 랭크 시작·종료 감지 가능성 조사
- KBO 데이터 공급·재표시 권리·갱신 SLA 가능성 조사
- 대화 요약 API의 컨텍스트·지연·비용·보존 제약 조사
- 네 외부 플랫폼 조사의 중복, 요구사항 공백, 가정 경계와 사용자 결정 항목 통합 검토
- `ODR-001`~`ODR-005`, `ODR-007` 소유자 결정 확정 및 `OWN-010`~`OWN-015`로 추적
- KBO 기능을 허가된 공급 경로 확보 전까지 연기
- `OWN-001`~`OWN-015`를 반영한 D-03 데이터 흐름·위협 모델 작성
- 정책의 네 배포 형태와 API·queue·공유 저장소·이벤트 방식의 웹-봇 통신 경계 조사
- MacBook 우선 시나리오를 `waw.dubeom.com`, 월 3만 원, RPO 24시간과 RTO 8시간에 연결
- `D08-Q01`~`D08-Q06`을 확정하고 `OWN-016`~`OWN-021`로 추적
- 외부 임대 단일 서버와 OS 비종속 자가 단일 서버의 경계, Vercel Hobby 비용 기준과 Windows 대체 host 후보 확정
- RPO/RTO 판정 범위, 일반 변경의 제한된 비동기 처리와 heartbeat 기반 상태 요구 확정
- SQLite, 자가 PostgreSQL과 관리형 PostgreSQL의 무결성·접근 경계·백업·복구·비용·이식성 비교
- 관리형 PostgreSQL을 첫 검증 후보, 자가 SQLite를 가장 강한 대안으로 정리하되 저장소 선택은 보류
- `D05-Q01`~`D05-Q04`를 확정하고 `OWN-022`~`OWN-025`로 추적
- 장애 중 dashboard 허용 범위, 월 명령 10,000회, PITR 비필수와 조건부 관리형 무료 tier 허용 확정
- Discord OAuth identity, 현재 guild/role 검증, server-side session과 workload 인증 경계 후보 비교
- Discord `identify` + bot-side member 조회 + opaque session을 첫 검증 조합으로 정리하되 인증 기술 선택은 보류
- `D07-Q01`~`D07-Q06`을 확정하고 `OWN-026`~`OWN-031`로 추적
- Discord OAuth 전용 로그인, 1일 유휴·7일 절대 세션, 5분 read-only 역할 cache와 user token 비보존 확정
- 임의 preview 인증 비활성화와 고위험 작업의 15분 recent-auth·현재 역할·명시적 확인 확정
- D-05·D-07·D-08을 통합해 저장소·session·bot-side 역할 조회·내부 통신의 결합 제약과 후보 조합별 남는 경계 검토
- `GAP-INT-01`~`GAP-INT-07`, `INT-Q01`~`INT-Q02`와 실행하지 않은 최소 Spike 후보 4개 정리
- `INT-Q01`~`INT-Q02`를 확정하고 `OWN-032`~`OWN-033`으로 추적
- host 장애 중 5분 read-only cache와 고위험 작업의 Discord OAuth 재완료 기준 확정
- 경계 왕복·기본 거부 Spike에서 로컬 서명·replay·key rotation·5분 cache와 기본 거부 계약 검증
- 별도 Vercel preview→자가 host 임시 outbound tunnel 왕복이 function timeout으로 5초 기준을 충족하지 못해 Spike 실패 판정
- 임시 Vercel project·deployment, tunnel, server, credential과 project metadata 정리 완료
- 첫 Spike 실패는 Vercel→익명 임시 `ssh -R` tunnel→자가 host 조합만 탈락시키며 직접 API·분리 배포 전체를 탈락시키지 않는 것으로 범위 확정
- 동일 익명 tunnel 반복 검증은 보류하고, D-05 결과에서 공유 저장소가 남을 때만 outbound-pull 경계 Spike를 검토
- 월 10,000회 × 1년 합성 감사·dedupe·session 데이터의 SQLite·PostgreSQL database와 export가 모두 40MB 미만임을 측정
- 두 local engine에서 동일 `operation_id` 32회 동시 제출, transaction 중단·재시도와 foreign key 검증 통과

## 진행 중

- 예상 사용량과 고정비가 미확정인 항목의 복수 시나리오 유지
- 공유 저장소 outbound-pull 역할 조회 Spike의 실행 전 제안 대기
- 저장소·배포·통신·인증 기술 선택은 필요한 별도 승인 Spike 증거 전까지 보류

## 다음 작업

`docs/prompts/spike.md` 절차에 따라 공유 저장소 outbound-pull 역할 조회
Spike의 단일 가설, 최소 합성 데이터, 성공·실패 기준과 정리 방법을 먼저
제안합니다. 승인 전에는 Spike 문서 작성이나 실행을 하지 않습니다.

## 차단 요소

- `codex-settings/scripts/install.sh`는 Codex 사용자 환경에 Ponytail과 Superpowers 플러그인을 설치하므로 프로젝트 외부 변경 승인 전에는 실행하지 않음
- KBO 기능은 자동 접근·Discord 재표시 권리와 공급자 갱신 정보를 서면으로 확인할 때까지 연기하며, 30분 측정 기준도 함께 보류
- Riot Production/RSO 승인 가능성과 시작·종료 5분 감지는 미확정
- 예상 사용자 수, 메시지량, 월 요약 요청 수와 동시 게임 수가 미확정이므로 외부 API 비용·처리량은 복수 사용량 시나리오로 유지
- Vercel Hobby, GPT API, 도메인, 외부 백업을 합친 원화 비용이 월 3만 원을 충족하는지 미확정
- 자가 host와 대체 Windows 노트북의 사양·환경 재현·절전·재부팅·회선 장애 조건에서 RPO 24시간·RTO 8시간을 달성할 수 있는지 미검증
- 월 명령 10,000회의 실제 저장·backup 크기와 무료 관리형 DB 한도 충족 여부가 미확정
- Discord OAuth의 PKCE 지원 범위와 D-05·D-08 경계에 맞는 workload 인증·credential rotation 방식이 미확정
- 익명 임시 outbound tunnel의 Vercel→자가 host 호출이 function timeout으로 실패했으며 원인이 Vercel egress, tunnel 공급자 경로, 지역 또는 연결 정책 중 어디인지는 분리하지 못함

## 현재 확정되지 않은 사항

- 언어와 런타임
- Discord SDK
- 대시보드 프레임워크
- 데이터 저장소
- 봇 실행 환경
- 대시보드 배포 환경
- Riot 및 KBO 데이터 공급 방식
- 요약 모델 공급자
- 백업과 모니터링 도구
- 웹-봇 내부 통신 방식과 상호 인증 기술
- KBO 기능 재개 시 30분 지연 측정 시작점
- Riot 5분 감지 실패 시 완화할 목표 또는 수동 경로의 장기 정책
