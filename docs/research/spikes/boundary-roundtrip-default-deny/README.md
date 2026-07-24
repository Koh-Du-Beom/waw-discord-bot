# 경계 왕복·기본 거부 Spike

- 실행일: 2026-07-20
- 상태: Failed — 로컬 계약 통과, 실제 Vercel→자가 host 왕복 실패
- 연결 요구사항: `SEC-007`~`SEC-009`, `INT-002`, `INT-003`, `OWN-028`, `OWN-030`, `OWN-032`
- 비용: 증분 0원
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

고정된 비운영 Vercel preview가 raw 공유기 inbound port를 열지 않고 자가 host의 최소 역할 조회 경계에 안전하게 요청하며, 정상 요청·credential 교체·timeout·replay 상황에서 기본 거부 계약을 지킬 수 있다.

## 환경과 최소 구성

- local runtime: macOS, Node.js `v24.18.0`
- web 경계: 별도 임시 Vercel project의 보호된 Preview deployment
- host 경계: `127.0.0.1:43127`에만 bind한 Node 표준 library HTTP server
- 연결: `ssh -R` 기반의 익명·임시 outbound-only TLS tunnel
- 인증 fixture: 실행 중 생성한 256-bit HMAC 시험 secret, timestamp, nonce, environment, audience와 body hash
- 데이터: `test-guild`, `test-operator`, `operator` role만 포함한 합성 fixture

실제 Discord, OAuth, bot token, user token, DB, session store, 운영 domain과 사용자 데이터는 사용하지 않았다. HMAC과 임시 tunnel은 시험 fixture이며 프로젝트 기술 선택이 아니다.

## 성공·실패 기준

성공하려면 다음을 모두 만족해야 했다.

- 정상 요청 30회가 각각 5초 안에 완료
- 잘못된 secret·environment·audience, 만료와 replay 요청을 모두 거부
- credential 교체 뒤 폐기 key 거부
- 299초 cache는 read-only만 허용하고 301초 cache는 `unavailable`
- timeout 중 mutation·고위험 작업 거부
- raw inbound port와 비밀 로그 없음

하나라도 충족하지 못하면 전체 가설을 실패로 판정했다.

## 실행과 증거

### 로컬 계약

```text
node docs/research/spikes/boundary-roundtrip-default-deny/server.mjs
{"outcome":"pass","valid_requests":30,"checks":13}
```

검증한 항목은 정상 서명 30회, 잘못된 secret·environment·audience, 31초 만료, nonce replay, current/next key 전환과 current 폐기, 299초/301초 cache, mutation·고위험 기본 거부, secret 비로그다.

### 실제 외부 왕복

1. localhost 전용 server와 outbound-only 임시 tunnel을 시작했다.
2. tunnel endpoint의 unsigned 직접 요청은 HTTP `401`을 약 `1.145초`에 반환해 외부 endpoint와 local verifier의 연결을 확인했다.
3. 별도 Vercel project에 fixed preview 전용 handler와 시험 credential을 배포했다.
4. Vercel Preview Protection을 유지하고 `vercel curl`의 임시 bypass로 호출했다.
5. Vercel function은 tunnel의 역할 조회 응답을 받지 못하고 약 10초 뒤 `FUNCTION_INVOCATION_TIMEOUT`으로 종료됐다.

초기 실행에서 Vercel CLI의 root entrypoint 자동 감지와 handler API 차이로 두 번의 harness 오류가 있었다. `.vercelignore`와 Web `Response` 반환으로 수정한 최종 deployment에서도 동일한 외부 호출은 function timeout으로 끝났으므로 최종 실패 판정은 harness 오류가 아니라 실제 왕복 결과에 근거한다.

## 결론과 한계

로컬 request 인증과 `OWN-028`·`OWN-032`의 cache/default-deny 정책은 최소 harness에서 재현됐다. 그러나 이번 익명 `ssh -R` tunnel 조합은 Vercel→자가 host 5초 왕복 기준을 충족하지 못했으므로 가설 전체는 실패다.

이 결과만으로 모든 outbound tunnel, 직접 API 또는 Vercel 분리 배포가 불가능하다고 일반화할 수 없다. 실패 지점이 Vercel egress, 임시 tunnel 공급자의 server-to-server 경로, 지역 또는 연결 정책 중 어디인지는 분리하지 못했다. 따라서 이 tunnel 조합을 운영 후보로 승격할 근거는 없지만 다른 통신 기술을 자동 선택할 근거도 없다.

## 정리

- 임시 Vercel project와 세 deployment 삭제
- preview protection bypass와 deployment 함께 제거
- SSH tunnel과 localhost server 종료
- `/tmp` 시험 secret 삭제
- `.vercel` project metadata 삭제
- 운영 credential과 실제 사용자 데이터 미사용

저장소에는 재현 가능한 비민감 Spike source와 이 보고서만 남긴다.

## 결정 영향

- 익명 임시 tunnel을 사용한 Vercel→자가 host 직접 역할 조회는 현재 후보 증거를 통과하지 못했다.
- D-05·D-08 기술은 선택하지 않는다.
- 다음 단계에서는 이 결과가 직접 API 범주 전체를 탈락시키는지, named managed tunnel의 별도 증거가 필요한지, 또는 outbound-pull/shared-store 경계를 먼저 검증할지 제안해야 한다.

## 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고
docs/research/spikes/boundary-roundtrip-default-deny/README.md 결과를
D-05·D-07·D-08 통합 검토에 대조해.

이 실패가 탈락시키는 범위, 아직 남는 가장 단순한 대안과 추가 Spike가
정말 필요한지만 제안해. 아직 기술을 선택하거나 ADR, 새 Spike 작성·실행,
구현 계획 또는 제품 코드를 작성하지 마. KBO는 연기 상태로 유지해.
```
