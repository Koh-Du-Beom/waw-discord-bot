# 1GB runtime 수용량 Spike 제안

- 상태: Approved Spike — AWS 서울 임시 VM 실행·정리 완료
- 제안일: 2026-07-21
- 연결 요구사항: `OPS-001`~`OPS-004`, `OWN-005`, `OWN-017`, `OWN-023`, `OWN-034`, `OWN-035`, `GAP-D09-03`, `GAP-D09-06`
- 제품 코드 또는 기술 선택: 없음

## 단일 가설

서울의 1GB급 임시 VM 한 대에서 TypeScript와 Python 후보 중 적어도 하나는 첫 MVP의 최소 bot+web 합성 workload를 60분 동안 OOM, process crash, event 누락과 과도한 지연 없이 처리하면서 월 30,000원 총예산에 필요한 고정비 여유를 남긴다.

서울 Lightsail 1GB는 첫 검증 fixture일 뿐 공급자·region·plan·OS·runtime·SDK 선택이 아니다. 여기서 후보 하나가 통과하면 도쿄 Akamai와 싱가포르 DigitalOcean의 동등 시험은 실행하지 않는다. 두 runtime이 모두 실패할 때만 2GB 또는 다른 공급자를 다시 검토한다.

## 기능 연결

이 Spike는 다음 제품 기능을 구현하지 않고, 해당 기능들을 같은 저가 host에서 실행할 자원 여유만 검증한다.

- Discord Gateway 상시 연결과 명령 수신
- Riot 게임 중 Discord Go Live 상태를 관찰하는 후속 몰랭 자동 감지
- 관리자 web·Discord OAuth·설정 조회
- 명령 감사, dedupe, session과 heartbeat 처리

실제 Discord Gateway 로그인·Resume, Go Live reconciliation, Riot 연동과 OAuth는 범위 밖이며 D-04 또는 후속 경계 검증에 남긴다.

## 최소 범위와 합성 데이터

같은 1GB VM에서 TypeScript와 Python harness를 동시에 실행하지 않고 순차 실행한다.

- Discord Voice State 형태의 비민감 합성 event 10,000건
- 중복 event 10%를 섞은 dedupe 처리
- `/health`, `/status`, 합성 설정 조회의 최소 HTTP endpoint
- HTTP 동시 요청 5개, 초당 2요청
- 이전 저장량 Spike의 상한 안에 있는 40MB 이하 합성 audit·session·dedupe data
- runtime별 60분 연속 실행
- credential 없는 Discord public Gateway URL HTTPS 조회로 outbound 경로 확인
- Mac에서 임시 HTTPS endpoint까지 5회 연결 확인

실제 사용자 ID, Discord 원문, bot·OAuth·GPT token, 운영 DB와 운영 domain은 사용하지 않는다. 임시 Linux image와 시험 harness는 비교 fixture이며 제품 architecture로 승격하지 않는다.

## 성공·실패 기준

runtime 하나의 성공에는 다음을 모두 요구한다.

- OOM, process crash와 강제 재시작 0회
- swap의 지속 증가나 명백한 thrashing 없음
- system available memory가 128MiB 아래로 1분 이상 유지되지 않음
- application 합산 RSS p95 650MiB 이하
- shared vCPU 사용률 p95 70% 이하
- HTTP p95 500ms 이하, 오류율 0.1% 이하
- 합성 event 누락과 중복 반영 0건
- event-loop 또는 scheduler 지연 p99 100ms 이하
- 60분 동안 health 확인 성공

TypeScript와 Python이 모두 하나 이상의 기준을 위반하거나 결과를 측정할 수 없으면 전체 가설을 실패로 판정한다. 한 runtime만 실패하면 그 runtime과 1GB 조합만 실패하며 다른 공급자 전체로 일반화하지 않는다.

## 임시 환경·credential·비용 상한

