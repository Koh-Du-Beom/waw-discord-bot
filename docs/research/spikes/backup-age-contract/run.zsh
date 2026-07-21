#!/bin/zsh
set -euo pipefail

spike_tmp="$(mktemp -d "${TMPDIR:-/tmp}/waw-age-contract.XXXXXX")"
cleanup() {
  rm -rf -- "$spike_tmp"
}
trap cleanup EXIT HUP INT TERM

identity_path="$spike_tmp/synthetic-identity.txt"
plain_path="$spike_tmp/synthetic.sql"
archive_path="$spike_tmp/synthetic.sql.gz.age"
restored_path="$spike_tmp/restored.sql"

age-keygen -o "$identity_path" >/dev/null
recipient="$(age-keygen -y "$identity_path")"

print -r -- 'BEGIN; CREATE TABLE synthetic_contract (id integer PRIMARY KEY); INSERT INTO synthetic_contract VALUES (1); COMMIT;' > "$plain_path"
gzip -c "$plain_path" | age --encrypt --recipient "$recipient" --output "$archive_path"
age --decrypt --identity "$identity_path" "$archive_path" | gzip -dc > "$restored_path"
cmp --silent "$plain_path" "$restored_path"

if grep -q 'AGE-SECRET-KEY' "$archive_path"; then
  print -u2 -- 'FAIL: archive contains an age identity marker'
  exit 1
fi

print -- 'PASS: synthetic age recipient encryption round trip'
print -- "archive_bytes=$(wc -c < "$archive_path" | tr -d ' ')"
print -- "archive_sha256=$(shasum -a 256 "$archive_path" | awk '{print $1}')"
