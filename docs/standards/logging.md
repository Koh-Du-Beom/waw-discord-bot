# 로그 표준

모든 명령 시도와 중요한 운영 작업을 구조화된 이벤트로 기록합니다.

권장 필드:

- timestamp
- correlation_id
- event_type
- actor_id
- guild_id
- channel_id
- command_name
- outcome
- reason_code
- duration
- service_version

금지 필드:

- Discord 메시지 원문
- OAuth 코드
- 토큰
- 쿠키
- API 키
- 비밀번호
- 전체 요청 헤더
- 필요하지 않은 개인정보

운영 로그와 감사 로그의 목적, 보존 기간과 접근 권한을 구분합니다.
