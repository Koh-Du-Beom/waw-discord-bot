# Riot 계정 연결과 League of Legends 게임 감지 가능성

- 상태: Research
- 문서 확인일: 2026-07-20
- 범위: Riot 계정 소유권 연결, 솔로 랭크 게임 시작·종료 감지, 관련 공식 API·승인·정책
- 비범위: API 키 신청, API 호출, 계정 생성, Spike 실행, 공급자 최종 선택, ADR 작성
- 증거 제한: Riot Developer Portal, Riot 공식 API 문서와 공식 정책만 사실 근거로 사용

## 결정 질문과 잠정 결론

Riot 공식 수단만으로 등록 사용자의 Riot 계정 소유권을 검증하고 League of Legends 솔로 랭크 게임의 시작과 종료를 5분 이내 감지할 수 있는가?

- **확인된 사실:** Riot Sign On(RSO)은 사용자를 Riot 로그인으로 보내 동의를 받고, 토큰으로 `/riot/account/v1/accounts/me`를 호출해 로그인한 계정을 식별하는 공식 연결 수단이다. RSO는 승인된 Production application ID와 별도 RSO 승인이 있어야 한다.
- **확인된 사실:** `SPECTATOR-V5`는 PUUID로 현재 게임을 조회하고 `gameId`, `gameStartTime`, `gameQueueConfigId`, 참여자 PUUID 목록을 반환한다. 공식 queue 상수에서 `420`은 현재 5v5 Ranked Solo이다.
- **추론:** RSO로 얻은 PUUID를 플랫폼 라우팅의 `SPECTATOR-V5`에서 주기적으로 조회하면 솔로 랭크 시작 후보를 탐지하고, 같은 `gameId`가 더 이상 현재 게임으로 조회되지 않을 때 종료 후보를 만들 수 있다.
- **미확인:** 공식 문서는 Spectator 데이터의 갱신 주기, 시작·종료 반영 지연, 이벤트 푸시, 가용성 SLA 또는 5분 이내 탐지를 보장하지 않는다. 따라서 `OWN-007`의 5분 목표는 문서만으로 충족 판정할 수 없다.
- **잠정 판단:** 공식 계정 소유권 검증은 **승인 조건부로 가능**하다. 자동 게임 감지는 **폴링 기반으로 기술적 후보가 존재**하지만, 5분 목표와 안정적인 종료 상태 전환은 승인된 별도 Spike 전에는 미검증이다. 이는 기술이나 공급자의 최종 선택이 아니다.

## 연결 요구사항

| 요구사항 | 조사 결과와의 연결 |
|---|---|
| `FUN-010` | Spectator의 `gameQueueConfigId`와 공식 queue 상수 `420`으로 솔로 랭크 여부를 구분할 수 있다. Discord Go Live 판정은 이 문서 범위 밖이다. |
| `FUN-011` | RSO는 계정 등록의 공식 소유권 근거가 될 수 있다. Spectator 폴링은 자동 시작·종료 후보이며 수동 감지는 승인 실패·장애 시 대안이다. |
| `FUN-012` | `gameStartTime`은 시작 후 유예시간 계산의 공식 입력 후보지만, 실제 노출 지연은 미확인이다. 5분/2분 값은 Riot API가 아니라 프로젝트 설정이다. |
| `FUN-013` | `platformId + gameId`를 사건 키 후보로 사용하면 폴링 재조회 중복을 억제할 수 있다. 재시도·동시성 보장은 프로젝트 데이터 계층 책임이다. |
| `FUN-014` | Spectator 참여자 `puuid`로 함께 플레이한 사람 후보를 확인할 수 있으나 익명 참여자는 `null`일 수 있다. 신고자는 Riot 데이터가 아니라 프로젝트 데이터다. |
| `FUN-015` | Riot API는 프로젝트의 점수·정정·취소 정책을 제공하지 않는다. 해당 상태와 감사 기록은 관리자 기능으로 분리해야 한다. |
| `DAT-003` | 동일 `gameId`의 반복 관측, 404·429·5xx 후 재시도, 재시작 시 재관측을 멱등 처리해야 한다. |
| `PRI-002` | 감지에는 연결된 PUUID, 플랫폼, 현재 `gameId`, queue, 최소 참여자 식별자만 필요하다. 챔피언·룬·밴 등 부가 Spectator 데이터는 수집할 필요가 없다. |
| `PRI-003`, `OWN-004` | 해제·서버 탈퇴 즉시 폴링 대상에서 제외하고, 30일 유예 후 연결 식별자를 삭제하며 기존 이력은 식별정보 삭제 또는 익명화가 필요하다. Riot의 삭제 요청 식별자 전달에도 대응해야 한다. |
| `OWN-007` | RSO 우선, 불가 시 관리자 승인이라는 비교 기준과 시작·종료 5분 목표를 직접 검증한다. |
| `OWN-008` | 감지 결과는 5분 유예·2분 중단 허용·자동/수동 구분·관리자 정정의 입력일 뿐이며 해당 정책을 Riot 상태로 대체하지 않는다. |

