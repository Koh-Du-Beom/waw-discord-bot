# 현재 구현 현황

- 점검일: 2026-07-30
- 기준 브랜치: `develop`
- 기준 커밋: `52b2d1c`
- 평가 기준: 제품 명세 대비 코드 구현, 자동 테스트, production 활성화 및 실제 검증

## 요약

전체 명세 기준 구현 완성도는 약 **75~80%**다. 사용자 대상 핵심 MVP인 대화
요약, Riot 계정 연결과 자동 몰랭 감지는 운영 가능한 수준이다. 반면 수동 신고,
신고자·동료 기록, 점수 정책과 대시보드의 게임 운영 화면은 아직 미완성이다.

진행률은 공식 스토리 포인트가 아니라 현재 저장소와 운영 증거를 바탕으로 한
점검 수치다.

| 기능 영역 | 진행률 | 현재 상태 |
|---|---:|---|
| 배포·서비스 기반 | 95% | Lightsail, systemd, Caddy, HTTPS, health, singleton, GitHub Actions 배포 운영 중 |
| 인증·권한·보안 | 90% | Discord OAuth, opaque session, CSRF, 현재 역할 재확인, 관리자 권한 분리 구현 |
| 대화 요약 | 90% | 최근 범위·직접 시간·전체 pagination·OpenAI·1시간 제한·공개 고지 구현 및 실사용 확인 |
| Riot 계정 관리 | 90% | 요청·API 검증·관리자 승인/거절·목록·본인/관리자 해제·표시 이름 동기화 구현 |
| 자동 몰랭 감지 핵심 | 85% | 솔로랭크와 Go Live 비교, 유예·중단 허용, 중복 방지, 자동 polling, 공개 알림 운영 활성 |
| 몰랭 정책 전체 | 55% | 정정·취소·스택은 있으나 수동 신고, 동료·신고자, 신뢰도/점수 정책 미구현 |
| 관리자 대시보드 | 60% | 상태, Riot 관리, 명령 로그, 요약 설정, 감사 기록 구현. 게임 운영 화면 다수 누락 |
| 로그·모니터링 | 85% | journald 보존·redaction·Discord 경보·health/backup 감시 구현 |
| 백업·복구·데이터 | 90% | 암호화 S3 백업, 자동 timer, 실제 복구 리허설, migration 1~10 운영 |
| 문서·상태 추적 | 75% | ADR·계획·runbook은 상세하지만 최근 실제 배포 결과와 일부 상태 문서 불일치 |

## 1. 대화 요약

진행률: **90%**

구현됨:

- 최근 10분, 30분, 1시간, 3시간, 6시간, 12시간, 24시간
- 한국 시간 직접 입력
- 100개 초과 메시지 pagination
- 일부 메시지를 조용히 누락하지 않는 완전 조회
- 핵심 논의, 결정, 할 일, 미해결 질문 구분
- 원문 메시지 비영구 처리
- OpenAI 외부 처리 고지
- 등록 사용자별 rolling 1시간 provider 호출 제한
- production Discord 실제 요약 성공 확인

남음:

- 장기간 실사용에서 24시간 대량 범위와 provider 장애율 관찰

## 2. Riot 계정 관리

진행률: **90%**

구현됨:

- 사용자가 Riot ID로 연결 요청
- Riot Account API를 통한 PUUID 확인
- 관리자 승인·거절
- 한 Discord 사용자에 여러 Riot 계정 연결
- 활성 PUUID의 사용자 간 중복 방지
- 사용자 본인 연결 해제
- 대시보드 관리자 연결 해제
- 활성 계정 목록
- Discord와 Riot 표시 이름 동기화
- 해제된 계정의 자동 관측 제외

승인된 제한:

- 현재 링크는 Riot RSO 소유권 인증이 아닌
  `admin_approved_unverified` 관리자 승인 방식이다.

## 3. 자동 몰랭 감지

진행률: **85%**

구현됨:

- 활성 Riot 계정 자동 polling
- 솔로랭크 queue 420만 검사
- Riot Spectator와 Discord Go Live 증거 분리
- 게임 시작 후 5분 유예
- 2분 스트림 중단 허용
- 불충분한 증거를 `unknown`으로 유지
- 동일 게임·사용자 사건 중복 방지
- 새 위반일 때만 Discord 공개 알림
- 공개 알림 실패 시 다음 poll에서 재시도
- Gateway reconciliation과 Discord API rate limit 복구
- 공개 메시지에서 적발 사용자만 mention 허용

운영 상태:

- production 자동 감시 활성
- 공개 알림 채널 설정과 봇 전송 권한 확인
- 서비스와 canonical health 정상

남음:

- 배포 후 실제 신규 솔로랭크 위반 한 건이 관측, incident 생성, 공개 알림으로
  이어지는 최종 end-to-end 실사용 검증

