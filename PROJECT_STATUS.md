# 프로젝트 상태

마지막 갱신일: 2026-07-21

## 현재 단계

PLAN-0001 Task 1~5 local foundation 완료; PLAN-0002 Task 1 archive manifest verifier 완료, Task 2 AWS disposable Spike credential gate 대기

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
- 초기 분리 배포 가정에서는 관리형 PostgreSQL을 첫 검증 후보로 두었고, `OWN-034` 이후 단일 server 경계에서는 자가 SQLite를 첫 검증 후보로 재정렬하되 저장소 선택은 보류
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
- 공유 저장소 outbound-pull Spike에서 local DB query와 worker request/result 처리는 확인했지만 Vercel 함수가 pooled·unpooled 모두 timeout되어 실패 판정
- 임시 Vercel project·deployment, Neon resource·integration, DB role·credential과 local metadata 정리 완료
- named ngrok endpoint는 local 이중 인증 요청을 463ms에 처리했지만 Vercel preview가 function timeout되어 세 번째 경계 Spike도 실패 판정
- ngrok·Vercel 시험 endpoint, project·deployment, agent·server와 모든 local credential·metadata 정리 완료
- `INT-Q03`을 확정하고 `OWN-034`로 추적
- 첫 MVP의 web·bot을 단일 지속 server 경계에 두고 public web→bot network 경계를 제거하기로 확정
- Vercel Hobby 필수 배포 의도는 철회하되 개인·비상업·저비용 조건은 유지하고 임대 server와 소유 Mac·Windows 선택은 D-09로 이관
- TypeScript·Node.js·discord.js, Python·CPython·discord.py, Java·OpenJDK·JDA를 D-04 현실 후보로 공식 문서와 공식 저장소 기준 비교
- 세 후보의 Gateway 재연결·Go Live Voice State 지원, 단일 bot 실행의 host 책임, 시험성, Windows·macOS·Linux 호환성과 공급망 통제를 대조
- TypeScript·Node.js·discord.js를 잠정 첫 검증 후보, Python·discord.py를 가장 강한 대안으로 두되 언어·런타임·SDK 선택은 보류
- `D04-Q01`을 확정하고 `OWN-035`로 추적
- TypeScript와 Python을 모두 유지보수 가능한 공동 최종 후보로 유지하고 Java·JDA는 두 후보가 기준을 충족하지 못할 때 재평가하기로 확정
- 저가 외부 임대 Linux VM, 보유 Mac과 대체 Windows 노트북을 D-09 단일 지속 server 후보로 비교
- 임대 VM을 문서상 초기 검증 후보, 보유 Mac을 가장 강한 대안, Windows를 복구·조건부 primary 후보로 비교했으며 host·OS 선택은 보류
- 자가 장비·전원·가정망 ingress, 실제 runtime 자원, 단일 실행과 빈 환경 복구를 `GAP-D09-01`~`GAP-D09-06`으로 추적
- `D09-Q01`~`D09-Q02`를 확정하고 `OWN-036`~`OWN-037`로 추적
- 신규 host 비용 0원을 우선해 보유 장비 자가 hosting을 먼저 검증하고 필수 기준 실패 시 저가 임대 VM으로 돌아가기로 확정
- 장비 한 대의 전용 운용과 필요한 전원·자동 시작·공유기·DNS·tunnel 설정을 허용하되 구체 host·ingress 기술 선택은 보류
- Mac 읽기 전용 확인에서 M5·16GB·충분한 disk와 정상 battery·FileVault·Discord outbound를 확인
- Mac의 AC sleep 활성, firewall 비활성, 보안 update 지연과 정전 후 자동 부팅 미지원 및 교육장 회선 미승인을 확인하되 실제 공인 IP는 비기록
- `OWN-038`로 `OWN-036`의 우선순위를 대체하고 저가 외부 임대 VM을 첫 검증 범주, Mac과 LG Gram 16을 fallback으로 확정
- 서울 Lightsail 1GB, 도쿄 Akamai Shared CPU 1GB와 싱가포르 DigitalOcean Basic 1GiB를 D-09 현실 shortlist로 공식 가격·region·network·backup 자료에 따라 비교
- VM 기준 월 USD 5~7, Akamai·DigitalOcean의 고정 native backup 포함 월 USD 7~7.80과 Lightsail의 사용량 기반 snapshot 비용을 확인하고 provider backup과 독립 backup의 경계를 구분
- 서울 Lightsail을 잠정 첫 검증 후보, 도쿄 Akamai를 가장 강한 외부 대안으로 두되 공급자·region·OS·plan 선택은 보류
- 세 공급자 동시 비교를 생략하고 서울 1GB fixture에서 TypeScript·Python을 순차 비교하는 최소 runtime 수용량 Spike 제안 작성; VM 생성·실행은 미승인
- 서울 Lightsail 1GB Spike의 읽기 전용 사전 확인, 비운영 SSH key, 생성·firewall·측정·HTTPS 확인·삭제와 잔존 과금 resource 검사 runbook 작성; 실행은 미승인
- D-09 TypeScript·Python 폐기 가능 harness의 문법과 3초 local 합성 self-check 통과; VM system metric과 60분 안정성은 미검증
- Linux `/proc` 기반 CPU p95·available memory 연속 저하·swap-out·process exit·실행 시간 측정기와 failure-path verifier local 검증 완료
- AWS 공식 IAM 자료 기준 서울 region·필요 action·Spike tag로 제한한 임시 최소 권한 정책과 IAM으로 제한되지 않는 key pair·bundle·blueprint·CIDR 경계 문서화
- 첫 `aws login` 검증에서 `waw-spike` profile이 IAM 사용자가 아닌 root console session으로 연결된 것을 감지해 resource 생성 없이 즉시 logout·cache 무효화
- 재인증 뒤 최소 권한 `waw-spike-operator` identity 확인; 서울 Ubuntu 24.04 LTS와 public IPv4 `micro_3_0` 2 vCPU·1GB·40GB·월 USD 7 fixture 사전 확인 통과
- 첫 두 생성 시도는 Lightsail `publicKeyBase64`에 bytes와 이중 base64 text를 각각 전달해 key import 단계에서 실패; OpenSSH public key 원문 `file://` import→delete probe 통과 및 VM·key·local private key 잔존 없음 확인
- 후속 생성 시도에서 Lightsail의 교차 resource type 이름 namespace 때문에 동일 timestamp의 key·instance 이름이 충돌함을 확인; 활성 VM·key 잔존 없음 확인 후 UTC timestamp와 `-key`·`-vm` suffix로 분리
- 첫 VM 생성은 성공했으나 API state `running`을 `Running`과 비교한 wait 결함으로 90초 뒤 자동 삭제; instance·key 잔존 없음 확인 후 lowercase 비교로 수정
- 실행 VM 생성·관리 단말 `/32` SSH 제한 성공; `gateway.discord.gg` root의 정상 404를 실패로 본 outbound probe를 credential 없는 `discord.com/api/v10/gateway` 200 경로로 수정
- VM 10초 smoke에서 TypeScript·Python의 application·Linux system 기준 전체 통과; Python Linux RSS를 누적 peak가 아닌 실제 `VmRSS` p95로 보정하고 임시 self-signed HTTPS health fixture local 검증 완료
- Ubuntu 기본 Node 18의 D-04 후보 부적합을 발견해 진행 중 장기 측정을 참고 폐기; 공식 SHA-256으로 검증한 Node 22.23.1과 보정 Python fixture의 VM 10초 smoke 전체 통과
- Supabase Free 검증용 별도 disposable project `waw-storage-spike-20260721` 생성·삭제 완료; 기존 production project는 사용하지 않음. Orca 내장 브라우저에서 RLS 활성화 합성 SQL 10,000행 검증(10,000 unique operation, 1,864 kB) 완료. DB password는 채팅·문서에 기록하지 않음. 삭제 성공 toast 확인
- `ADR-0006`으로 Supabase Free PostgreSQL를 첫 MVP canonical storage로 Accepted; Lightsail은 application runtime만 실행하고 24시간 표준 export·빈 host restore 검증을 후속 구현 계획의 필수 조건으로 확정
- `ADR-0007` Discord OAuth `identify`·bot-side current member 조회·opaque server-side session 인증 경계를 Accepted; token 미보존, 1일 idle/7일 absolute session, 5분 read-only role cache와 고위험 recent-auth 계약 확정
- TypeScript Node 24 workspace와 local command contract를 추가해 valid/expired/malformed/duplicate operation의 합성 단위 시험 4개를 통과; 외부 credential·network·Supabase 연결 없이 Task 1 완료
- versioned Supabase PostgreSQL migration 초안과 session hash·revocation·idle/absolute expiry persistence contract를 추가해 합성 단위 시험 4개를 통과; remote database에는 연결·변경하지 않아 Task 2 완료
- OAuth state hash·single-use/expiry, 5분 read-only role cache, mutation default-deny, high-risk recent-auth·CSRF·explicit confirmation contract를 추가해 합성 단위 시험 6개를 통과; Discord OAuth credential·network 호출 없이 Task 3 완료
- web·bot·migration/backup의 capability 표와 TypeScript capability injection contract를 추가해 web의 bot token/role reader 접근과 bot의 browser command 접근을 합성 시험 3개로 차단; Task 4 완료
- health/singleton contract를 추가해 Gateway disconnected 시 `degraded`, storage failure 시 `unavailable`, duplicate bot lease claim 거부를 합성 시험 4개로 검증; 실제 Gateway/host 없이 Task 5 완료
- Orca 앱 설치·CLI 연결과 active worktree comment 갱신 완료
- 최신 fixture의 중복 실행을 process inventory로 폐기하고 30초 Node·Python smoke 및 4개 verifier unit test 통과
- 서울 Lightsail 임시 VM에서 Node 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- 서울 Lightsail 임시 VM에서 Python 60분 수용량 측정 완료; 13개 verifier 기준 모두 통과
- D-09 host 결정 Accepted: 서울 Lightsail을 primary로 사용하고 Windows를 복구·비용 절감 fallback으로 유지하며 MacBook은 운영 후보에서 제외
- 임시 HTTPS `/health` 다섯 회 HTTP 200 확인 후 포트·server·certificate 제거; VM·SSH key·static IP·disk·snapshot 잔존 없음 확인
- AWS session logout과 local 임시 state 정리 완료; capacity Spike 결과는 합성 workload 한계와 함께 문서화
- D-04 공식 runtime·SDK 지원 현황 갱신, D-08 단일 지속 server ADR Proposed 작성 후 owner 승인으로 Accepted 전환
- D-08 Accepted ADR을 기준으로 bounded 구현 계획 Draft 작성
- D-12 backup/restore 후보를 공식 Supabase·R2·S3 자료로 비교하고, Supabase Free의 24시간 logical export·off-site encryption·empty Windows restore 요구를 Proposed `ADR-0008`로 정리
- `ADR-0008` Accepted: 기존 AWS S3에 30일 rolling client-side encrypted PostgreSQL archive를 보관하고 backup 전용 IAM·budget monitoring·empty Windows restore 검증을 필수로 확정
- D-13 backup encryption 도구를 `age`, OpenSSL passphrase, S3 SSE-KMS-only로 비교하고 public recipient/offline identity 기반 Proposed `ADR-0009`를 작성
- `ADR-0009` Accepted: `age` public-recipient encryption을 사용하고 runtime에는 public recipient만, private identity는 owner offline custody에 보관
- synthetic `age` recipient encryption contract에서 temporary key·SQL의 gzip encrypt/decrypt byte round trip과 archive secret marker 부재를 확인하고 temporary directory 자동 정리
- `PLAN-0002` S3 encrypted backup/restore 계획 작성: local manifest verifier, disposable S3 restore Spike, production job·rehearsal을 credential gate별 bounded task로 분리
- PLAN-0002 Task 1의 archive manifest verifier를 추가해 non-secret metadata만으로 hash·schema version·retention·row count·invariant 검증을 수행하고 valid/invalid 합성 unit test 4개 통과