- 서울 Lightsail public IPv4 1GB급 VM 한 대
- 비교용 임시 Linux image 한 개
- 임시 SSH key 한 개
- inbound는 시험 HTTPS와 제한된 관리 접속만 허용
- provider snapshot, 유료 backup, 추가 disk와 운영 DNS는 만들지 않음
- Discord·OAuth·GPT·database credential은 만들거나 조회하지 않음
- 목표 사용료 USD 1 이하, 예상하지 못한 최소 청구·세금·환전 포함 절대 상한 USD 3

실행에는 공급자 account와 결제수단이 필요하지만 credential 값은 문서·명령·로그에 출력하지 않는다. 실제 account 접근과 VM 생성은 별도 사용자 승인 뒤에만 수행한다. 해당 범위는 2026-07-21 owner가 승인했다.

## 비용 판정

실행 결과와 별도로 월 운영 고정비를 다음 기준으로 계산한다.

- VM, provider native backup, 공급자 밖 독립 backup과 domain 연환산 합계 18,000원 이하
- GPT·세금·환율 변동에 최소 12,000원 보존
- 전체 월 예상액 30,000원 이하

실제 GPT 사용량이 아직 없으므로 이 Spike가 통과해도 `GAP-D09-06`은 축소될 뿐 닫히지 않는다.

## 정리와 중단 조건

실행 완료 또는 어느 단계에서든 비용 상한·보안 경계를 지킬 수 없으면 즉시 중단한다. 이후 임시 VM, disk, snapshot, static IP, firewall rule과 SSH key를 삭제하고 billing 화면에서 잔존 resource가 없는지 확인한다. 저장소에는 비밀정보 없는 결과, 측정 명령, 한계와 비용만 남긴다.

## 실행 승인 기록

2026-07-21 owner는 서울 Lightsail 1GB 임시 VM 한 대 생성, 최대 USD 3 지출, 비운영 SSH key 사용과 시험 후 resource 삭제를 승인했다. 이 승인은 runtime·SDK·host 선택, ADR Accepted와 제품 구현을 포함하지 않는다.

### 임시 IAM 경계

사용자는 root credential이나 장기 관리자 access key 대신 임시 human session을 사용하고, 그 session에는 [`iam-policy.json`](./iam-policy.json)의 Spike 전용 정책만 부여한다. AWS는 human user에 federation과 temporary credential 사용, least privilege와 MFA를 권장하며 Lightsail은 temporary credential을 지원한다.

정책은 서울 region의 필요한 조회, instance 생성·port 변경·삭제와 일회성 key pair import·삭제만 허용한다. 생성·변경·삭제 instance에는 `purpose=waw-capacity-spike` tag를 요구한다. 다음 한계는 IAM만으로 닫히지 않으므로 실행 절차에서 검증한다.

- `ImportKeyPair`와 account inventory 조회 일부는 resource-level permission을 지원하지 않아 `Resource: "*"`가 필요하다.
- `TagResource` 허용은 tagged instance 생성의 종속 권한이지만, 기존 resource에 같은 tag를 추가할 가능성을 완전히 제거하지 못한다. 이 임시 session으로 기존 resource를 변경하지 않고 Spike 직후 session과 정책 연결을 폐기한다.
- 허용 bundle을 정확히 1GB·USD 7 이하로, blueprint를 Ubuntu LTS로, firewall source를 현재 관리 단말 `/32`로 제한하는 IAM condition은 사용하지 않는다. 생성 전 조회 결과와 생성 후 port state를 별도로 판정한다.
- policy는 static IP, snapshot, disk, DNS, backup 생성 action을 허용하지 않는다.

