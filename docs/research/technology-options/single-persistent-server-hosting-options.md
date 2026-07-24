# D-09 단일 지속 server 호스팅 후보 조사

- 상태: Research — host·OS·runtime 선택 또는 Spike 승인 아님
- 조사일·문서 확인일: 2026-07-21
- 결정 질문: 첫 MVP의 web·bot 단일 지속 server에 현실적인 저가 외부 임대 VM 공급자·1GB급 plan 후보는 무엇인가?
- 범위 밖: host·OS·언어·runtime·SDK·저장소·인증 기술 선택, 소유자 질문, ADR, Spike 실행, 구현 계획과 제품 코드

## 1. 입력과 통과 기준

이 조사는 D-04와 D-08, `OWN-005`, `OWN-016`~`OWN-021`, `OWN-034`~`OWN-038`을 입력으로 사용한다. web과 bot은 하나의 지속 server 배포 경계에 두지만 같은 process인지는 결정하지 않는다.

| 요구사항·결정 | D-09 통과 기준 |
|---|---|
| `OPS-001` | 24시간 Gateway 연결, process 재시작, 재부팅 후 자동 시작과 health 확인이 가능하다. |
| `OPS-002` | 배포·재시작 중 bot과 schedule owner가 둘 이상 활성화되지 않게 검증할 수 있다. |
| `OPS-003`, `OPS-004` | 민감정보 없는 상태·실패·version을 관측하고 로그 접근·보존을 통제할 수 있다. |
| `OPS-005`~`OPS-007` | 운영 장비와 분리된 암호화 backup으로 RPO 24시간, RTO 8시간을 검증할 수 있다. |
| `OPS-008` | 이전 application artifact와 호환 data로 되돌릴 수 있다. |
| `DEP-001`, `DEP-002` | `waw.dubeom.com` HTTPS와 운영·고정 preview credential 분리가 가능하다. |
| `SEC-007`~`SEC-010` | bot token·session·backup credential의 접근 주체를 최소화하고 OS·runtime 보안 갱신이 가능하다. |
| `OWN-005`, `OWN-017` | GPT API, domain과 필수 외부 backup을 포함한 신규 월 지출 30,000원 이하다. 기존 장비 구매비와 통상 전기료는 제외한다. |
| `OWN-018`, `OWN-019` | 소유자는 자가 host 장애에 8시간 안에 대응할 수 있으나, 복구 완료는 bot·web·data 무결성이 모두 확인된 때다. |
| `OWN-034`, `OWN-035` | public web→bot 경계는 만들지 않고 TypeScript·Python 모두 실행 가능한 후보를 유지한다. |

## 2. 공통 사실과 배제 기준

### 확인된 사실

- Node.js와 CPython은 Windows, macOS와 Linux를 지원하므로 세 host 범주 모두 D-04 공동 후보를 실행할 수 있다. 실제 memory와 장기 안정성은 host 사양에서 측정해야 한다.
- 같은 server는 같은 process를 뜻하지 않는다. web 침해가 bot token으로 번지지 않도록 local process 또는 동등한 OS 권한 경계를 후속 설계에서 비교해야 한다.
- VM snapshot이나 노트북 내부 copy는 원본과 같은 provider/account 또는 물리 장비 장애에 묶인다. 정책의 “운영 데이터와 분리된 backup”을 단독으로 충족한다고 간주하지 않는다.
- 어떤 host도 Discord bot singleton을 자동 보장하지 않는다. service manager의 restart와 배포 전후 exclusive ownership 검증이 모두 필요하다.

### 배제 기준

1. sleep·hibernate 또는 provider lifecycle 때문에 사전 경고 없이 지속 process가 멈추는 조건을 통제하거나 감지할 수 없다.
2. 재부팅 뒤 web·bot이 사람의 GUI 로그인 없이 자동 시작하지 않는다.
3. `waw.dubeom.com`의 HTTPS ingress를 열면서 관리 port·bot token·database를 함께 공개해야 한다.
4. 24시간 이내 외부 backup과 빈 대체 환경의 8시간 복구 경로를 만들 수 없다.
5. 고정비만으로 월 30,000원을 소진해 GPT·domain·backup 여유를 남기지 않는다.