## 제약과 평가 기준

1. 계정 연결은 사용자가 비밀번호를 제3자에게 제공하지 않는 공식 수단이어야 한다.
2. 운영 승인을 받기 전 RSO 사용 가능성을 전제로 완료 처리하지 않는다.
3. 시작·종료 감지는 공식 문서에 정의된 데이터만 사용하고, 클라이언트 비공개 API나 역공학을 후보로 두지 않는다.
4. 5분 목표, 호출 한도, 등록 사용자 수와 지역 수가 동시에 성립해야 한다.
5. 입력·응답·재시도는 지역 라우팅, rate limit, 장애와 중복에 안전해야 한다.
6. PUUID와 게임 참여 정보는 최소 수집·보존·삭제·접근 통제 대상이다.
7. 제품 등록·감사, HTTPS, 키 비공개, 게임 공정성 및 익명화 정책을 지켜야 한다.

## 공식 수단별 확인 결과

### 1. 계정 소유권: Riot Sign On

**확인된 사실**

- RSO는 OAuth2/OpenID 기반으로 사용자가 Riot에 로그인하고 제3자 데이터 접근에 동의하게 하는 공식 수단이다. 비밀번호를 제품에 제공하지 않는다.
- League of Legends 문서는 RSO 액세스 토큰으로 지역 클러스터의 `/riot/account/v1/accounts/me`를 호출하면 로그인한 사용자를 식별할 수 있다고 명시한다.
- RSO는 Production level API key만으로 자동 제공되지 않는다. 기존에 승인된 Production application ID가 있어야 RSO client를 신청할 수 있고 Riot의 승인 절차를 거친다.
- Production 신청에는 대체로 완성 또는 거의 완성된 앱/프로토타입, 사용자 흐름을 보여 주는 운영 웹사이트, 서비스 약관과 개인정보처리방침이 필요하다. Discord 봇도 웹사이트와 도메인 소유권 검증이 필요하다.

**추론**

- RSO 로그인 결과의 PUUID를 Discord 사용자 등록 행위와 같은 인증 세션에서 결합하면 `OWN-007`이 요구한 공식 계정 소유권 검증 근거가 된다.
- RSO 승인 전에는 Riot ID 문자열을 PUUID로 해석하는 표준 API만으로 “그 Riot ID를 입력한 Discord 사용자가 실제 소유자”임을 증명할 수 없다.

**미확인**

- 이 비공개 개인 Discord 서버용 “몰랭 검거” 사용 사례가 Production 및 RSO 심사에서 승인되는지는 공식 문서만으로 알 수 없다.
- RSO 토큰의 실제 수명, 갱신·폐기 동작과 승인된 scope는 공개 개요만으로 이 조사에서 확정하지 않았다.

### 2. 게임 시작: SPECTATOR-V5

**확인된 사실**