공식 근거: [AWS IAM 보안 모범 사례](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html), [Lightsail의 temporary credential·tag authorization 지원](https://docs.aws.amazon.com/lightsail/latest/userguide/security_iam_service-with-iam.html), [Lightsail action·resource·condition 표](https://docs.aws.amazon.com/service-authorization/latest/reference/list_lightsail.html), [tag 기반 access control 예시](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-controlling-access-using-tags.html)

## local 합성 self-check

2026-07-21에 macOS local 환경에서 두 harness의 문법과 3초 합성 실행을 검증했다. 두 runtime 모두 event accounting, 요청 완료, 오류율, HTTP p95, scheduler p99와 RSS p95의 application-level 검증을 통과했다. 합성 `/proc` fixture로 Linux metric parser를 단위 검증했고, available memory가 128MiB 아래에서 60초 지속된 결과를 verifier가 실패 처리하는 것도 확인했다. 이는 fixture와 판정 경로의 확인일 뿐, 1GB Linux VM의 실제 system metric이나 60분 안정성의 증거가 아니다.

```bash
node --check harness.mjs
python3 -m py_compile harness.py verify.py
sh -n run-runtime-harness.sh
python3 -m unittest test_metrics.py
python3 -m unittest test_verify.py
STORE_FILE="$(mktemp /tmp/waw-store-self-check.XXXXXX)"
dd if=/dev/zero of="$STORE_FILE" bs=1m count=40 status=none
WAW_SYNTHETIC_STORE="$STORE_FILE" ./run-runtime-harness.sh typescript 10 | python3 verify.py --application-only
WAW_SYNTHETIC_STORE="$STORE_FILE" ./run-runtime-harness.sh python 10 | python3 verify.py --application-only
rm -f "$STORE_FILE"
```

## 실행 runbook

아래 명령은 실행 승인 뒤에만 사용한다. AWS profile은 별도 최소 권한 profile을 사용하고 access key, account ID와 결제 정보는 출력하거나 저장소에 기록하지 않는다. `set -x`와 AWS CLI `--debug`는 사용하지 않는다.

명령과 과금 경계는 AWS의 [Lightsail instance 생성 CLI](https://docs.aws.amazon.com/cli/latest/reference/lightsail/create-instances.html), [SSH public key import](https://docs.aws.amazon.com/cli/latest/reference/lightsail/import-key-pair.html), [firewall port 제어](https://docs.aws.amazon.com/cli/latest/reference/lightsail/open-instance-public-ports.html), [삭제](https://docs.aws.amazon.com/cli/latest/reference/lightsail/delete-instance.html)와 [stopped instance도 삭제 전까지 과금되는 정책](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html)을 기준으로 작성했다.

### 1. 읽기 전용 사전 확인

```bash
aws sts get-caller-identity --profile waw-spike
aws lightsail get-regions --include-availability-zones --profile waw-spike --query 'regions[?name==`ap-northeast-2`]'
aws lightsail get-blueprints --include-inactive --profile waw-spike --region ap-northeast-2 --query 'blueprints[?platform==`LINUX_UNIX`].[blueprintId,name,version,isActive]'
aws lightsail get-bundles --include-inactive --profile waw-spike --region ap-northeast-2 --query 'bundles[?ramSizeInGb==`1`].[bundleId,name,price,cpuCount,diskSizeInGb,isActive,supportedPlatforms]'
```

여기서 active Ubuntu LTS blueprint 하나와 public IPv4, RAM 1GB, 월 USD 7 이하인 active bundle 하나를 눈으로 확인한다. account의 서울 재고·가격 또는 예상 총비용이 제안과 다르면 생성하지 않고 중단한다.

2026-07-21 실제 account 사전 확인에서는 `ubuntu_24_04`와 `ubuntu_22_04`가 active였고, public IPv4 `micro_3_0`이 2 vCPU·1GB RAM·40GB disk·2TB transfer·월 USD 7로 조회됐다. 실행 fixture는 `ubuntu_24_04`와 `micro_3_0`으로 고정하되 이는 host·OS·plan 선택이 아니다. IAM identity는 `waw-spike-operator`와 정확히 일치함을 확인했고 account ID·credential은 기록하지 않았다.

### 2. 이름과 비운영 SSH key 준비

```bash
SPIKE_REGION=ap-northeast-2
SPIKE_ZONE=ap-northeast-2a
SPIKE_RUN_ID="$(date -u +%Y%m%d%H%M%S)"
SPIKE_INSTANCE="waw-capacity-spike-$SPIKE_RUN_ID-vm"
SPIKE_KEY="waw-capacity-spike-$SPIKE_RUN_ID-key"
SPIKE_BLUEPRINT='<사전 확인한 active Ubuntu LTS blueprintId>'
SPIKE_BUNDLE='<사전 확인한 active 1GB public IPv4 bundleId>'
SPIKE_LOCAL_DIR="$(mktemp -d /tmp/waw-capacity-spike.XXXXXX)"
chmod 700 "$SPIKE_LOCAL_DIR"
ssh-keygen -q -t rsa -b 3072 -N '' -C "$SPIKE_KEY" -f "$SPIKE_LOCAL_DIR/id_rsa"
aws lightsail import-key-pair --profile waw-spike --region "$SPIKE_REGION" --key-pair-name "$SPIKE_KEY" --public-key-base64 "file://$SPIKE_LOCAL_DIR/id_rsa.pub"
```

private key는 `mktemp`가 만든 mode 700 임시 directory에만 두고 저장소, shell history 인자, 문서와 원격 VM에 복사하지 않는다. Lightsail CLI의 `publicKeyBase64`는 binary `fileb://`나 사용자가 다시 base64-encoding한 text가 아니라 OpenSSH public key 원문 string을 `file://`로 읽을 때 성공함을 import→delete probe로 확인했다. Public key만 Lightsail에 올리며 시험 종료 시 local key와 provider key를 모두 삭제한다.
Lightsail active resource의 교차 type 이름 namespace 충돌을 피하도록 instance와 key에 각각 `-vm`, `-key` suffix를 붙이고, 삭제 직후 이름 재사용 충돌을 피하며 실행 단위를 추적하도록 UTC timestamp를 포함한다.

### 3. 생성과 최소 firewall

```bash
aws lightsail create-instances --profile waw-spike --region "$SPIKE_REGION" --instance-names "$SPIKE_INSTANCE" --availability-zone "$SPIKE_ZONE" --blueprint-id "$SPIKE_BLUEPRINT" --bundle-id "$SPIKE_BUNDLE" --key-pair-name "$SPIKE_KEY" --tags key=purpose,value=waw-capacity-spike key=expires,value=2026-07-22
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  test "$(aws lightsail get-instance --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --query 'instance.state.name' --output text)" = running && break
  sleep 5
done
test "$(aws lightsail get-instance --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --query 'instance.state.name' --output text)" = running
aws lightsail close-instance-public-ports --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --port-info fromPort=22,toPort=22,protocol=tcp
aws lightsail open-instance-public-ports --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --port-info 'fromPort=22,toPort=22,protocol=tcp,cidrs=<현재 관리 단말 IPv4/32>'
aws lightsail get-instance-port-states --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE"
SPIKE_HOST="$(aws lightsail get-instance --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --query 'instance.publicIpAddress' --output text)"
ssh -i "$SPIKE_LOCAL_DIR/id_rsa" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new ubuntu@"$SPIKE_HOST"
```

기본 SSH rule을 제거한 뒤 현재 관리 단말의 `/32`만 다시 연다. database port, 운영 DNS, static IP, snapshot, backup과 추가 disk는 만들지 않는다. public HTTPS 검증이 필요할 때만 합성 endpoint가 준비된 뒤 TCP 443을 열고, 다섯 번 확인 직후 다시 닫는다.

### 4. VM 기준선과 순차 시험

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq openssl sysstat time xz-utils
curl --fail --silent --show-error --remote-name https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-x64.tar.xz
printf '%s  %s\n' '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578' 'node-v22.23.1-linux-x64.tar.xz' | sha256sum --check
sudo tar -xJf node-v22.23.1-linux-x64.tar.xz -C /opt
rm -f node-v22.23.1-linux-x64.tar.xz
export PATH="/opt/node-v22.23.1-linux-x64/bin:$PATH"
uname -a
free -m
df -h /
curl --fail --silent --show-error --output /dev/null https://discord.com/api/v10/gateway
```

Ubuntu 기본 Node 18은 현재 D-04 TypeScript 후보의 Node 22.12+ 경계를 충족하지 않는다. 따라서 Node 공식 `latest-v22.x` manifest에서 2026-07-21 확인한 v22.23.1 Linux x64 archive와 SHA-256을 fixture로 고정한다. 이는 제품 runtime version 선택이 아니며 ADR 전 지원 상태를 다시 확인한다. [Node.js v22.23.1 downloads](https://nodejs.org/dist/v22.23.1/), [official checksums](https://nodejs.org/dist/v22.23.1/SHASUMS256.txt)

fixture는 같은 합성 event 파일과 40MB 이하 store를 사용한다. TypeScript와 Python harness는 동시에 실행하지 않으며 각 후보마다 다음 순서를 반복한다.

먼저 저장소의 fixture 파일만 VM의 폐기 가능한 작업 directory로 복사하고, 원격에서 문법·단위 시험과 30초 smoke를 통과시킨다. Private key와 AWS profile은 복사하지 않는다.

```bash
scp run-runtime-harness.sh run-linux-capacity.py verify.py harness.mjs harness.py \
  test_metrics.py test_verify.py ubuntu@"$SPIKE_HOST":/home/ubuntu/waw-capacity/
ssh ubuntu@"$SPIKE_HOST" 'cd /home/ubuntu/waw-capacity && \
  chmod +x run-runtime-harness.sh && \
  export PATH=/opt/node-v22.23.1-linux-x64/bin:$PATH && \
  node --check harness.mjs && \
  python3 -m py_compile harness.py verify.py run-linux-capacity.py && \
  python3 -m unittest test_metrics.py test_verify.py && \
  python3 run-linux-capacity.py typescript 30 | python3 verify.py && \
  python3 run-linux-capacity.py python 30 | python3 verify.py'
```

실제 실행에서는 위 `ssh`와 `scp`에 임시 private key, 고정된 `known_hosts` 파일과 `IdentitiesOnly=yes`를 명시한다. 문서 예시는 credential 경로를 저장소에 고정하지 않기 위해 생략했다. 60분 실행 직전과 후보 전환 시 `run-linux-capacity.py`, `harness.mjs`, `harness.py` process 및 18080·18081 listen port가 남아 있지 않은지 확인한다. 중복 실행이 발견되면 해당 구간의 결과는 폐기하고 모든 합성 process를 종료한 뒤 처음부터 다시 측정한다.

```bash
python3 run-linux-capacity.py typescript 3600 | tee typescript-summary.json
python3 verify.py < typescript-summary.json
sudo sync
python3 run-linux-capacity.py python 3600 | tee python-summary.json
python3 verify.py < python-summary.json
```

`run-runtime-harness.sh`, `run-linux-capacity.py`와 `verify.py`는 폐기 가능한 fixture다. Linux runner는 application JSON에 process exit·실행 시간, system CPU p95, available memory의 연속 저하 시간과 swap-out 증가량을 결합한다. Summary에는 hostname, public IP, SSH path, credential과 실제 사용자 데이터는 기록하지 않는다. 한 후보가 끝나면 process와 port가 사라졌는지 확인한 뒤 다음 후보를 시작한다.

### 5. 임시 HTTPS 확인

Runtime 측정이 모두 끝난 뒤 VM에서 1일 self-signed certificate와 폐기 가능한 health server를 준비한다. Private key는 VM의 mode 700 임시 directory 밖으로 복사하지 않고 health 확인 직후 server·certificate·key를 제거한다.

```bash
HTTPS_DIR="$(mktemp -d /tmp/waw-https.XXXXXX)"
chmod 700 "$HTTPS_DIR"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 -subj '/CN=waw-capacity-spike' -keyout "$HTTPS_DIR/key.pem" -out "$HTTPS_DIR/cert.pem"
sudo node ./https-health.mjs 443 "$HTTPS_DIR/cert.pem" "$HTTPS_DIR/key.pem" &
HTTPS_PID=$!
```

```bash
aws lightsail open-instance-public-ports --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --port-info fromPort=443,toPort=443,protocol=tcp
for attempt in 1 2 3 4 5; do curl --insecure --fail --silent --show-error --output /dev/null --write-out '%{http_code} %{time_total}\n' "https://$SPIKE_HOST/health"; done
aws lightsail close-instance-public-ports --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE" --port-info fromPort=443,toPort=443,protocol=tcp
sudo kill "$HTTPS_PID"
rm -rf "$HTTPS_DIR"
```

자체 서명 시험 certificate라서 이 단계에만 `--insecure`를 허용한다. 운영 TLS, DNS 또는 인증 방식의 근거로 사용하지 않는다.

### 6. 중단·정리와 잔존 resource 검사

측정 성공 여부와 무관하게 같은 작업 세션에서 정리한다. stopped instance도 과금되므로 stop이 아니라 delete를 사용한다.

```bash
aws lightsail delete-instance --profile waw-spike --region "$SPIKE_REGION" --instance-name "$SPIKE_INSTANCE"
aws lightsail delete-key-pair --profile waw-spike --region "$SPIKE_REGION" --key-pair-name "$SPIKE_KEY"
case "$SPIKE_LOCAL_DIR" in
  /tmp/waw-capacity-spike.*) rm -rf -- "$SPIKE_LOCAL_DIR" ;;
  *) echo 'refusing unexpected cleanup path' >&2; exit 1 ;;
