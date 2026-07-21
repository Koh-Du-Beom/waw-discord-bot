# 1GB runtime 수용량 Spike 제안

- 상태: Proposed — 미실행, VM 생성 승인 아님
- 제안일: 2026-07-21
- 연결 요구사항: `OPS-001`~`OPS-004`, `OWN-005`, `OWN-017`, `OWN-023`, `OWN-034`, `OWN-035`, `GAP-D09-03`, `GAP-D09-06`
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

서울의 1GB급 임시 VM 한 대에서 TypeScript와 Python 후보 중 적어도 하나는 첫 MVP의 최소 bot+web 합성 workload를 60분 동안 OOM, process crash, event 누락과 과도한 지연 없이 처리하면서 월 30,000원 총예산에 필요한 고정비 여유를 남긴다.

서울 Lightsail 1GB는 첫 검증 fixture일 뿐 공급자·region·plan·OS·runtime·SDK 선택이 아니다. 여기서 후보 하나가 통과하면 도쿄 Akamai와 싱가포르 DigitalOcean의 동등 시험은 실행하지 않는다. 두 runtime이 모두 실패할 때만 2GB 또는 다른 공급자를 다시 검토한다.

## 기능 연결

이 Spike는 다음 제품 기능을 구현하지 않고, 해당 기능들을 같은 저가 host에서 실행할 자원 여유만 검증한다.

- Discord Gateway 상시 연결과 명령 수신
- Riot 게임 중 Discord Go Live 상태를 관찰하는 후속 몰랭 자동 감지
- 관리자 web·Discord OAuth·설정 조회
- 명령 감사, dedupe, session과 heartbeat 처리

실제 Discord Gateway 로그인·Resume, Go Live reconciliation, Riot 연동과 OAuth는 범위 밖이며 D-04 또는 후속 경계 검증에 남긴다.

## 최소 범위와 합성 데이터

같은 1GB VM에서 TypeScript와 Python harness를 동시에 실행하지 않고 순차 실행한다.

- Discord Voice State 형태의 비민감 합성 event 10,000건
- 중복 event 10%를 섞은 dedupe 처리
- `/health`, `/status`, 합성 설정 조회의 최소 HTTP endpoint
- HTTP 동시 요청 5개, 초당 2요청
- 이전 저장량 Spike의 상한 안에 있는 40MB 이하 합성 audit·session·dedupe data
- runtime별 60분 연속 실행
- credential 없는 Discord public Gateway URL HTTPS 조회로 outbound 경로 확인
- Mac에서 임시 HTTPS endpoint까지 5회 연결 확인

실제 사용자 ID, Discord 원문, bot·OAuth·GPT token, 운영 DB와 운영 domain은 사용하지 않는다. 임시 Linux image와 시험 harness는 비교 fixture이며 제품 architecture로 승격하지 않는다.

## 성공·실패 기준

runtime 하나의 성공에는 다음을 모두 요구한다.

- OOM, process crash와 강제 재시작 0회
- swap의 지속 증가나 명백한 thrashing 없음
- system available memory가 128MiB 아래로 1분 이상 유지되지 않음
- application 합산 RSS p95 650MiB 이하
- shared vCPU 사용률 p95 70% 이하
- HTTP p95 500ms 이하, 오류율 0.1% 이하
- 합성 event 누락과 중복 반영 0건
- event-loop 또는 scheduler 지연 p99 100ms 이하
- 60분 동안 health 확인 성공

TypeScript와 Python이 모두 하나 이상의 기준을 위반하거나 결과를 측정할 수 없으면 전체 가설을 실패로 판정한다. 한 runtime만 실패하면 그 runtime과 1GB 조합만 실패하며 다른 공급자 전체로 일반화하지 않는다.

## 임시 환경·credential·비용 상한

- 서울 Lightsail public IPv4 1GB급 VM 한 대
- 비교용 임시 Linux image 한 개
- 임시 SSH key 한 개
- inbound는 시험 HTTPS와 제한된 관리 접속만 허용
- provider snapshot, 유료 backup, 추가 disk와 운영 DNS는 만들지 않음
- Discord·OAuth·GPT·database credential은 만들거나 조회하지 않음
- 목표 사용료 USD 1 이하, 예상하지 못한 최소 청구·세금·환전 포함 절대 상한 USD 3

실행에는 공급자 account와 결제수단이 필요하지만 credential 값은 문서·명령·로그에 출력하지 않는다. 실제 account 접근과 VM 생성은 별도 사용자 승인 뒤에만 수행한다.

## 비용 판정

실행 결과와 별도로 월 운영 고정비를 다음 기준으로 계산한다.

- VM, provider native backup, 공급자 밖 독립 backup과 domain 연환산 합계 18,000원 이하
- GPT·세금·환율 변동에 최소 12,000원 보존
- 전체 월 예상액 30,000원 이하

실제 GPT 사용량이 아직 없으므로 이 Spike가 통과해도 `GAP-D09-06`은 축소될 뿐 닫히지 않는다.

## 정리와 중단 조건

실행 완료 또는 어느 단계에서든 비용 상한·보안 경계를 지킬 수 없으면 즉시 중단한다. 이후 임시 VM, disk, snapshot, static IP, firewall rule과 SSH key를 삭제하고 billing 화면에서 잔존 resource가 없는지 확인한다. 저장소에는 비밀정보 없는 결과, 측정 명령, 한계와 비용만 남긴다.

## 실행 전 남은 승인

이 문서는 Spike 실행 승인이 아니다. 다음 승인에서는 서울 Lightsail 1GB 임시 VM 생성, 최대 USD 3 지출, 비운영 SSH key 사용과 시험 후 resource 삭제만 허용하면 된다. runtime·SDK·host 선택, ADR과 제품 구현은 포함하지 않는다.