- 플랫폼 라우팅 endpoint `/lol/spectator/v5/active-games/by-summoner/{encryptedPUUID}`는 해당 PUUID의 현재 게임 정보를 반환한다.
- 응답에는 `gameId`, `gameStartTime`(epoch milliseconds), `gameLength`, `platformId`, `gameMode`, `gameQueueConfigId`, `participants`가 있다.
- 참여자에는 `teamId`, `championId`, `puuid` 등이 있으나 익명 플레이어의 PUUID는 `null`일 수 있다.
- 공식 queue 상수에서 `queueId` `420`은 “5v5 Ranked Solo games”이다. 과거 `4`는 deprecated이므로 현재 자동 판정은 `420`을 기준으로 하고 공식 상수 변경을 추적해야 한다.
- 현재 게임 조회의 문서화된 오류에는 404(Data not found), 429, 5xx가 포함된다.

**추론**

- 이전 관측이 “활성 게임 없음”이고 새 응답의 `gameQueueConfigId == 420`이면 시작 후보로 볼 수 있다.
- `platformId + gameId`는 같은 게임의 반복 폴링과 여러 등록 참여자의 동시 관측을 합칠 수 있는 최소 중복 키 후보다.
- `participants[].puuid`는 함께 플레이한 등록자를 찾는 공식 입력이지만, 익명 PUUID를 억지로 복원해서는 안 된다.

**미확인**

- Riot은 Spectator 응답이 실제 게임 시작 뒤 얼마 만에 노출되는지, 데이터가 얼마나 자주 갱신되는지, 5분 이내 관측되는지를 공개 문서에서 보장하지 않는다.
- 404가 “게임 없음” 외 다른 Data not found 상황과 운영상 어떻게 구분되는지, 짧은 일시 장애와 동일하게 보일 수 있는지는 실측하지 않았다.

### 3. 게임 종료: Spectator 비활성화와 MATCH-V5

**확인된 사실**

- `MATCH-V5`는 PUUID별 match ID 목록을 조회하며 `queue`, `startTime`, `endTime` 필터를 지원한다. match ID로 match 상세를 조회하는 공식 endpoint도 있다.
- Match API는 지역 클러스터 라우팅을 사용한다. KR/JP는 `ASIA`이며 Spectator는 `KR` 같은 플랫폼 라우팅을 사용한다.
- API 참조에는 사용자 승인 토큰을 요구하는 `LOL-RSO-MATCH-V1`도 별도 RSO API로 등재되어 있다.

**추론**

- 활성 `gameId`가 더 이상 Spectator에서 조회되지 않는 것은 종료 **후보**일 뿐, 404·일시 오류·라우팅 오류와 구분하기 위한 확인 상태가 필요하다.
- 종료 후 Match 목록/상세가 나타나면 queue와 참여자를 사후 확정하는 보조 근거가 될 수 있다. 그러나 Spectator의 숫자 `gameId`와 Match ID의 정확한 대응 형식은 공식 문서와 실제 응답으로 별도 검증해야 한다.

**미확인**

- 종료 후 Spectator 비활성 전환 및 Match 데이터 게시까지의 지연은 공식 보장이 없다.
- 폴링 결과만으로 5분 내 “종료 확정”을 안전하게 달성할 수 있는지는 미확인이다.
- 공식 webhook, push event 또는 승인 가능한 이벤트 구독 경로는 조사한 공식 League API 목록에서 확인되지 않았다.

## 키, 신청 조건과 rate limit

| 구분 | 공식 제한과 용도 | 이 조사에 미치는 영향 |
|---|---|---|
| Development key | Developer Portal 로그인 시 발급되는 임시 키. 공개 사용이 아닌 실험·프로토타입용이며 24시간마다 비활성화된다. 공개 제품 운영에는 사용할 수 없다. | 운영 감지 수단이 아니다. 공식 문서는 현재 Development key의 숫자 한도를 이 페이지에서 명시하지 않아 미확인으로 둔다. |
| Personal key | 등록한 개인 또는 소규모 비공개 커뮤니티 제품용. Standard APIs를 요청할 수 있고 심사 없이 등록 가능하지만 한도 증액은 불가하다. `20 requests/1 second`, `100 requests/2 minutes`, 지역별 적용. 공개 alpha/beta 포함 공개 서비스에는 사용할 수 없다. | 이 프로젝트가 “small private community”로 인정되는지는 등록 설명과 Riot 판단에 달렸다. RSO는 사용할 수 없다. |
| Production key | 대규모 커뮤니티/공개 제품용. 일반적으로 동작하는 프로토타입과 검증된 웹사이트가 필요하다. 시작 한도 `500 requests/10 seconds`, `30,000 requests/10 minutes`, 지역별 적용. 증액은 정상 상태, 커뮤니티 이익과 지속적 한도 초과 성장 근거가 필요하다. | RSO의 선행조건이다. 개인 Discord 서버 규모와 사용 사례가 승인될지는 미확인이다. |

