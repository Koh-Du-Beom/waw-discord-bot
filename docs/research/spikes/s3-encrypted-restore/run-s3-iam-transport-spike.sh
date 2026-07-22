#!/usr/bin/env bash
set -Eeuo pipefail

RUN="waw-s3-restore-spike-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
BUCKET="$RUN"; WRITER="$RUN-writer"; READER="$RUN-reader"
OBJ="backups/$RUN/archive.bin"; TMP="$(mktemp -d)"
WAK=""; RAK=""

retry_with_credentials() {
  local access_key="$1" secret_key="$2"; shift 2
  local attempt
  for attempt in {1..10}; do
    if AWS_ACCESS_KEY_ID="$access_key" AWS_SECRET_ACCESS_KEY="$secret_key" "$@"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

cleanup() {
  set +e
  [[ -n "$WAK" ]] && aws iam delete-access-key --user-name "$WRITER" --access-key-id "$WAK" >/dev/null 2>&1
  [[ -n "$RAK" ]] && aws iam delete-access-key --user-name "$READER" --access-key-id "$RAK" >/dev/null 2>&1
  aws iam delete-user-policy --user-name "$WRITER" --policy-name spike >/dev/null 2>&1
  aws iam delete-user-policy --user-name "$READER" --policy-name spike >/dev/null 2>&1
  aws iam delete-user --user-name "$WRITER" >/dev/null 2>&1
  aws iam delete-user --user-name "$READER" >/dev/null 2>&1
  aws s3api delete-object --bucket "$BUCKET" --key "$OBJ" >/dev/null 2>&1
  aws s3api delete-bucket --bucket "$BUCKET" >/dev/null 2>&1
  rm -rf "$TMP"
  echo cleanup_complete
}
trap cleanup EXIT

BUCKET_COUNT="$(aws s3api list-buckets --query "length(Buckets[?starts_with(Name, 'waw-s3-restore-spike-')])" --output text)"
USER_COUNT="$(aws iam list-users --query "length(Users[?starts_with(UserName, 'waw-s3-restore-spike-')])" --output text)"
echo "preflight_bucket_count=$BUCKET_COUNT preflight_user_count=$USER_COUNT"
test "$BUCKET_COUNT" = 0
test "$USER_COUNT" = 0

printf 'synthetic PostgreSQL archive payload\n' > "$TMP/plaintext.bin"
openssl rand -hex 32 > "$TMP/passphrase"
openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:"$TMP/passphrase" \
  -in "$TMP/plaintext.bin" -out "$TMP/archive.bin"
SHA="$(sha256sum "$TMP/archive.bin" | awk '{print $1}')"
BYTES="$(wc -c < "$TMP/archive.bin" | tr -d ' ')"

aws s3api create-bucket --bucket "$BUCKET" --region eu-north-1 \
  --create-bucket-configuration LocationConstraint=eu-north-1 >/dev/null
cat > "$TMP/lifecycle.json" <<EOF
{"Rules":[{"ID":"backup-30d","Status":"Enabled","Filter":{"Prefix":"backups/"},"Expiration":{"Days":30}}]}
EOF
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration file://$TMP/lifecycle.json

aws iam create-user --user-name "$WRITER" --tags Key=purpose,Value=waw-s3-restore-spike >/dev/null
aws iam create-user --user-name "$READER" --tags Key=purpose,Value=waw-s3-restore-spike >/dev/null
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject","Resource":"arn:aws:s3:::%s/backups/*"}]}' "$BUCKET" > "$TMP/writer.json"
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::%s/backups/*"}]}' "$BUCKET" > "$TMP/reader.json"
aws iam put-user-policy --user-name "$WRITER" --policy-name spike --policy-document file://$TMP/writer.json
aws iam put-user-policy --user-name "$READER" --policy-name spike --policy-document file://$TMP/reader.json
read -r WAK WSK < <(aws iam create-access-key --user-name "$WRITER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
read -r RAK RSK < <(aws iam create-access-key --user-name "$READER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

retry_with_credentials "$WAK" "$WSK" aws s3api put-object --bucket "$BUCKET" --key "$OBJ" --body "$TMP/archive.bin" >/dev/null
if AWS_ACCESS_KEY_ID="$WAK" AWS_SECRET_ACCESS_KEY="$WSK" aws s3api get-object --bucket "$BUCKET" --key "$OBJ" "$TMP/writer-get" >/dev/null 2>&1; then echo writer_get_not_denied; exit 1; fi
if AWS_ACCESS_KEY_ID="$WAK" AWS_SECRET_ACCESS_KEY="$WSK" aws s3api delete-object --bucket "$BUCKET" --key "$OBJ" >/dev/null 2>&1; then echo writer_delete_not_denied; exit 1; fi
if AWS_ACCESS_KEY_ID="$WAK" AWS_SECRET_ACCESS_KEY="$WSK" aws iam put-user-policy --user-name "$WRITER" --policy-name denied --policy-document file://$TMP/writer.json >/dev/null 2>&1; then echo writer_iam_change_not_denied; exit 1; fi
if AWS_ACCESS_KEY_ID="$WAK" AWS_SECRET_ACCESS_KEY="$WSK" aws s3api put-bucket-policy --bucket "$BUCKET" --policy file://$TMP/writer.json >/dev/null 2>&1; then echo writer_bucket_policy_change_not_denied; exit 1; fi
retry_with_credentials "$RAK" "$RSK" aws s3api get-object --bucket "$BUCKET" --key "$OBJ" "$TMP/download.bin" >/dev/null
DOWN_SHA="$(sha256sum "$TMP/download.bin" | awk '{print $1}')"; DOWN_BYTES="$(wc -c < "$TMP/download.bin" | tr -d ' ')"
test "$SHA" = "$DOWN_SHA"; test "$BYTES" = "$DOWN_BYTES"
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:"$TMP/passphrase" \
  -in "$TMP/download.bin" -out "$TMP/restored.bin"
cmp "$TMP/plaintext.bin" "$TMP/restored.bin"
if AWS_ACCESS_KEY_ID="$RAK" AWS_SECRET_ACCESS_KEY="$RSK" aws s3api put-object --bucket "$BUCKET" --key "$OBJ" --body "$TMP/archive.bin" >/dev/null 2>&1; then echo reader_put_not_denied; exit 1; fi
if AWS_ACCESS_KEY_ID="$RAK" AWS_SECRET_ACCESS_KEY="$RSK" aws s3api delete-object --bucket "$BUCKET" --key "$OBJ" >/dev/null 2>&1; then echo reader_delete_not_denied; exit 1; fi
LIFECYCLE="$(aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" --query 'Rules[?Status==`Enabled` && Filter.Prefix==`backups/` && Expiration.Days==`30`].ID' --output text)"
test "$LIFECYCLE" = backup-30d
echo "transport_sha=$DOWN_SHA transport_bytes=$DOWN_BYTES"
echo lifecycle_prefix=backups/ expiration_days=30
echo writer_put=pass writer_get=deny writer_delete=deny writer_iam_change=deny writer_bucket_policy_change=deny
echo reader_get=pass reader_put=deny reader_delete=deny decrypt_compare=pass
