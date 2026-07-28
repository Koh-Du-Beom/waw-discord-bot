#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d /tmp/waw-render-assets.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT

printf '%s\n' 'left=__LEFT__' 'right=__RIGHT__' >"$ROOT/template"
printf 'fixture-left\n' >"$ROOT/left"
printf 'fixture-right\n' >"$ROOT/right"

"$SCRIPT_DIR/render-embedded-assets.py" \
  "$ROOT/template" \
  "$ROOT/output" \
  "__LEFT__=$ROOT/left" \
  "__RIGHT__=$ROOT/right"

left_b64="$(base64 <"$ROOT/left" | tr -d '\n')"
right_b64="$(base64 <"$ROOT/right" | tr -d '\n')"
grep -Fqx "left=$left_b64" "$ROOT/output"
grep -Fqx "right=$right_b64" "$ROOT/output"

if "$SCRIPT_DIR/render-embedded-assets.py" \
  "$ROOT/template" "$ROOT/invalid" "__MISSING__=$ROOT/left"; then
  echo missing_placeholder_was_accepted >&2
  exit 1
fi

echo embedded_asset_renderer_fixture_passed
