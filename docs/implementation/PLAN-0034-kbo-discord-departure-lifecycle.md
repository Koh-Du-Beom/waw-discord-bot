# 구현 계획: KBO Discord 서버 탈퇴 수명주기

- Status: Completed
- Related requirements: `FUN-028`, `SEC-001`~`SEC-009`
- Related ADRs: `ADR-0029`
- Depends on: `PLAN-0033`
- Owner: Product owner

## 목표

허용 서버의 멤버 탈퇴를 실시간 event와 시작 시 reconciliation에서 감지해 KBO
가입을 원자적으로 departed로 전환하고 표시명·Discord ID 직접 연결을 제거한다.

## 범위

- `GuildMemberRemove` listener와 허용 guild 경계
- 현재 멤버 목록과 active KBO 가입 비교를 통한 누락 event reconciliation
- 사용자별 enrollment lock, departed 전환, opaque operation·최소 audit transaction
- 중복·다른 guild·실패 격리, shutdown detach
- 탈퇴 후 지급·베팅·내역·랭킹 제외와 열린 bet 정산 보존 검증

## 범위 제외

- 사용자용 가입 해제·복구와 과거 계정 재연결
- 열린 bet 환불·무효화
- 1년 보존 만료 purge와 Production 배포·기능 활성화

## 결정

1. 기존 `GuildMembers` privileged intent와 startup member fetch를 재사용한다.
2. KBO enrollment의 `discord_user_id`를 null로 바꾸면 KBO 표시명 join도 함께
   끊어진다. 다른 제품이 공유하는 `registered_discord_user` row는 삭제하지 않는다.
3. operation과 audit에는 탈퇴한 Discord user ID를 저장하지 않고 opaque operation
   ID와 guild, 고정 결과만 기록한다.
4. 실시간 event와 reconciliation이 경합해도 active row lock과 조건부 전이로 한
   번만 departed가 된다.

## 승인

- Owner decision: Approved — production 직전까지의 잔여 기술 선택과 bounded
  source/local 구현을 승인함; Production 변경은 제외
- Approved date: 2026-08-10

## 구현 결과

- 허용 guild의 실시간 `GuildMemberRemove`와 시작 시 member reconciliation을 기존
  Gateway 생명주기에 연결하고 shutdown에서 안전하게 분리했습니다.
- 사용자별 lock 아래 active enrollment를 departed로 바꾸고 KBO의 Discord 직접
  연결을 null 처리합니다. Operation/audit에는 탈퇴 Discord ID를 저장하지 않습니다.
- 탈퇴 계정의 열린 bet 정산, 지급·새 bet·내역·랭킹 제외, 명시적 재가입의 0잔액
  신규 account, audit 실패 rollback을 unit/실제 PostgreSQL로 검증했습니다.
- 전체 test `356 pass / 7 기존 환경 skip / 0 fail` 및 PostgreSQL `29/29`가
  통과했습니다. Production 배포·기능 활성화는 수행하지 않았습니다.