## 진행 중

- 예상 사용량과 고정비가 미확정인 항목의 복수 시나리오 유지
- D-09 세 region의 공개 latency·plan 재고, 1GB 자원과 VM·GPT·domain·backup 총비용 검증 대기
- 서울 VM capacity 결과·HTTPS 확인·resource cleanup 결과를 D-09 문서와 PROJECT_STATUS에 반영 완료
- TypeScript·Python 후보의 Gateway·Go Live·자원·시험성·공급망 검증 대기
- 저장소·배포·통신·인증 기술 선택은 필요한 별도 승인 Spike 증거 전까지 보류

## 다음 작업

로컬 foundation Task 1~5와 `ADR-0008`·`ADR-0009`, PLAN-0002 Task 1을 완료했습니다. 다음은
owner AWS login 뒤 disposable S3 restore Spike(Task 2)를 수행하는 일입니다.

## 차단 요소

- Homebrew AWS CLI API 경로는 기존 Python 3.14·system `libexpat` 충돌로 사용할 수 없어 공식 AWS CLI container 경로를 사용함; 임시 profile 인증과 서울 VM 실행은 완료
- `codex-settings/scripts/install.sh`는 Codex 사용자 환경에 Ponytail과 Superpowers 플러그인을 설치하므로 프로젝트 외부 변경 승인 전에는 실행하지 않음
- KBO 기능은 자동 접근·Discord 재표시 권리와 공급자 갱신 정보를 서면으로 확인할 때까지 연기하며, 30분 측정 기준도 함께 보류
- Riot Production/RSO 승인 가능성과 시작·종료 5분 감지는 미확정
- 예상 사용자 수, 메시지량, 월 요약 요청 수와 동시 게임 수가 미확정이므로 외부 API 비용·처리량은 복수 사용량 시나리오로 유지
- 단일 server host, GPT API, 도메인과 외부 백업을 합친 원화 비용이 월 3만 원을 충족하는지 미확정
- 서울 Lightsail·도쿄 Akamai·싱가포르 DigitalOcean의 실제 plan 재고·지연과 1GB bot+web 자원 여유가 미확정
- 자가 Mac은 hardware가 충분하지만 정전 후 자동 부팅 미지원이며 교육장 회선은 서면 승인 전 운영 경로에서 제외
- 월 명령 10,000회의 실제 저장·backup 크기와 무료 관리형 DB 한도 충족 여부가 미확정
- Discord OAuth의 PKCE 지원 범위와 D-05·D-08 경계에 맞는 workload 인증·credential rotation 방식이 미확정
- 익명 임시 outbound tunnel의 Vercel→자가 host 호출이 function timeout으로 실패했으며 원인이 Vercel egress, tunnel 공급자 경로, 지역 또는 연결 정책 중 어디인지는 분리하지 못함
- 공유 PostgreSQL request/result도 worker 처리와 별개로 Vercel function timeout이 발생해 고위험 현재 역할 조회의 5초 동기 경계가 아직 없음
- 계정 고정 managed tunnel도 local 왕복은 성공했지만 Vercel function timeout으로 실패해 공급자 교체만으로 추가 검증할 근거가 낮음
- S3 backup IAM·bucket 생성과 disposable encrypted restore Spike에는 실제 AWS login/credential 입력이 필요

## 현재 확정되지 않은 사항

- 언어와 런타임
- Discord SDK
- 대시보드 프레임워크
- 데이터 저장소
- 봇 실행 환경
- 단일 지속 server의 임대·소유 host 및 운영체제
- Riot 및 KBO 데이터 공급 방식
- 요약 모델 공급자
- 백업과 모니터링 도구
- 같은 host의 web·bot process/module 분리와 secret 권한 방식
- 선택 host에서 D-04 후보별 bot+최소 web의 idle/peak memory와 event-loop pause
- 실제 Gateway 단절·Resume, Go Live reconciliation과 배포 중 단일 bot 실행 검증
- 저가 VM의 1GB급 bot+web 자원 여유와 VM·backup·domain·GPT 원화 총액
- KBO 기능 재개 시 30분 지연 측정 시작점
- Riot 5분 감지 실패 시 완화할 목표 또는 수동 경로의 장기 정책