추가 공식 제약:

- application, method, service rate limit이 각각 존재하며, 하위 서비스가 별도 한도를 적용할 수도 있다.
- 429 수신 시 `Retry-After` 동안 호출을 중단해야 한다. 여러 application/key로 rate limit을 우회해서는 안 된다.
- 한 API key는 승인 설명에 해당하는 한 제품에만 사용한다. Production key를 여러 프로젝트에 사용하지 않는다.
- API key는 코드에 넣거나 외부에 공개하지 않고 HTTPS로 전송해야 한다.
- 플레이어 대상 제품은 공식 문서 API 사용 여부와 무관하게 등록·감사를 받아야 하며 기능 변경도 Developer Portal에 반영해야 한다.
- Riot 정책 변경을 계속 추적해야 하며 API 변경 시 통상 구·신 버전 60일 병행을 목표로 하지만 더 짧거나 길 수 있다.

### 폴링 예산 추론

등록 계정 `N`개를 5분 간격으로 한 플랫폼에서 각각 한 번 조회하면 분당 약 `N/5`, 2분당 약 `0.4N`회의 Spectator 호출이 필요하다. Personal key의 application 한도 `100/2분`만 놓고 보면 이론상 `N <= 250`이지만, 같은 지역의 다른 API 호출·method/service 한도·재시도·동시 burst를 제외한 값이므로 운영 수용량이 아니다. 사용자 수가 미확정인 현재는 보수적 여유와 429 backoff를 포함한 시나리오가 필요하다.

## 지역 라우팅과 식별자

**확인된 사실**

- League API는 endpoint에 따라 플랫폼 라우팅과 지역 클러스터 라우팅이 다르다.
- 한국의 Spectator/Summoner 계열 플랫폼 host는 `kr.api.riotgames.com`; Account/Match 계열 지역 host는 `asia.api.riotgames.com`이다.
- Account API의 Riot ID 조회는 `gameName + tagLine`에서 PUUID를 얻지만, 그 조회 자체는 입력자의 소유권을 증명하지 않는다.

**운영 추론**

- 연결 레코드에는 최소 `puuid`와 LoL 플랫폼을 함께 두어야 하며, Riot ID 표시값은 변경 가능한 조회·표시 정보로 취급하는 편이 안전하다.
- 잘못된 플랫폼으로 Spectator를 조회한 404를 “게임 종료”로 오인하지 않도록 등록 시 플랫폼을 검증하고 변경 경로를 둬야 한다.
- 계정·경기 식별자는 로그에 원문으로 남기기보다 내부 상관 ID를 사용하고, 운영자가 필요한 범위에만 접근하게 해야 한다.

## 개인정보, 보존과 삭제

**확인된 사실**

- Riot API Terms는 API 개발자가 GDPR 대상 개인정보를 다룰 수 있다고 명시한다. Riot이 최종 사용자 삭제 요청을 받으면 활성 개발자에게 해당 사용자 식별자 목록을 Riot 채널로 전달한다고 설명한다.
- 일반 정책은 합리적으로 식별할 수 없는 플레이어의 익명성을 해제하는 제품을 금지한다.
- Riot은 제품 등록, 지원되는 Riot 서비스 사용, 기능 변경 감사와 정책 최신 상태 유지를 요구한다.

**프로젝트 제약에 대한 추론**