esac
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  test "$(aws lightsail get-instances --profile waw-spike --region "$SPIKE_REGION" --query 'length(instances[?contains(name, `waw-capacity-spike`)])' --output text)" = 0 &&
  test "$(aws lightsail get-key-pairs --profile waw-spike --region "$SPIKE_REGION" --query 'length(keyPairs[?contains(name, `waw-capacity-spike`)])' --output text)" = 0 && break
  sleep 5
done
aws lightsail get-instances --profile waw-spike --region "$SPIKE_REGION" --query 'instances[?contains(name, `waw-capacity-spike`)].name'
aws lightsail get-key-pairs --profile waw-spike --region "$SPIKE_REGION" --query 'keyPairs[?contains(name, `waw-capacity-spike`)].name'
aws lightsail get-static-ips --profile waw-spike --region "$SPIKE_REGION" --query 'staticIps[?contains(name, `waw-capacity-spike`)].name'
aws lightsail get-disks --profile waw-spike --region "$SPIKE_REGION" --query 'disks[?contains(name, `waw-capacity-spike`)].name'
aws lightsail get-instance-snapshots --profile waw-spike --region "$SPIKE_REGION" --query 'instanceSnapshots[?contains(name, `waw-capacity-spike`)].name'
```

다섯 query가 모두 빈 배열인지 확인하고 Lightsail console의 Instances, Storage, Snapshots, Networking과 Billing 화면에서도 잔존 resource·예상 청구를 확인한다. Local 임시 directory는 예상 prefix와 일치할 때만 삭제한다. 삭제 또는 billing 확인이 실패하면 결과 분석보다 정리를 우선하며, resource identifier만 기록하고 credential과 public IP는 기록하지 않는다.

2026-07-21 첫 장시간 시도에서는 수정 전 TypeScript runner 두 개가 겹쳐 실행된 사실을 process inventory로 발견했다. 순차 실행 조건을 위반하므로 두 결과를 모두 증거에서 제외했고, 합성 process와 listen port가 남지 않았음을 확인한 뒤 수정된 fixture의 문법·단위 시험과 30초 runtime별 smoke부터 다시 수행했다. 이 폐기 결과는 D-04 또는 D-09 선택 근거로 사용하지 않는다.

2026-07-21 승인된 서울 Lightsail fixture의 최신 Node 22.23.1·Python runner를 순차로 60분씩 실행했다. 두 runtime 모두 13개 verifier 기준을 통과했다. 실제 summary 원문은 임시 VM 삭제와 함께 폐기했으며 verifier의 PASS 결과와 실행 범위·한계를 이 문서의 증거로 보존한다. 임시 self-signed HTTPS `/health`는 다섯 번 모두 HTTP 200으로 확인한 뒤 포트·server·certificate를 제거했고, VM·SSH key·static IP·disk·snapshot 잔존도 모두 없음을 확인했다. 이 결과는 1GB fixture의 합성 workload 증거이며 runtime·SDK·host의 최종 선택이나 운영 안정성 보장이 아니다.
