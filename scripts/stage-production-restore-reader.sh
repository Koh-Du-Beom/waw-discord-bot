#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <production-host>" >&2
  exit 2
fi

HOST="$1"
REGION="eu-north-1"
READER="waw-production-restore-reader-$(date -u +%Y%m%d%H%M%S)"
POLICY="waw-production-restore-get-one"
TMP="$(mktemp -d /tmp/waw-production-reader.XXXXXX)"
ACCESS_KEY_ID=""

cleanup() {
  status=$?
  set +e
  [[ -n "$ACCESS_KEY_ID" ]] && aws iam delete-access-key --user-name "$READER" --access-key-id "$ACCESS_KEY_ID" >/dev/null 2>&1
  aws iam delete-user-policy --user-name "$READER" --policy-name "$POLICY" >/dev/null 2>&1
  aws iam delete-user --user-name "$READER" >/dev/null 2>&1
  ssh -i "$TMP/deploy-key" -o IdentitiesOnly=yes ubuntu@"$HOST" 'rm -f -- /tmp/waw-restore-reader.env' >/dev/null 2>&1
  rm -f -- waw-production-backup-key
  rm -rf -- "$TMP"
  exit "$status"
}
trap cleanup EXIT

for command in aws ssh openssl; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
[[ -f waw-production-backup-key ]] || { echo "missing deployment key" >&2; exit 1; }
install -m 600 waw-production-backup-key "$TMP/deploy-key"
rm -f -- waw-production-backup-key

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="waw-production-backup-$ACCOUNT_ID"
OBJECT_KEY="$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix backups/ \
  --query 'reverse(sort_by(Contents[?ends_with(Key, `.dump.age`)], &LastModified))[0].Key' --output text)"
[[ "$OBJECT_KEY" == backups/*.dump.age ]]

aws iam create-user --user-name "$READER" --tags Key=purpose,Value=waw-production-restore >/dev/null
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::%s/%s"}]}' \
  "$BUCKET" "$OBJECT_KEY" > "$TMP/reader-policy.json"
aws iam put-user-policy --user-name "$READER" --policy-name "$POLICY" --policy-document file://"$TMP/reader-policy.json"
read -r ACCESS_KEY_ID SECRET_ACCESS_KEY < <(aws iam create-access-key --user-name "$READER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

{
  printf 'AWS_ACCESS_KEY_ID=%s\n' "$ACCESS_KEY_ID"
  printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$SECRET_ACCESS_KEY"
  printf 'AWS_REGION=%s\n' "$REGION"
  printf 'S3_BUCKET=%s\n' "$BUCKET"
  printf 'OBJECT_KEY=%s\n' "$OBJECT_KEY"
} | ssh -i "$TMP/deploy-key" -o IdentitiesOnly=yes ubuntu@"$HOST" 'umask 077; tee /tmp/waw-restore-reader.env >/dev/null'
unset SECRET_ACCESS_KEY

ssh -i "$TMP/deploy-key" -o IdentitiesOnly=yes ubuntu@"$HOST" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
source /tmp/waw-restore-reader.env
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION
aws s3api get-object --bucket "$S3_BUCKET" --key "$OBJECT_KEY" /tmp/waw-production-restore.dump.age >/dev/null
if aws s3api put-object --bucket "$S3_BUCKET" --key backups/reader-deny-probe --body /dev/null >/dev/null 2>&1; then exit 1; else echo reader_put_denied; fi
if aws s3api delete-object --bucket "$S3_BUCKET" --key "$OBJECT_KEY" >/dev/null 2>&1; then exit 1; else echo reader_delete_denied; fi
if aws s3api get-object --bucket "$S3_BUCKET" --key backups/not-authorized.dump.age /tmp/reader-deny >/dev/null 2>&1; then exit 1; else echo reader_other_get_denied; fi
if aws iam list-users >/dev/null 2>&1; then exit 1; else echo reader_iam_denied; fi
rm -f -- /tmp/waw-restore-reader.env /tmp/reader-deny
echo reader_exact_get_complete
REMOTE

aws iam delete-access-key --user-name "$READER" --access-key-id "$ACCESS_KEY_ID"
ACCESS_KEY_ID=""
aws iam delete-user-policy --user-name "$READER" --policy-name "$POLICY"
aws iam delete-user --user-name "$READER"
echo reader_cleanup_complete