- `PRI-002`에 따라 PUUID, 플랫폼, 현재 게임 식별자, queue와 사건에 필요한 참여자 연결만 저장하고 Spectator의 룬·주문·밴·관전 암호화 키는 저장하지 않는다.
- `OWN-004`에 따라 연결 해제·서버 탈퇴 즉시 폴링 목록에서 제거하고, 30일 유예 뒤 PUUID·Riot ID·플랫폼 연결을 삭제한다. 기존 1년 몰랭 이력은 Discord/Riot 식별 연결을 삭제하거나 익명화한다.
- Riot가 전달하는 삭제 식별자 요청을 연결·이력·백업 만료 절차에 반영하는 운영 경로가 필요하다. 공식 정책은 이 프로젝트의 30일 유예를 승인하지 않으므로 삭제 요청 처리 기한은 별도 법률·정책 검토 대상이다.
- OAuth access/refresh token은 API key와 별도의 민감정보다. 필요 이상 보존하지 않고 로그·감사 이벤트에서 제외하며 해제 시 폐기해야 한다.

**미확인**

- Riot의 개발자 대상 삭제 식별자 전달 채널, 형식, 처리 기한과 확인 절차는 공개 API 문서에서 구체적으로 확인되지 않았다.
- PUUID, Riot ID, 참여자 데이터에 적용되는 관할별 법적 보존·삭제 의무는 이 기술 조사 범위에서 확정하지 않았다.

## 후보 비교

| 후보 | 소유권 증거 | 자동 감지 | 장점 | 핵심 한계 |
|---|---|---|---|---|
| A. RSO + Spectator 폴링 + Match 사후 확인 | 공식 로그인 계정의 `/accounts/me` | 시작·종료 후보 자동화 가능 | 소유권 근거가 가장 강하고 PUUID를 직접 연결 | Production/RSO 승인 필요; 5분 SLA와 종료 전환 미보장 |
| B. 관리자 승인 + Spectator 폴링 + Match 사후 확인 | 관리자 확인 절차뿐 | 시작·종료 후보 자동화 가능 | RSO 승인 전에도 Standard API 범위 검토 가능 | Riot ID 조회는 소유권 증명이 아니며 사칭·오연결 위험 잔존 |
| C. 관리자 승인 + 수동 시작·종료 신고 | 관리자 확인 절차뿐 | 없음 | API 지연·폴링 한도에 덜 의존 | `FUN-011`의 수동 경로만 충족; 누락·지연·조작 가능성 큼 |

## 관리자 승인 방식의 잔여 위험

공식 소유권 검증이 불가능할 때 관리자가 Riot ID, 화면 캡처, 프로필 아이콘 임시 변경 또는 게임 내 행동을 확인하더라도 다음 위험이 남는다. 이들은 공식 Riot 소유권 증명이 아니라 프로젝트 운영 추론이다.

- 다른 사람의 공개 Riot ID를 등록하는 사칭과 관리자 오승인
- 캡처 조작, 화면 공유 계정 전환, 빌린 계정으로 인한 증거 위조
- Riot ID 변경, 계정 이전·복구·양도 후 기존 Discord 연결이 낡는 문제
- 같은 사람이 여러 Riot 계정을 등록하거나 한 계정이 여러 Discord 사용자에 중복 연결되는 문제
- 관리자가 계정 비밀번호나 세션 공유를 요구하게 되는 위험; Riot 정책상 계정 정보 공유를 요구해서는 안 된다.
- 승인 시점만 소유권을 확인하고 이후 통제권 상실을 감지하지 못하는 문제
- 오연결이 제3자의 게임 활동·참여자 정보를 지속 수집하고 잘못된 몰랭 사건을 만드는 개인정보·평판 위험
- 관리자 재량의 불일치, 이의제기 증거 부족과 감사 부담

완화하더라도 공식 검증과 동등해지지는 않는다. 최소한 Discord 사용자당/PUUID당 활성 연결 유일성, 관리자·시각·근거 유형 감사, 만료 후 재승인, 이의제기·즉시 해제, 오승인 시 사건 정정·익명화가 필요하다. 비밀번호·OAuth 코드·토큰·Riot 세션을 증거로 수집하지 않는다.

## 실패·중복 상태에 대한 최소 모델

다음은 구현 결정이 아니라 `DAT-003` 검증을 위한 추론 모델이다.

