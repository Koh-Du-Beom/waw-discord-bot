#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <recovery-directory>" >&2
  exit 2
fi

RECOVERY_DIR="$1"
ENV_FILE="$RECOVERY_DIR/host-db.env"
IDENTITY_FILE="$RECOVERY_DIR/identity.age"
[[ -f "$ENV_FILE" ]] || { echo "host env file not found" >&2; exit 1; }
[[ ! -e "$IDENTITY_FILE" ]] || { echo "identity output already exists" >&2; exit 1; }

TMP_DIR="$(mktemp -d /tmp/waw-age-rotation.XXXXXX)"
cleanup() { rm -rf -- "$TMP_DIR"; }
trap cleanup EXIT

age-keygen -o "$TMP_DIR/identity.txt" >/dev/null
echo "Enter a non-empty passphrase twice. Do not press Enter on an empty prompt."
age -p -o "$IDENTITY_FILE" "$TMP_DIR/identity.txt"
RECIPIENT="$(age-keygen -y "$TMP_DIR/identity.txt")"
grep -v '^AGE_RECIPIENT=' "$ENV_FILE" > "$TMP_DIR/host-db.env"
printf 'AGE_RECIPIENT=%s\n' "$RECIPIENT" >> "$TMP_DIR/host-db.env"
install -m 600 "$TMP_DIR/host-db.env" "$ENV_FILE"
chmod 600 "$IDENTITY_FILE"
echo "identity_rotation_complete"
