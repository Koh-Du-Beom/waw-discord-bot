#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

INSTANCE="waw-production-backup-host"
KEY_PAIR="waw-production-backup-key"
WRITER="waw-production-backup-writer"
POLICY="waw-production-backup-put-only"
LS_REGION="ap-northeast-2"
S3_REGION="eu-north-1"
ASSETS="production-backup-assets.tar.gz"
TMP="$(mktemp -d /tmp/waw-production-provision.XXXXXX)"
CREATED_INSTANCE=0 CREATED_KEY=0 CREATED_BUCKET=0 CREATED_USER=0
ACCESS_KEY_ID=""

cleanup_failure() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    set +e
    [[ -n "$ACCESS_KEY_ID" ]] && aws iam delete-access-key --user-name "$WRITER" --access-key-id "$ACCESS_KEY_ID" >/dev/null 2>&1
    [[ $CREATED_USER -eq 1 ]] && aws iam delete-user-policy --user-name "$WRITER" --policy-name "$POLICY" >/dev/null 2>&1
    [[ $CREATED_USER -eq 1 ]] && aws iam delete-user --user-name "$WRITER" >/dev/null 2>&1
    [[ $CREATED_INSTANCE -eq 1 ]] && aws lightsail delete-instance --region "$LS_REGION" --instance-name "$INSTANCE" >/dev/null 2>&1
    [[ $CREATED_KEY -eq 1 ]] && aws lightsail delete-key-pair --region "$LS_REGION" --key-pair-name "$KEY_PAIR" >/dev/null 2>&1
    if [[ $CREATED_BUCKET -eq 1 ]]; then
      aws s3api delete-bucket --region "$S3_REGION" --bucket "$BUCKET" >/dev/null 2>&1
    fi
    echo "provision_failed_cleanup_attempted" >&2
  fi
  rm -rf -- "$TMP"
  exit "$status"
}
trap cleanup_failure EXIT

for command in aws ssh tar curl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
[[ -f "$ASSETS" ]] || { echo "missing production backup assets" >&2; exit 1; }
[[ -f waw-production-backup-key.pub ]] || { echo "missing waw-production-backup-key.pub" >&2; exit 1; }
[[ -f waw-production-backup-key ]] || { echo "missing waw-production-backup-key" >&2; exit 1; }
install -m 600 waw-production-backup-key "$TMP/deploy-key"
rm -f -- waw-production-backup-key

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="waw-production-backup-$ACCOUNT_ID"
[[ "$(aws lightsail get-instances --region "$LS_REGION" --query "length(instances[?name=='$INSTANCE'])" --output text)" == 0 ]]
[[ "$(aws lightsail get-key-pairs --region "$LS_REGION" --query "length(keyPairs[?name=='$KEY_PAIR'])" --output text)" == 0 ]]
[[ "$(aws iam list-users --query "length(Users[?UserName=='$WRITER'])" --output text)" == 0 ]]
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "target bucket already exists" >&2
  exit 1
fi

aws s3api create-bucket --region "$S3_REGION" --bucket "$BUCKET" \
  --create-bucket-configuration LocationConstraint="$S3_REGION" >/dev/null
CREATED_BUCKET=1
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
cat > "$TMP/lifecycle.json" <<'JSON'
{"Rules":[{"ID":"backups-30d","Status":"Enabled","Filter":{"Prefix":"backups/"},"Expiration":{"Days":30}}]}
JSON
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration file://"$TMP/lifecycle.json"

aws iam create-user --user-name "$WRITER" --tags Key=purpose,Value=waw-production-backup >/dev/null
CREATED_USER=1
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject","Resource":"arn:aws:s3:::%s/backups/*"}]}' "$BUCKET" > "$TMP/writer-policy.json"
aws iam put-user-policy --user-name "$WRITER" --policy-name "$POLICY" --policy-document file://"$TMP/writer-policy.json"
read -r ACCESS_KEY_ID SECRET_ACCESS_KEY < <(aws iam create-access-key --user-name "$WRITER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

aws lightsail import-key-pair --region "$LS_REGION" --key-pair-name "$KEY_PAIR" \
  --public-key-base64 file://waw-production-backup-key.pub >/dev/null
rm -f -- waw-production-backup-key.pub
CREATED_KEY=1
aws lightsail create-instances --region "$LS_REGION" --instance-names "$INSTANCE" \
  --availability-zone ap-northeast-2a --blueprint-id ubuntu_24_04 --bundle-id micro_3_0 \
  --key-pair-name "$KEY_PAIR" --tags key=purpose,value=waw-production-backup key=environment,value=production >/dev/null
CREATED_INSTANCE=1
for _ in $(seq 1 36); do
  [[ "$(aws lightsail get-instance --region "$LS_REGION" --instance-name "$INSTANCE" --query instance.state.name --output text)" == running ]] && break
  sleep 5
done
[[ "$(aws lightsail get-instance --region "$LS_REGION" --instance-name "$INSTANCE" --query instance.state.name --output text)" == running ]]
HOST="$(aws lightsail get-instance --region "$LS_REGION" --instance-name "$INSTANCE" --query instance.publicIpAddress --output text)"

tar -xzf "$ASSETS" -C "$TMP"
rm -f -- "$ASSETS"
SSH=(ssh -i "$TMP/deploy-key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new ubuntu@"$HOST")
for _ in $(seq 1 24); do
  "${SSH[@]}" true >/dev/null 2>&1 && break
  sleep 5
done
"${SSH[@]}" true
tar -czf - -C "$TMP/assets" . | "${SSH[@]}" 'install_dir=/tmp/waw-backup-install; rm -rf -- "$install_dir"; mkdir -m 700 "$install_dir"; tar -xzf - -C "$install_dir"; cd "$install_dir"; sudo bash ./install-production-backup-host.sh; cd /; rm -rf -- "$install_dir"'
{
  printf 'AWS_ACCESS_KEY_ID=%s\n' "$ACCESS_KEY_ID"
  printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$SECRET_ACCESS_KEY"
  printf 'AWS_REGION=%s\n' "$S3_REGION"
  printf 'S3_BUCKET=%s\n' "$BUCKET"
} | "${SSH[@]}" 'sudo install -d -m 750 -o root -g waw-backup /etc/waw-backup && sudo tee /etc/waw-backup/backup.env >/dev/null && sudo chown root:waw-backup /etc/waw-backup/backup.env && sudo chmod 640 /etc/waw-backup/backup.env'

unset SECRET_ACCESS_KEY
printf 'provision_complete\nhost=%s\nbucket=%s\ninstance=%s\nkey_pair=%s\n' "$HOST" "$BUCKET" "$INSTANCE" "$KEY_PAIR"
trap - EXIT
rm -rf -- "$TMP"