1. 성공 응답이며 queue `420`: `(platformId, gameId)` 시작 또는 계속 관측.
2. 성공 응답이나 다른 queue: 솔로 랭크 사건으로 만들지 않음.
3. 404: 즉시 종료 확정하지 않고 비활성 후보로 둠.
4. 429: `Retry-After` 준수; 상태를 “종료”로 바꾸지 않음.
5. 5xx/timeout: 미확인 상태 유지; 지수 backoff와 다음 관측 필요.
6. 후속 비활성 관측 또는 Match 확인: 종료 후보 강화.

`(platformId, gameId)` 유일 키와 상태 전이의 조건부 갱신이 같은 게임을 여러 계정·워커·재시도에서 중복 사건으로 만드는 것을 막아야 한다. 몇 회의 비활성 관측으로 종료를 확정할지는 공식 근거가 없으므로 Spike 전에는 정하지 않는다.

## Spike 후보 — 현재 실행하지 않음

공식 문서로 확인할 수 없는 항목만 별도 승인 후 실제 키·테스트 계정으로 검증한다.

1. **시작 지연:** KR 솔로 랭크의 실제 시작 시각과 Spectator 최초 `gameId` 노출 시각 차이. 성공 기준 후보: 대표 표본에서 5분 이내 관측하며 누락·오분류 기록.
2. **종료 전환:** 실제 종료 시각, Spectator 최초 404, MATCH-V5 목록/상세 최초 노출의 차이. 404·5xx·timeout을 분리 기록.
3. **식별자 대응:** Spectator `gameId`와 MATCH-V5 `matchId`의 안정적인 연결 방법, queue `420`과 참여자 PUUID 일치 여부.
4. **폴링 한도:** Personal 또는 승인된 Production key에서 Spectator method/service 한도 헤더, 429와 `Retry-After`, 등록 계정 수별 호출 예산.
5. **RSO 수명주기:** 승인된 RSO 환경에서 `/accounts/me`, 토큰 갱신·폐기, 연결 해제 후 접근 차단과 재등록 흐름.

Spike는 `docs/prompts/spike.md`의 별도 요청과 승인 없이는 실행하지 않는다.

## 잠정 추천, 가장 강한 대안과 반전 조건

### 잠정 추천

아키텍처 선택이 아니라 다음 조사 단계의 우선순위로서, **A(RSO + Spectator 폴링 + Match 사후 확인)**를 공식 소유권과 자동 감지를 함께 만족할 유일한 완전 후보로 유지한다. 다만 Production/RSO 승인을 받기 전에는 사용 가능으로 확정하지 않고, 5분 감지는 Spike 통과 전 제품 약속으로 표현하지 않는다.

### 가장 강한 대안

RSO 승인이 불가능하지만 Standard API 사용이 승인되는 경우 **B(관리자 승인 + 같은 공식 게임 API)**가 가장 강한 대안이다. 계정 등록을 “Riot 검증됨”으로 표시하지 말고 “관리자 승인됨”으로 구분하며, 사칭·오연결·재검증 위험을 제품 정책과 감사 UI에 노출해야 한다. 자동 감지 지연까지 실패하면 C의 수동 감지만 남으며 자동 경로 요구를 충족하지 못한다.

### 주요 위험

- 개인 Discord 봇의 Production/RSO 승인 불확실성
- 공식 SLA가 없는 Spectator/Match 상태 전환과 5분 목표
- 폴링 규모가 method/service 한도 또는 장애 backoff와 충돌할 가능성
- 관리자 승인 시 제3자 계정 오연결과 개인정보 침해
- Riot 정책·queue 상수·라우팅·API 버전 변경에 대한 공급자 종속

### 결정을 뒤집을 조건

- Riot이 이 사용 사례의 Production 또는 RSO 승인을 거절하면 A는 제거한다.
- 공식 정책이 현재 게임 감지·참여자 사용을 금지하거나 opt-in을 추가 요구하면 흐름을 재설계한다.
- Spike에서 시작 또는 종료 감지가 5분 목표를 안정적으로 충족하지 못하면 자동 판정 약속을 낮추고 수동 확인 또는 더 긴 지연 정책을 소유자가 결정해야 한다.
- 예상 등록 계정 수에서 승인된 rate limit을 지킬 수 없고 증액도 불가능하면 폴링 범위·빈도 또는 기능 범위를 줄인다.
- 공식 이벤트/승인형 push 경로가 새로 제공되면 폴링보다 우선 비교한다.

