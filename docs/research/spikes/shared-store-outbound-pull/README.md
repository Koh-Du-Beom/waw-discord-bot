# 공유 저장소 outbound-pull 역할 조회 Spike

- 실행일: 2026-07-20
- 상태: Failed — local DB·worker 처리 확인, Vercel 동기 결과 확인 timeout
- 연결 요구사항: `SEC-005`, `SEC-009`, `INT-002`, `INT-003`, `OWN-028`, `OWN-031`, `OWN-032`, `GAP-INT-03`, `GAP-INT-04`
- 비용 상한: 증분 0원
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

고정 비운영 Vercel preview와 자가 host worker가 공유 관계형 저장소의 versioned request/result를 사용하면 자가 host inbound port 없이 합성 역할 조회를 5초 안에 완료하고, 중복·만료·worker 중단에서 기본 거부할 수 있다.

## 최소 범위와 기준

- 정상 요청 30회가 각각 5초 안에 완료
- 같은 `operation_id` 동시 요청은 request/result가 각각 한 건
- 만료 요청은 처리하지 않고 web은 만료 결과를 수락하지 않음
- worker 중단 중 high-risk 요청은 5초 안에 `unavailable`
- web role은 result 작성·private fixture 조회가 거부되고 worker role은 private fixture 조회가 거부됨
- 실제 Discord·OAuth·운영 domain·사용자 데이터와 자가 host inbound port 없음

하나라도 충족하지 못하면 전체 가설을 실패로 판정한다.

## 임시 환경

- Vercel Hobby의 별도 고정 Preview project
- Vercel Marketplace로 만든 Neon Free Singapore 시험 PostgreSQL
- web·worker 별도 최소 권한 role
- `@neondatabase/serverless` `1.1.0` 시험 dependency

## 결과

### 확인된 동작

- web·worker 별도 role과 table 권한 구성이 완료됐다.
- web role의 local `SELECT`는 약 `252ms`에 완료됐다.
- worker role의 local `SELECT 1`도 약 `252ms`에 완료됐다.
- Vercel이 기록한 request를 local worker가 claim하고 result 한 건을 기록한 사실을 DB count로 확인했다.
- 자가 host inbound port는 열지 않았다.

### 실패

Vercel preview의 handler는 pooled URL과 unpooled URL 모두에서 result를 반환하지 못하고 약 10초 뒤 `FUNCTION_INVOCATION_TIMEOUT`으로 종료됐다. 정상 요청 한 건도 5초 기준을 통과하지 못했으므로 30회 반복, 중복·만료·worker 중단 검증으로 진행하지 않고 전체 가설을 실패로 판정했다.

초기 배포에는 `api/` 함수 위치와 Node request header API 차이로 두 번의 harness 오류가 있었다. 이를 수정하고 Vercel function과 DB region을 `sin1`로 맞춘 뒤에도 최종 timeout이 재현됐다. 첫 local worker 실행은 sandbox의 npm registry DNS 차단으로 시작되지 않았으며, 고정 dependency를 승인된 외부 sandbox 환경에서 설치한 뒤 worker 처리 자체를 확인했다.

실패 지점은 Vercel 함수의 Neon query/result 확인 경로다. local worker가 result를 기록했는데도 Vercel 호출이 끝나지 않은 원인을 driver fetch, Vercel runtime, DB endpoint 또는 연결 설정 중 하나로 더 분리하지 않았다.

## 정리

- Vercel 시험 project와 네 deployment 삭제
- Neon Free 시험 resource와 Marketplace integration 제거
- DB role·table은 resource 삭제와 함께 제거
- local worker 종료
- `/tmp`의 admin env, role password와 connection URL 삭제
- local `.vercel`, `.env.local`과 `node_modules` 삭제
- 실제 credential·사용자 데이터 미사용, 증분 비용 0원

저장소에는 비민감 재현 source, dependency lock과 이 결과만 남긴다.

## 한계

이 Spike는 합성 역할 결과의 request/result 경계만 검증한다. 실제 Discord API, OAuth/session, provider SLA·장기 비용, backup·복구와 제품 architecture를 증명하거나 기술을 선택하지 않는다.

이번 **Vercel preview→Neon Free request/result→자가 host worker** 조합은 5초 동기 역할 조회 후보를 통과하지 못했다. 이 결과는 공유 저장소를 canonical data나 5분 일반 변경용 outbound-pull로 사용하는 범주, 다른 관리형 PostgreSQL, 직접 API 또는 분리 배포 전체를 탈락시키지 않는다. 다만 고위험 현재 역할 조회를 공유 DB polling으로 단순하게 해결할 수 있다는 근거는 남지 않았다.
