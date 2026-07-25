# External services inventory (2026-07-25)

이 문서는 저장소 계약, 완료된 production inventory와 실제 AWS read-back을 기준으로 외부 서비스의 현재 상태와 배포 후 정리 경계를 구분한다. 비밀값, 계정 이메일, bucket 이름, public IP는 기록하지 않는다.

## 현재 유지되는 production 서비스

| 공급자/서비스 | 현재 역할 | 배포 후 상태 |
| --- | --- | --- |
| AWS Lightsail (서울) | `waw-production-backup-host` 1GB Ubuntu instance. 현재 backup, monitoring과 application 배포 대상 host | 유지. web, bot, Caddy도 이 host의 systemd unit으로 합류 |
| AWS S3 | Supabase PostgreSQL의 24시간 logical export를 client-side `age` 암호화해 `backups/` prefix에 보관 | 유지. 30일 lifecycle과 Put-only writer 유지 |
| AWS IAM | backup 전용 writer와 production 운영자 권한 경계 | backup writer 유지. `waw-production-operator`는 exact Lightsail instance read/temporary SSH-session 권한만 가지며 MFA가 필수 |
| AWS Lightsail alarm + email notification | `StatusCheckFailed`, 5분 주기, 2/2 평가와 recovery email | 유지 |
| Supabase Free PostgreSQL | 첫 MVP canonical production storage. migration `0001`, `0002` 적용 완료 | 유지. application persistence adapter와 `0003`은 별도 production gate |
| Discord webhook | 별도 운영 channel로 비밀값 없는 monitoring event 전송 | 유지 |
| DNS provider / `waw.dubeom.com` | canonical production hostname | hostname은 유지. 실제 DNS 변경과 public ACME/TLS는 G6 승인 전 미실행 |

## 선택됐지만 아직 production에서 활성화되지 않은 외부 경계

| 서비스 | 상태 |
| --- | --- |
| Discord OAuth | `identify`, bot-side current-member 확인, opaque session 경계가 Accepted. 실제 client secret, redirect와 production OAuth 호출은 G2/G6 대기 |
| Discord Gateway / bot token | runtime 계약은 구현됐지만 실제 production bot token, Gateway lease/Resume와 member lookup은 G3 대기 |
| Caddy ACME | Caddy가 ingress로 Accepted됐지만 public certificate와 DNS 연동은 G6 대기. Caddy 자체는 외부 SaaS가 아니라 host process |
| Riot / RSO | 조사 항목일 뿐 production credential, API 또는 계정 연결 없음 |
| 요약 AI API | OpenAI, Anthropic, Gemini를 조사했지만 공급자 선택·credential·production 호출 없음 |
| KBO data provider | licensed provider가 정해지지 않아 연기. production 연동 없음 |

## 배포 과정에서만 존재하고 제거되는 항목

- release archive와 CloudShell upload/staging 파일은 설치·검증 뒤 삭제한다.
- temporary browser SSH session과 instance access detail은 만료시키며 장기 access key를 만들지 않는다.
- 새 credential version은 health 확인 뒤 current가 되고, 이전 runtime credential version은 폐기한다. root-owned source와 backup writer credential은 필요한 최소 production 자산으로 남는다.
- failed release는 rollback에 필요한 직전 release만 보존하고 임시 worktree, extracted staging directory와 불완전 release는 제거한다.
- G5/G7 전환이 끝나면 `waw-spike-operator`의 임시 spike/CloudShell 권한과 더 이상 필요 없는 access key를 제거한다. 현재 운영자 전환 검증 전이므로 아직 삭제하지 않는다.
- root CloudShell은 bootstrap/read-only 확인용 임시 운영 표면이다. 일상 운영은 MFA가 적용된 `waw-production-operator`로 전환하며 root 세션은 종료한다.

## 이미 제거됐거나 production에서 사용하지 않는 서비스

- Vercel project/deployment와 anonymous SSH reverse tunnel: 세 차례 timeout Spike 뒤 전부 제거.
- Neon disposable database/integration/role/credential: Spike 뒤 제거.
- ngrok endpoint/agent: Spike 뒤 제거.
- disposable Supabase project `waw-storage-spike-20260721`: 삭제 완료. production Supabase project와 별개.
- AWS disposable Lightsail instances, key pairs, static IPs, disks, snapshots와 disposable S3 buckets/objects/readers/policies: 각 Spike에서 최종 잔존 수 `0` 확인.
- `AWSCloudShellFullAccess`, application-integration Spike policy와 disposable IAM users/keys: 해당 작업 종료 때 제거. recurring backup writer와 이번 production operator는 예외.
- Docker/PostgreSQL test containers/images, local CA, temporary archives/dumps/keys: Spike 종료 때 제거. production runtime은 Docker가 아니라 systemd 직접 실행.
- Akamai, DigitalOcean, Cloudflare R2, Lightsail load balancer, Nginx/Certbot, AWS Parameter Store/Secrets Manager, CloudWatch Agent: 비교 또는 대안일 뿐 현재 production에서 사용하지 않음.
- Windows는 recovery/cost fallback이며 현재 production service가 아니다. Mac은 운영 후보에서 제외됐다.

## 2026-07-25 IAM read-back

- AWS account root의 read-only inventory로 exact instance ARN과 `running` 상태를 확인했다.
- `waw-production-operator` IAM user를 생성했다.
- `wawProductionOperatorExactInstancePolicy` 인라인 정책을 연결했다.
- 첫 operator console 검증에서 Lightsail UI가 bootstrap에 요구하는
  `lightsail:GetRegions` 누락을 확인했다. Owner 승인 뒤 서울·MFA 조건의
  fixed read allowlist에 이 action을 추가했다. 후속 console read-back에서
  UI가 instance 상세 URL도 목록으로 redirect하고 `lightsail:GetInstances`를
  요구함을 확인해 같은 조건으로 이 read action도 추가한다. Fresh MFA session의
  network read-back에서 목록 전에 서울 `lightsail:GetOperations`도 호출함을
  확인해 해당 read action을 추가한다. 다음 UI error read-back에서 화면 렌더링에
  필요한 `GetBundles`, `GetBlueprints`, `GetStaticIps`도 확인해 같은 조건의
  fixed read allowlist에 추가한다. Instance detail error read-back에서 공통
  inventory에 필요한 `GetDisks`, `GetAlarms`, `GetKeyPairs`,
  `GetInstanceSnapshots`, `GetLoadBalancers`도 확인해 같은 조건으로 추가한다.
  Exact instance의 temporary access detail 제한과 서울 외 Lightsail explicit
  deny는 유지한다.
- access key 목록은 비어 있다. console password와 MFA는 아직 설정하지 않았다.