## 공식 출처

모든 링크는 2026-07-20에 확인했다.

- [League of Legends 개발자 문서와 정책](https://developer.riotgames.com/docs/lol): 제품 등록·보안·게임 공정성, RSO, PUUID/Riot ID, 라우팅, queue 상수 안내
- [Riot Developer Portal 안내](https://developer.riotgames.com/docs/portal): Development/Personal/Production key 용도·만료·한도, rate limit 유형·429 처리, 버전·폐기 정책
- [Riot Developer FAQ](https://developer.riotgames.com/docs/faqs): RSO 승인 조건, Production 웹사이트·약관·개인정보처리방침·도메인 검증, 신청 검토 시간, key/application 제한
- [공식 API 참조 — SPECTATOR-V5](https://developer.riotgames.com/apis#spectator-v5/GET_getCurrentGameInfoByPuuid): 현재 게임 endpoint, 응답 필드, 참여자 PUUID와 오류 코드
- [공식 API 참조 — MATCH-V5 match IDs](https://developer.riotgames.com/apis#match-v5/GET_getMatchIdsByPUUID): PUUID별 match ID와 queue/time 필터
- [공식 API 참조 — MATCH-V5 match](https://developer.riotgames.com/apis#match-v5/GET_getMatch): match 상세 endpoint
- [공식 API 참조 — LOL-RSO-MATCH-V1](https://developer.riotgames.com/apis#lol-rso-match-v1): 사용자 승인 토큰 기반 League match API 목록
- [공식 League queue 상수](https://static.developer.riotgames.com/docs/lol/queues.json): `420` Ranked Solo와 deprecated queue 식별
- [Riot 일반 개발자 정책](https://developer.riotgames.com/policies/general): 제품 등록·감사, 지원 서비스, 게임 공정성·익명성, API key 보안
- [Riot API Terms](https://developer.riotgames.com/terms): key·application 조건, API 접근의 취소 가능성, 개인정보/GDPR 삭제 요청 전달

## 가정과 미해결 사항

- 서비스 대상은 우선 한국 플랫폼의 단일 소규모 Discord 서버라고 가정했다. 등록 계정 수와 동시 게임 수는 미확정이다.
- Riot 계정과 Discord 사용자의 연결 동의 UI, 서비스 약관, 개인정보처리방침은 아직 존재하지 않는다고 가정했다.
- Production/RSO 승인 가능성, 실제 method/service rate limit, API 데이터 지연, RSO scope·토큰 수명주기, 삭제 요청 처리 세부사항은 미확인이다.
- Discord Go Live 관측 가능성은 별도 Discord 플랫폼 조사 대상이며, Riot 데이터만으로 `FUN-010` 전체 판정을 완료할 수 없다.
- 이 문서는 Riot 기술을 최종 선택하거나 ADR을 제안·승인하지 않는다.

## 정확한 다음 프롬프트

```text
AGENTS.md의 필수 문서를 순서대로 읽고 docs/prompts/research.md 절차를 따라
Discord Go Live 상태의 공식 관측 가능성만 조사해.

FUN-010~015, DAT-003, PRI-002~003과 OWN-007~008을 연결하고,
Discord 공식 문서와 공식 정책만 사실 근거로 사용해.
Gateway 이벤트/intent/권한, 스트림 시작·중단·종료 상태, 5분 유예와 2분 허용시간,
재연결·중복·누락·개인정보 제약을 구분해 기록해.
공식 자료로 확인할 수 없는 지연과 상태 전환은 Spike 후보로만 남겨.
실제 봇 생성, 연결, API 호출과 Spike는 수행하지 말고 기술 선택이나 ADR도 작성하지 마.

전용 산출물은 docs/research/technology-options/discord-go-live.md로 제한하고
다른 파일은 수정하지 마.
```
