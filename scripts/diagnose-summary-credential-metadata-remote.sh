#!/usr/bin/env bash
set -Eeuo pipefail
set +x

TARGET=/etc/waw-credentials/bot-summary-api-key
SYSTEMCTL=/usr/bin/systemctl
RUNUSER=/usr/sbin/runuser

[[ -x "$SYSTEMCTL" && -x "$RUNUSER" ]] || {
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC tools=FAIL'
  exit 1
}
echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC tools=PASS'

if [[ ! -e "$TARGET" ]]; then
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC target=ABSENT'
elif [[ -L "$TARGET" ]]; then
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC target=SYMLINK'
elif [[ ! -f "$TARGET" ]]; then
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC target=NON_REGULAR'
else
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC target=REGULAR'
  metadata="$(stat -c '%U:%G:%a' "$TARGET" 2>/dev/null || true)"
  if [[ "$metadata" == root:root:600 ]]; then
    echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC metadata=PASS'
  else
    echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC metadata=FAIL'
  fi
  if "$RUNUSER" -u waw-bot -- test -r "$TARGET" 2>/dev/null; then
    echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC bot_direct_read=ALLOW'
  else
    echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC bot_direct_read=DENY'
  fi
fi

for unit in waw-bot.service waw-web.service; do
  [[ "$("$SYSTEMCTL" is-active "$unit" 2>/dev/null || true)" == active ]] || {
    echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC services=FAIL'
    exit 1
  }
done
echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC services=PASS'

bot_environment="$("$SYSTEMCTL" show -p Environment --value waw-bot.service 2>/dev/null)"
provider_zero="$(tr ' ' '\n' <<<"$bot_environment" |
  grep -cx 'WAW_SUMMARY_PROVIDER_ENABLED=0' || true)"
quota_zero="$(tr ' ' '\n' <<<"$bot_environment" |
  grep -cx 'WAW_SUMMARY_QUOTA_ENABLED=0' || true)"
if [[ "$provider_zero" -eq 1 && "$quota_zero" -eq 1 ]]; then
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC flags=PASS provider=0 quota=0'
else
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC flags=FAIL'
  exit 1
fi

echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC result=PASS mutation=0 restart=0 provider_calls=0'
