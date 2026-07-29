#!/usr/bin/env bash
set -Eeuo pipefail

for attempt in {1..12}; do
  if curl --fail --silent --max-time 5 \
      http://127.0.0.1:18080/health |
    grep -q '"status":"healthy"'; then
    exit 0
  fi
  (( attempt == 12 )) || sleep 5
done

echo production_health_timeout >&2
exit 1