## 4. 몰랭 정책 전체

진행률: **55%**

구현됨:

- 자동 감지
- incident와 분리된 관측 증거 저장
- 사건 정정
- 관리자 취소
- 정정 사유와 감사 기록
- confirmed 사건 기반 사용자별 몰랭스택 조회

미구현 또는 불완전:

- 수동 신고와 수동 게임 시작·종료
- 자동 감지와 수동 신고의 데이터 구분
- 함께 플레이한 사람 기록
- 신고자 기록
- 신고 신뢰도
- 관리자 설정형 점수 정책
- 점수와 스택 변경 이력 UI
- 감지 정책의 대시보드 관리
- 유예시간과 중단 허용시간 설정

현재 유예시간 5분과 중단 허용시간 2분은 코드 상수다. 제품 명세는 이를 관리자
설정으로 관리하도록 요구한다.

## 5. 관리자 대시보드

진행률: **60%**

현재 화면:

- 대시보드
- Riot 계정
- 명령어 로그
- 설정
- 운영 기록

구현됨:

- bot, DB, backup 상태
- 최근 명령
- Riot 승인 대기와 활성 링크
- Riot 요청 승인·거절·일괄 처리
- 관리자 Riot 연결 해제
- cursor 기반 명령 로그
- 요약 활성 설정
- 설정 변경 감사 기록
- 반응형, 키보드와 axe 접근성 검사

미구현:

- 진행 중인 게임
- 몰랭 사건 이력
- 대시보드 사건 정정·취소
- 점수와 스택 상세
- 감지 정책 설정
- 허용 채널과 관리자 역할 설정
- 유예시간과 중단 허용시간 설정
- 데이터 보존 설정
- 오류·운영 로그 필터와 상세 화면
- 외부 API별 상태
- 수동 백업·복구 안내
- 배포 버전과 release 이력

열린 Riot 화면의 자동 갱신은 `ADR-0026`이 Proposed/Pending 상태라 아직
구현되지 않았다.

## 6. 인증·권한·보안

진행률: **90%**

구현됨:

- Discord OAuth state 일회성 사용
- OAuth code와 token 비영구 저장
- opaque server-side session
- session rotation, idle/absolute expiry와 logout revoke
- HttpOnly, Secure, SameSite cookie
- Origin과 CSRF 검증
- 서버와 역할의 현재 상태 재확인
- operator와 administrator 권한 분리
- 고위험 작업의 recent OAuth와 명시적 확인
- web runtime에 Discord bot token 미주입
- 관리자 IPC Unix socket 격리
- 메시지 원문, PUUID와 token의 로그 제외

남음:

- 복구 같은 최고위험 작업의 별도 대시보드 권한 계층과 UI

## 7. 운영·백업·배포

진행률: **90~95%**

구현 및 운영 검증됨:

- systemd web·bot 서비스
- singleton bot 실행
- Caddy HTTPS와 표준 production 도메인
- web, storage, bot과 Gateway를 반영한 `/health`
- journald 30일·1GiB 보존
- 로그 redaction
- Discord 운영 경보
- S3 client-side 암호화 백업
- 자동 backup·monitor timer
- exact-object 복구 리허설
- migration checksum과 RLS/grant 검증
- GitHub `production` 배포와 실패 시 rollback
- production schema version 10

## 문서 불일치

`PROJECT_STATUS.md`의 최상단 공개 알림 항목은 아직 production 설정·배포·restart가
없다고 기록한다. 이후 실제로 production release `413ede99710e`가 배포되고
자동 관측과 공개 알림 채널 설정이 활성화됐으므로 최신 운영 결과를 문서에
반영해야 한다.

## 최신 검증 결과

2026-07-30 실행:

```text
TMPDIR=/tmp npm test
npm run typecheck
npm run build
git diff --check
```

결과:

- 전체 테스트: 296
- 통과: 289
- 실패: 0
- skip: 7
- typecheck: PASS
- server/web build: PASS
- migration asset: 10개
- diff check: PASS
- 점검 전 작업 트리: clean

7개 skip은 일반 로컬 실행에서 별도 PostgreSQL 환경이 필요한 외부 통합
테스트다. 해당 경계는 별도 PostgreSQL fixture와 기존 운영 리허설로 보완한다.

## 권장 다음 작업

1. 실제 신규 솔로랭크 한 건의 자동 관측부터 공개 알림까지 end-to-end 검증
2. 기존 incident read model을 재사용한 대시보드 몰랭 이력 화면
3. 대시보드 사건 정정·취소
4. 유예시간과 중단 허용시간의 관리자 설정화
5. 수동 신고, 신고자·동료 기록과 점수 정책의 별도 ADR 및 구현 계획
6. `PROJECT_STATUS.md`에 최신 production 배포 결과 반영
