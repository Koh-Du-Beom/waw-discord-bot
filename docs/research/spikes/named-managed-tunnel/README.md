# Named managed tunnel 경계 Spike

- 실행일: 2026-07-20
- 상태: Failed — local named endpoint 통과, Vercel 동기 호출 timeout
- 연결 요구사항: `SEC-007`~`SEC-009`, `INT-002`, `INT-003`, `OWN-028`, `OWN-030`~`OWN-032`, `GAP-INT-02`, `GAP-INT-04`
- 비용 상한: 증분 0원
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

고정 비운영 Vercel preview가 gateway Basic Auth와 application HMAC으로 보호된 계정 고정 ngrok development endpoint를 통해 자가 host의 최소 역할 조회 경계를 5초 안에 호출하고, 인증 오류·replay·credential 교체·timeout에서 기본 거부할 수 있다.

## 최소 범위와 합성 데이터

- 기존 `boundary-roundtrip-default-deny/server.mjs`의 localhost HMAC verifier 재사용
- ngrok Free 계정의 assigned development domain과 outbound agent
- 별도 Vercel preview project
- `test-guild`, `test-operator`, `operator` role 합성 fixture
- 실제 Discord, OAuth, DB, session, 운영 domain과 사용자 데이터 없음

## 성공·실패 기준

- 정상 요청 30회가 각각 5초 안에 완료
- Basic Auth 없음·오류는 gateway에서 `401`이고 origin에 도달하지 않음
- HMAC secret·environment·audience·timestamp·replay 오류 거부
- credential 교체 뒤 폐기 key 거부
- tunnel 중단 중 mutation·고위험 요청 기본 거부
- raw inbound port와 비밀 로그 없음

하나라도 충족하지 못하면 전체 가설을 실패로 판정한다.

## 임시 환경·credential·정리

- `/tmp`의 ngrok agent·authtoken, Basic Auth password와 HMAC secret
- Vercel preview에는 target URL, Basic Auth password와 HMAC secret만 저장
- 실행 뒤 Vercel project/deployment, ngrok endpoint, agent·server, `/tmp` secret·binary와 local metadata 삭제
- 총 요청 100회 미만, 증분 비용 0원

## 결과

### 확인된 동작

- ngrok agent `3.39.9`가 계정에 할당된 development domain을 localhost origin에 연결했다.
- Basic Auth가 없거나 유효해도 HMAC이 없는 요청은 각각 HTTP `401`로 거부됐다.
- local client의 유효한 Basic Auth+HMAC 요청은 HTTP `200`, 약 `463ms`에 완료됐다.
- ngrok agent log에서 Vercel 측 연결이 tunnel에 도달한 사실을 확인했다.
- 자가 host raw inbound port는 열지 않았다.

### 실패

보호된 Vercel preview의 첫 유효 요청은 약 10초 뒤 `FUNCTION_INVOCATION_TIMEOUT`으로 종료됐다. 정상 요청 한 건도 5초 기준을 통과하지 못했으므로 30회 반복, replay·credential 교체와 tunnel 중단 검증으로 진행하지 않고 전체 가설을 실패로 판정했다.

같은 named endpoint와 credential로 local 왕복은 463ms에 성공했으므로 origin server, gateway Basic Auth와 application HMAC 자체는 동작했다. 실패 지점은 Vercel function에서 ngrok named endpoint를 거쳐 결과를 반환하는 경로이며, Vercel egress·runtime fetch와 ngrok의 server-to-server 경로 중 어디인지는 더 분리하지 않았다.

최초 격리 project 배포가 production target으로 분류되어 사용하지 않았고, 명시적인 preview target을 다시 배포해 최종 판정을 수행했다. 두 배포는 모두 운영 project·domain과 무관하며 정리 시 project와 함께 삭제했다.

## 정리

- Vercel 시험 project와 두 deployment 삭제
- ngrok agent와 localhost server 종료
- `/tmp` authtoken, Basic Auth·HMAC secret, policy, endpoint, zip과 agent binary 삭제
- local `.vercel`과 `.env.local` 삭제
- 실제 credential·사용자 데이터 미사용, 증분 비용 0원

ngrok Free 계정에 자동 할당된 development domain은 계정 속성으로 남지만 endpoint는 offline이고 local authtoken은 삭제됐다.

## 한계

ngrok, Basic Auth와 HMAC은 시험 fixture다. 이 Spike는 실제 Discord 역할 조회, 장기 endpoint 가용성, SLA·운영 비용, Windows 복구 또는 기술 선택을 증명하지 않는다.

이번 **Vercel preview→계정 고정 ngrok endpoint→자가 host** 조합은 5초 동기 역할 조회 후보를 통과하지 못했다. 이 결과 하나만으로 모든 managed tunnel이나 분리 배포를 불가능하다고 일반화할 수는 없다. 다만 익명 tunnel, 공유 PostgreSQL request/result와 named managed tunnel까지 서로 다른 세 경로가 동일한 Vercel function timeout으로 실패했으므로 공급자만 바꾸는 추가 network Spike의 결정 정보는 낮다.