## 3. 현실적인 후보

### A. 외부 임대 Linux VM

구체적인 가격 기준선으로 서울 리전이 있는 Amazon Lightsail과 저가 VM 시장을 사용한다. 공급자는 아직 선택하지 않는다.

- **비용:** Lightsail Linux/Unix public IPv4 bundle은 월 $5에 0.5GB RAM·20GB SSD·1TB transfer, 월 $7에 1GB RAM·40GB SSD·2TB transfer를 제공하고 서울 리전을 열거한다. IPv6-only는 $3.50부터지만 일반 사용자 ingress와 운영 단순성을 별도 확인해야 한다. [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/), [instance bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- **상시성:** data center의 전원·회선과 public address를 사용하므로 가정의 절전·공유기·ISP 장애를 제거한다. 단일 VM·단일 region 장애는 그대로 남고, provider가 application process를 올바르게 재시작하거나 singleton으로 만들지는 않는다.
- **운영:** Linux service manager와 보안 update를 사용할 수 있다. Ubuntu Server는 기본적으로 `unattended-upgrades`를 통해 보안 update를 매일 적용하지만 reboot는 기본 자동이 아니며 maintenance 정책이 필요하다. [Ubuntu automatic updates](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)
- **보안:** public web port만 allowlist하고 관리 접속·credential을 별도 통제할 수 있다. 동시에 OS patch, SSH, firewall, TLS와 application update는 소유자 책임이다.
- **복구:** Lightsail Linux instance는 유료 daily automatic snapshot과 최근 7개 보존을 제공하고 snapshot storage는 $0.05/GB-month다. 같은 AWS account snapshot은 빠른 복구 보조 수단일 뿐 독립 외부 backup을 대신하지 않는다. [Lightsail snapshots](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html)
- **runtime:** TypeScript/Node와 Python 모두 직접 설치·고정할 수 있다. 0.5GB 또는 1GB가 bot+web+저장소에 충분한지는 측정 전 사실로 두지 않는다.
- **종속·rollback:** provider image, firewall, snapshot API에 일부 종속되지만 standard Linux artifact와 독립 data export를 유지하면 다른 VM으로 이동할 수 있다. rollback은 이전 artifact 재기동과 data compatibility가 필요하며 snapshot 전체 복원만 기본 rollback으로 삼지 않는다.

#### A-1. 공급자·plan shortlist

2026-07-21 공식 가격표에서 한국 또는 인접 region, 전용 public IPv4, 1GB급 shared VM과 월 30,000원 안의 여유를 동시에 확인할 수 있는 세 후보만 남겼다. 아래 순서는 선택 순위가 아니다. 환율·해외 결제 수수료·세금은 결제 시점에 달라지므로 USD 고정비와 보수적 환산 기준 `USD 1 = KRW 1,500`을 함께 표시한다.

| 후보 | 인접 region·1GB급 기준선 | 고정 public ingress | 같은 공급자 복구 보조 | 관측·network 통제 | 표준 이전 경로 |
|---|---|---|---|---|---|
| Amazon Lightsail | 서울, Linux public IPv4 `Micro-1GB`: 2 vCPU·1GB·40GB SSD·2TB, 월 USD 7 | instance에 붙인 static IPv4는 무료이며 다른 instance로 재연결 가능 | 자동 snapshot은 매일, 최근 7개, 실제 저장량 GB당 월 USD 0.05 | 5분 단위 metric alarm과 instance firewall; IPv4·IPv6 rule은 별도 관리 | manual snapshot은 EC2로 내보낼 수 있으나 다른 공급자로 직접 export하는 경로는 아님 |
| Akamai Cloud (Linode) | 도쿄 core region, Shared CPU 시작 plan: 1 vCPU·1GB·25GB SSD·1TB, 월 USD 5 | dedicated IPv4·IPv6 포함; region 이동 시 주소 변경 | daily·weekly·biweekly와 manual 1개를 보존하는 Backups add-on이 1GB plan에서 월 USD 2 | 무료 Cloud Firewall, 기본 metric과 무료 Longview 10 client·5분 해상도·12시간 이력 | 표준 file/data export와 재현 가능한 server manifest 필요; 공급자 내부 region migration은 가능하지만 IP 변경 |
| DigitalOcean | 싱가포르 `SGP1`, Basic Regular: 1 vCPU·1GiB·25GiB SSD·1,000GiB, 월 USD 6 | Droplet에 public IPv4 포함 | weekly 월 USD 1.20 또는 daily 월 USD 1.80; snapshot은 GB당 월 USD 0.06 | 무료 Cloud Firewall·기본 host monitoring을 제공하나 application health·감사 보존은 별도 | 표준 file/data export와 재현 가능한 server manifest 필요; snapshot을 공급자 밖 backup으로 간주하지 않음 |

공식 근거: [Lightsail bundle·region](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html), [Lightsail static IP](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html), [Lightsail snapshot 가격·보존](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html), [Lightsail alarm](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-alarms.html), [Akamai Shared CPU](https://techdocs.akamai.com/cloud-computing/docs/shared-cpu-compute-instances), [Akamai region 기능](https://techdocs.akamai.com/cloud-computing/docs/how-to-choose-a-data-center), [Akamai backup](https://techdocs.akamai.com/cloud-computing/docs/backup-service), [Akamai instance·관측](https://techdocs.akamai.com/cloud-computing/docs/compute-instance), [DigitalOcean Droplet 가격](https://www.digitalocean.com/pricing/droplets), [DigitalOcean region](https://docs.digitalocean.com/platform/regional-availability/), [DigitalOcean backup 가격](https://docs.digitalocean.com/products/backups/details/pricing/), [DigitalOcean snapshot 가격](https://docs.digitalocean.com/products/snapshots/details/pricing/)

#### A-2. 비용 경계

| 후보 | VM + 공급자 native backup 기준 | KRW 1,500/USD 환산 | 월 30,000원에서 남는 범위 |
|---|---:|---:|---:|
| Lightsail 서울 | USD 7 + snapshot 실제 저장량 | 최소 약 10,500원 + snapshot | 최대 약 19,500원에서 snapshot·독립 backup·domain·GPT 차감 |
| Akamai 도쿄 | USD 5 + USD 2 | 약 10,500원 | 약 19,500원에서 독립 backup·domain·GPT 차감 |
| DigitalOcean 싱가포르 | USD 6 + daily USD 1.80 | 약 11,700원 | 약 18,300원에서 독립 backup·domain·GPT 차감 |

- 세 후보 모두 VM과 native backup만 보면 예산을 통과한다. 하지만 `GAP-D09-06`은 GPT 실제 사용료, domain 연환산, 세금·환전과 독립 backup을 더하기 전에는 닫히지 않는다.
- provider snapshot/backup은 같은 account 또는 같은 provider 장애·계정 잠금에 묶이므로 `OPS-005`의 독립 backup이 아니다. 공급자 밖 encrypted application data export가 별도로 필요하다.
- 독립 object storage의 비용 민감도 기준으로 Backblaze B2는 첫 10GB 저장을 무료로 두고 그 이후 USD 0.00695/GB-month를 명시한다. 이는 비용 상한 확인용 현실 후보일 뿐 backup 공급자 선택이 아니다. [Backblaze B2 transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing)
- 1GB에서 TypeScript/Node 또는 Python bot, 최소 web과 후보 store가 함께 안정적으로 동작한다는 증거는 아직 없다. plan 가격이 싸다는 이유로 `GAP-D09-03`을 통과 처리하지 않는다.

#### A-3. 공통 운영·보안·호환성

- 세 후보는 일반 Linux VM이므로 Node.js와 CPython을 설치할 수 있고 outbound Discord Gateway와 inbound `443`을 동시에 운영할 수 있다. 이는 특정 OS image·runtime·SDK 선택이 아니다.
- HTTPS는 VM 상품이 자동 완성하는 기능이 아니다. 고정 public IP, `waw.dubeom.com` DNS, host firewall과 VM 안의 TLS 종료가 결합되어야 하며 구체 ingress software는 후속 결정으로 남긴다.
- 공급자는 hypervisor·network 기능을 제공하지만 guest OS, runtime, dependency, SSH key, application health와 재부팅 정책은 소유자 책임이다. 보안 update 자동화와 reboot window는 특정 Linux image를 좁힌 뒤 검증한다.
- provider metric만으로 Discord Gateway 연결, bot singleton, OAuth 실패, backup freshness와 restore 성공을 알 수 없다. 민감정보 없는 application heartbeat와 외부 HTTPS health 확인이 추가로 필요하다.
- 공급자 image·snapshot을 주 배포물로 삼지 않고 application artifact, environment manifest, schema migration과 portable data export를 유지해야 다른 VM이나 보유 장비로 8시간 안에 이전할 가능성이 생긴다.

### B. 보유 Mac

- **비용:** 기존 장비 구매비와 통상 전기료가 예산에서 제외되어 host 직접비는 0원으로 계산한다. domain·외부 backup·GPT 비용은 그대로 남는다.
- **상시성:** macOS는 전원 연결 중 display가 꺼져도 자동 sleep을 막고 network access wake를 설정할 수 있다. power failure 뒤 자동 startup도 지원하지만 모델과 OS에 따라 option이 다르다. [Mac sleep settings](https://support.apple.com/guide/mac-help/mchle41a6ccd/mac), [restart after power failure](https://support.apple.com/guide/terminal/restart-computers-apd7d247a89-3560-4c3b-a471-3e66ff607040/mac)
- **운영:** 보유 장비라 물리 접근과 짧은 정전의 battery 완충 효과가 있다. 반대로 노후 battery·adapter, lid/sleep 설정, OS update, 사용자 작업과 server workload가 한 장비에 결합될 수 있다. 실제 모델·배터리 상태·전용 사용 여부는 미확인이다.
- **보안:** 가정망에서 public HTTPS를 제공하려면 public IP·NAT·CGNAT·dynamic DNS 또는 outbound tunnel 중 실제 가능한 ingress가 필요하다. D-08 Spike의 Vercel→tunnel 실패는 이 브라우저→단일 server 경로를 직접 검증하지 않았으므로 성공·실패 근거로 재사용하지 않는다.
- **복구:** 내부 disk·Time Machine만으로는 물리 도난·고장과 분리되지 않는다. 허용된 영구 data의 암호화 외부 backup과 Windows 대체 host 복원이 필요하다.
- **runtime:** Node와 Python을 지원한다. macOS-specific service·filesystem 경로에 묶이면 Windows 복구가 어려워지므로 artifact, environment manifest와 data export는 OS 중립적으로 유지해야 한다.
- **rollback·종속:** provider 종속은 낮지만 특정 Mac 모델, local account와 가정망에 대한 운영 종속이 크다. OS rollback보다 application artifact rollback을 기본 단위로 검증해야 한다.

### C. 보유 Windows 노트북

- **비용:** 보유 장비이므로 같은 예산 규칙에서 host 직접비는 0원이다. Windows edition/license 상태와 장비 교체비는 현재 범위에서 확인하지 않았다.
- **상시성:** Windows 노트북은 기본적으로 lid close나 idle에서 sleep할 수 있으므로 전원 연결·lid·sleep 정책을 명시해야 한다. Windows Update는 비사용 시간에 restart를 시도할 수 있다. [Windows power states](https://support.microsoft.com/windows/shut-down-sleep-or-hibernate-your-pc-2941d165-7d0a-a5e8-c5ad-8c972e8e6eff), [Windows Update FAQ](https://support.microsoft.com/windows/deployment/updates-lifecycle/windows-update-faq)
- **운영:** Windows Service Control Manager는 service recovery action을 제공하지만 Node/Python application을 어떤 service 형태로 등록할지는 별도 runtime/process 결정이다. Task Scheduler는 startup trigger가 가능해도 process health supervisor와 동일하다고 가정하지 않는다. [Windows service guidelines](https://learn.microsoft.com/en-us/windows/win32/rstmgr/guidelines-for-services), [Task Scheduler troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/troubleshoot-scheduled-tasks-not-running)
- **보안·ingress:** Mac과 같은 가정망 경계가 있으며 Windows firewall, 원격 관리와 public HTTPS exposure를 함께 검증해야 한다. desktop 사용자 account와 service credential을 분리하지 못하면 bot token blast radius가 커진다.
- **복구:** `OWN-018`의 대체 장비 역할을 실제 primary host로 바꾸면 별도의 두 번째 복구 환경이 다시 필요하다. 같은 노트북 disk의 image나 restore point는 독립 backup이 아니다.
- **runtime:** Node와 Python 모두 지원하지만 native module, path, service wrapper와 file permission 차이가 macOS/Linux artifact 이식성을 깨뜨릴 수 있다. Go Live 관측 자체는 OS와 무관하다.
- **rollback·종속:** cloud vendor 종속은 낮다. 반면 Windows service/package/update 동작에 맞춘 배포가 다른 OS로 이동하는 비용을 키울 수 있다.

### 조건부 후보: 무료 cloud VM

Oracle Always Free compute는 만료되지 않는 무료 resource 범주를 제공하지만 idle Always Free instance를 회수할 수 있다고 명시한다. 지속 Gateway를 요구하는 primary host의 상시성을 무료라는 이유만으로 가정할 수 없으므로, 유료 전환 조건과 회수 위험을 받아들인다는 별도 근거 없이는 첫 검증 후보로 올리지 않는다. [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm), [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## 4. 비교

| 기준 | A. 임대 Linux VM | B. 보유 Mac | C. 보유 Windows |
|---|---|---|---|
| 신규 host 직접비 | 월 $5~$7 기준선 + snapshot/backup | 0원 | 0원 |
| GPT·domain·외부 backup 예산 여유 | VM 비용만큼 감소 | 가장 큼 | 가장 큼 |
| 전원·회선 | data center에 위임, 단일 VM 장애 잔존 | 가정 전원·회선·장비 책임 | 가정 전원·회선·장비 책임 |
| public HTTPS ingress | static public address로 가장 직접적 | NAT/CGNAT/dynamic IP/tunnel 미확인 | 동일 |
| 재부팅 후 자동 시작 | Linux service 경로, 검증 필요 | macOS service·power 설정, 모델별 검증 | Windows service·power/update 설정, 장비별 검증 |
| 보안 update | server OS 정책 명시 가능 | macOS update와 restart 운영 필요 | Windows Update와 restart 운영 필요 |
| 단일 bot 실행 | service/deploy ownership 필요 | 동일 | 동일 |
| 외부 backup | 별도 필요; provider snapshot은 보조 | 필수 | 필수 |
| 빈 Windows 복구 | Linux→Windows 이식 시험 필요 | Mac→Windows 이식 시험 필요 | Windows→별도 환경 시험 필요 |
| TypeScript·Python | 둘 다 지원 | 둘 다 지원 | 둘 다 지원 |
| 물리 운영 부담 | provider에 위임 | 소유자 책임 | 소유자 책임 |
| vendor/장비 lock-in | provider API·region | Mac·가정망 | Windows 장비·service 방식 |

### 외부 VM shortlist 비교 요약

| 기준 | Lightsail 서울 | Akamai 도쿄 | DigitalOcean 싱가포르 |
|---|---|---|---|
| 사용자·Discord와의 지역 근접성 | 가장 직접적 | 인접 | 인접이나 세 후보 중 가장 멂 |
| 1GB VM 월 고정비 | USD 7 | USD 5 | USD 6 |
| native backup 예측성 | 사용 GB에 따라 변동 | USD 2 고정 | daily USD 1.80 또는 weekly USD 1.20 |
| static public address | 별도 static IP를 붙이면 무료 | dedicated IPv4 포함 | public IPv4 포함 |
| 기본 관측 | 5분 metric alarm | 기본 metric + 무료 Longview | host metric·alert 기반 |
| 공급자 내부 이동 | snapshot의 EC2 export 가능 | core region 간 migration, IP 변경 | image/snapshot 기반 재생성 |
| 남은 핵심 공백 | snapshot 실청구량·1GB 자원 | Tokyo plan 실재고·1GB 자원 | Singapore plan 실재고·지연·1GB 자원 |

## 5. 보안·데이터·운영 경계

- public ingress는 `443` 중심의 web 경계만 열고 bot Gateway는 outbound 연결을 사용한다. SSH/RDP나 database를 일반 인터넷에 공개해야만 하는 후보는 제외한다.
- host choice와 무관하게 bot token, OAuth/session secret과 backup credential을 같은 일반 사용자 account나 repository에 두지 않는다.
- 자가 SQLite가 후속 선택되더라도 live database file을 임의 복사하지 않고 database가 지원하는 일관된 backup/export 경로를 사용한다.
- heartbeat가 stale이면 dashboard는 마지막 관측 시각과 `stale/unknown` 또는 `unavailable`을 표시한다. host health가 보이지 않는다고 변경을 성공으로 처리하지 않는다.
- 단일 host 배포는 network 경계를 줄이지만 web·bot·data의 공통 장애 영역을 만든다. 외부 backup과 대체 환경 없이는 `OWN-019`를 충족하지 않는다.

## 6. 사실·추론·가정·미확인 사항

### 읽기 전용 자가 host 확인 결과

2026-07-20에 설정 변경, network 공개와 credential 출력 없이 현재 Mac을 확인했다. 정전 후 자동 시작은 사용자가 관리자 읽기 전용 명령으로 확인했으며 실제 공인 IP는 기록하지 않는다.

| 항목 | 결과 | 영향 |
|---|---|---|
| hardware | Apple M5 10-core, RAM 16GB, system disk 약 389GiB 여유 | 후속 runtime 측정을 진행할 자원은 있음 |
| battery·전원 | AC 연결, cycle 34, condition Normal, maximum capacity 100% | 짧은 정전 완충 가능 |
| 무인 전원 복귀 | 이 Mac에서 `Restart After Power Failure` 미지원 | 완전 방전 뒤 물리 개입 필요 |
| 현재 sleep | AC power에서도 automatic sleep 활성 | 그대로는 지속 host 부적합; 변경은 실행하지 않음 |
| OS | macOS 26.1, 확인 당시 최신 보안 release 26.5.2보다 이전 | 운영 전 보안 update 필요; 실행하지 않음. [Apple security releases](https://support.apple.com/en-us/100100) |
| disk 암호화 | FileVault 활성 | 통과 |
| firewall | application firewall 비활성 | 그대로는 public host 부적합; 변경은 실행하지 않음 |
| outbound | Discord HTTPS 200 응답 | outbound 기본 경로 통과 |
| ingress 회선 | 교육장 소유 공인 회선이며 운영 허가 없음 | 서면 승인 전 운영 경로에서 제외; 주소는 비기록 |
| Windows fallback | LG Gram 16, 상시 전원 연결 가능 | Mac 실패 시 추가 확인하며 지금은 상세 조사 생략 |

이 결과는 Mac hardware 자체를 탈락시키지 않지만 현재 위치의 승인되지 않은 회선과 무인 전원 복귀 제약 때문에 첫 운영 host로 검증하는 이점을 없앤다. 사용자는 비용 없는 자가 host 우선 결정을 철회하고 저가 임대 VM 범주를 우선하기로 했다.

### 추론

- **A는 갱신된 첫 검증 범주**다. 최소 월 비용이 생기지만 static public ingress와 data-center 전원·회선으로 확인된 자가 host 제약을 제거한다. 이는 Lightsail·Linux 또는 VM 공급자 선택이 아니다.
- **B는 가장 강한 fallback**이다. hardware는 충분하지만 교육장 회선 승인, sleep·firewall·OS update와 완전 방전 뒤 물리 복구가 필요하다.
- **C는 복구 대체 환경으로 우선 가치가 있다.** primary로도 가능하지만 B와 같은 가정망 위험에 Windows service·update 검증이 더해지므로 현재 증거로 B보다 단순하다고 볼 수 없다.

### 가정

- 첫 MVP는 단일 guild·소수 사용자·월 명령 10,000회 상한이며 horizontal scaling이 필요 없다.
- 임대 VM은 Linux 범주로 비교한다. Windows VM은 같은 자원에서 license 비용과 운영면이 늘고 현재 요구가 Windows Server를 필요로 하지 않아 제외한다.
- 기존 Mac과 Windows 노트북은 추가 구매 없이 사용할 수 있지만 모델, CPU, RAM, disk, battery health와 OS version은 알 수 없다.
- 일반 가정 회선이 server 운영을 계약상 허용하는지 확인되지 않았다.

### 증거 공백

| ID | 공백 | 결정 영향 | 필요한 후속 증거 |
|---|---|---|---|
| `GAP-D09-01` | Mac은 확인 완료: hardware 충분, battery 정상, sleep 활성, 정전 후 자동 부팅 미지원. Windows는 fallback 전까지 상세 확인 연기 | 자가 host 상시성 | 첫 VM 결정에는 추가 증거 불필요; 자가 host 재개 시 Windows 포함 재검토 |
| `GAP-D09-02` | 현재 교육장 회선은 운영 허가가 없고 실제 주소는 비기록. 다른 자가 회선은 미확인 | 자가 host 가능성 | 교육장 관리자 서면 승인 또는 별도 허용 회선이 생길 때만 재개 |
| `GAP-D09-03` | TypeScript·Python bot+최소 web+후보 store의 idle/peak RAM·event-loop pause | VM 크기·비용 | 후보 축소 뒤 합성 workload 측정 |
| `GAP-D09-04` | process crash, OS reboot, update와 배포 중 singleton 복구 | `OPS-001`, `OPS-002` | host/runtime 결정 뒤 한 장애 Spike |
| `GAP-D09-05` | 외부 backup에서 빈 Windows 또는 새 VM으로 전체 복구 시간 | RPO 24h·RTO 8h | D-12와 결합한 복구 리허설 |
| `GAP-D09-06` | VM·GPT·domain·backup의 원화 총액과 환율 여유 | 월 30,000원 | 공급자 shortlist와 실제 요약 사용량 뒤 계산 |
| `GAP-D09-07` | 서울·도쿄·싱가포르의 실제 Discord Gateway와 사용자 HTTPS 지연, plan 재고 | region 후보 | 무료 speed endpoint와 공급자 console의 읽기 전용 확인; VM 생성은 별도 승인 필요 |
| `GAP-D09-08` | native snapshot과 공급자 밖 encrypted export의 실제 크기·복구 시간 | backup 비용·RPO/RTO | storage 후보 결정 뒤 빈 환경 복구 리허설 |

`GAP-D09-03`과 `GAP-D09-06`을 줄이는 [1GB runtime 수용량 Spike 제안](../spikes/one-gb-runtime-capacity/README.md)을 작성했지만 실행하지 않았다. 세 공급자를 한꺼번에 비교하지 않고 서울 1GB fixture에서 두 runtime을 순차 검증하며, 하나가 통과하면 다른 공급자 시험을 생략한다. `GAP-D09-04`~`05`, `GAP-D09-08`은 runtime·store·backup 후보를 좁힌 뒤 복구·단일 실행 검증으로 남긴다. `GAP-D09-07`은 공개 endpoint가 공급자별로 동등하지 않고 실재고는 인증 없이 확인할 수 없어, 첫 VM 생성 시점의 조건으로 유지한다.

## 7. 확정된 소유자 입력

| ID | 결정 | 영향 |
|---|---|---|
| `D09-Q01` / `OWN-036` | 신규 host 비용 0원을 우선해 자가 hosting을 먼저 검증하고, 필수 기준 실패 시 저가 임대 VM으로 돌아간다. | 보유 Mac·Windows를 첫 검증 범주로, 외부 임대 VM을 가장 강한 fallback으로 둔다. |
| `D09-Q02` / `OWN-037` | 장비 한 대를 사실상 전용 host로 두고 필요한 전원·자동 시작·공유기·DNS·tunnel 설정을 허용한다. | 자가 host의 운영 전제는 충족했지만 장비·회선 사실과 구체 기술은 별도로 검증한다. |
| 후속 결정 / `OWN-038` | 확인된 자가 host 제약 때문에 저가 외부 임대 VM 범주를 우선하고 Mac·LG Gram 16은 fallback으로 둔다. | `OWN-036`의 검증 순서를 대체한다. 공급자·region·OS·plan은 아직 선택하지 않는다. |

`OWN-038`은 host 범주 우선순위만 갱신한다. 구체 VM 공급자·region·OS·plan, ingress 방식 또는 다른 기술의 선택이 아니며 배포나 Spike 권한을 포함하지 않는다.

## 8. 잠정 결론

- **잠정 첫 검증 후보:** 서울의 Lightsail 1GB. 세 후보 중 한국 region을 공식 제공하고 static IP·firewall·5분 alarm·snapshot 경로가 한 상품군에 있어 지역·운영 공백을 가장 적게 남긴다. 이는 공급자·region·plan 선택이나 생성 승인이 아니다.
- **가장 강한 외부 대안:** 도쿄의 Akamai Shared CPU 1GB. 월 USD 5와 USD 2 backup으로 고정비가 가장 낮고 무료 firewall·관측을 제공하지만 실제 plan 재고와 서울 대비 지연을 확인해야 한다.
- **두 번째 외부 대안:** 싱가포르의 DigitalOcean Basic 1GiB. 비용과 backup 가격은 예측 가능하지만 서울·도쿄보다 먼 region만 공식 확인되어 지역 지연 불확실성이 더 크다.
- **가장 강한 fallback:** 보유 Mac. hardware는 충분하지만 운영 위치·전원 복귀·현재 보안 설정을 해결한 뒤에만 재개한다.
- **추가 fallback:** LG Gram 16. Mac과 VM이 실패하기 전에는 상세 확인하지 않는다.
- **주요 위험:** 저사양 VM의 memory 부족, 자가 host의 sleep·회선·물리 장애, web 침해의 bot token 확산, snapshot을 독립 backup으로 오해하는 것, 배포 중 bot 중복 실행이다.
- **필요 검증:** 세 region의 공개 speed endpoint와 plan 재고 확인, 1GB에서 후보 runtime의 실제 자원 측정, crash/reboot/deploy singleton, 독립 backup의 빈 환경 복구다.
- **뒤집는 조건:** VM·backup·domain·GPT 총액이 월 30,000원을 넘거나 1GB급에서 workload가 안정적으로 동작하지 않으면 더 큰 VM과 자가 host를 함께 재평가한다. Mac 운영 위치에 승인된 안정적 회선과 무인 전원 복귀 대안이 생기면 자가 host를 다시 열 수 있다.

host, OS, runtime, SDK, 저장소와 인증 기술은 선택하지 않았다. KBO는 허가된 공급 경로와 재표시 권리가 확인될 때까지 연기한다.

## 9. 정확한 다음 프롬프트

```text
필수 문서를 순서대로 읽고
docs/research/spikes/one-gb-runtime-capacity/README.md의 실행을 준비해.
서울 Lightsail 1GB 임시 VM 한 대, 최대 USD 3, 비운영 SSH key와 합성 데이터만
사용하고 TypeScript·Python harness를 순차 실행할 정확한 명령·정리 검사를 먼저
제안한 뒤 내 승인을 기다려. 아직 VM 생성, credential 조회·출력, Spike 실행,
기술 선택, ADR, 구현 계획 또는 제품 코드를 작성하지 마.
KBO는 연기 상태로 유지해.
```
