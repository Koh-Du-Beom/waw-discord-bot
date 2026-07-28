# 배포 및 보안 가이드

이 문서는 구현 기술을 확정하지 않고 운영 요구사항과 비교해야 할 배포 형태를 정의합니다.

## 1. 구성요소

- 지속 연결이 필요한 Discord 봇
- `waw.dubeom.com` 관리자 웹
- 영구 데이터 저장소
- 백업 저장소
- 인증 및 비밀정보 관리
- 감사 로그와 운영 모니터링

## 2. 비교할 배포 형태

최소 다음 후보를 조사합니다.

1. 봇, 웹, 데이터를 하나의 지속 서버에 배포
2. 웹은 Vercel, 봇과 데이터는 지속 서버에 배포
3. 웹은 Vercel, 봇은 지속 호스트, 데이터는 관리형 저장소
4. 모든 구성요소를 자체 호스팅

이 목록은 추천안이 아닙니다. 비용, 운영 난이도, 장애 격리, 백업, 보안, 확장성과 공급자 종속성을 비교해야 합니다.

## 3. 도메인

관리 대시보드의 표준 운영 주소는 다음과 같습니다.

`https://waw.dubeom.com`

요구사항:

- HTTPS
- 소유권 검증
- 안전한 OAuth 리디렉션
- 운영/미리보기 환경 분리
- 쿠키와 세션의 정확한 도메인 및 SameSite 설정

## 4. Discord 봇 실행 환경

봇은 Discord Gateway 연결과 장시간 실행이 필요할 수 있습니다.

조사 항목:

- 지속 프로세스 보장
- 재시작 정책
- 연결 복구
- 배포 중 중복 실행 방지
- 스케줄 작업 중복 방지
- 상태 확인
- 로그와 메트릭
- 비용

특정 서버리스 플랫폼이 적합하다고 가정하지 않습니다.

## 5. 비밀정보

다음은 저장소에 커밋하지 않습니다.

- Discord Bot Token
- Discord OAuth Client Secret
- Riot API Key
- AI 공급자 키
- 세션 서명 키
- 데이터베이스 인증정보
- 백업 저장소 인증정보

환경별 비밀정보를 분리하고, 최소 권한과 정기 교체 절차를 정의합니다.

### 첫 MVP capability 경계

| 주체 | 주입받는 capability | 금지 capability |
|---|---|---|
| web runtime | local command service, opaque session 검증 결과 | Discord bot token, Supabase migration/backup credential |
| bot runtime | Discord bot token, current member/role reader | browser cookie/session ID, OAuth code/token |
| migration/backup job | 별도 최소 DB role, public `age` recipient, prefix Put-only S3 credential | owner recovery identity, S3 read/delete, Discord bot token, browser session credential |

같은 Lightsail host라도 capability를 명시적으로 주입하고, web과 bot module은 서로의 비밀값을 읽지 않는다. backup job은 별도 system account로 실행하며 secret environment file은 `root:waw-backup` mode `0640`으로 제한한다. production rehearsal에서 backup DB role과 Put-only writer 경계, temporary exact-object reader와 runtime의 owner identity 부재를 검증했다.

## 6. OAuth와 세션

- OAuth `state` 검증
- 등록된 정확한 redirect URI
- 세션 고정 방지
- 안전한 HttpOnly, Secure 쿠키
- 로그아웃 및 세션 폐기
- 권한 변경 시 재검증
- 허용 Discord 서버 및 역할 검증
- CSRF 방어
- 관리자 작업의 재인증 또는 추가 확인 검토

## 7. 봇과 웹 간 통신

분리 배포하는 경우 다음을 비교합니다.

- 직접 관리 API
- 메시지 큐
- 공유 데이터 저장소
- 이벤트 기반 동기화

필수 속성:

- 상호 인증
- 요청 재전송 및 중복 처리
- 타임아웃
- 권한 분리
- 감사 로그
- 네트워크 장애 시 안전한 실패
- 인터넷에 공개되는 관리 API 최소화

## 8. 로그

- 구조화 로그
- 요청 또는 작업 상관관계 ID
- 오류 원인과 결과 코드
- 비밀정보 마스킹
- 메시지 원문 제외
- 보존 기간과 접근 통제
- 장애 분석에 필요한 최소 정보

플랫폼 기본 로그 보존만으로 감사 요구사항을 충족한다고 가정하지 않습니다.

## 9. 백업 및 복구

- 자동 백업
- 암호화
- 운영 데이터와 분리된 위치
- 보존 정책
- 복구 절차
- 정기 복구 테스트
- 복구 시점 목표와 데이터 손실 허용치 조사
- 마이그레이션 전 백업
- 잘못된 관리자 작업의 복구 가능성

백업 성공 로그만으로 복구 가능성을 증명하지 않습니다.

## 10. 배포 점검

ADR-0023 이후 application source 승격은 보호된 `develop`→`production` PR과
GitHub Actions를 기본 경로로 사용합니다. Workflow는 production ref에 묶인
OIDC 임시 AWS role과 Lightsail temporary SSH certificate만 사용하며 장기
AWS/SSH secret을 GitHub에 저장하지 않습니다. Migration, credential 변경,
Discord 등록, provider/game flag activation과 journald vacuum은 application
push로 승인되지 않습니다. 기존 named operator/CloudShell 경로는 break-glass
rollback으로 유지합니다.

- 테스트 통과
- 승인된 ADR과 일치
- 스키마 마이그레이션 검토
- 비밀정보 주입 확인
- OAuth redirect URI 확인
- DNS와 TLS 확인
- 백업 확인
- 상태 확인
- 롤백 절차
- 중복 봇 인스턴스 방지
- 변경 이력 갱신

### Health와 singleton 판정

- `/health`가 `healthy`를 반환하려면 web process, storage, bot process와 Discord Gateway가 모두 정상이어야 한다.
- Gateway가 disconnected/unknown이면 web과 storage가 살아 있어도 `degraded`로 표시한다.
- web process 또는 canonical storage가 없으면 `unavailable`로 표시한다.
- bot 시작은 singleton lease를 먼저 claim하고, 이미 claim된 경우 두 번째 process는 Gateway 연결을 시작하지 않고 실패한다.
- 실제 process lease, crash/restart, Discord Resume과 Lightsail reboot 측정은 production credential·host 승인 뒤 별도 runbook으로 검증한다.

## 11. 롤백

릴리스 전 다음을 정의합니다.

- 이전 앱 버전 복귀 방법
- DB 변경의 호환성
- 기능 플래그 또는 단계적 활성화
- 롤백 판단 조건
- 데이터 변환의 역방향 또는 복구 전략
# PLAN-0008 quota rollout gate

Migration 0007 and summary quota enforcement remain production-disabled until
Gate A metadata-only preflight and Gate B fresh encrypted backup/restore
evidence approve the exact immutable release. Rollback disables the quota and
dashboard feature gates, reactivates the previous release, and preserves the
additive quota tables and reservation audit rows.

The immutable release must deploy with `WAW_SUMMARY_QUOTA_ENABLED=0` for the
bot. Only the exact value `1` enables that boundary. The superseded dashboard
daily-quota API/UI and its feature flag are absent from the active web
assembly.

ADR-0021 and migration `0008` supersede the daily quota contract. New releases
use only the bot-side rolling one-hour `/요약` cooldown. The legacy dashboard
quota flag remains `0` and does not authorize a dashboard quota API or UI.
