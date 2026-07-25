#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/waw-release-manager.XXXXXX)"
trap 'rm -rf -- "$ROOT"' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export WAW_INSTALL_ROOT="$ROOT"
release_root="$ROOT/opt/waw/releases"
mkdir -p "$ROOT/source" "$ROOT/bin"
printf '{"name":"fixture","version":"1.0.0"}\n' >"$ROOT/source/package.json"
cat >"$ROOT/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == run && "${2:-}" == build ]]; then
  mkdir -p dist/server/web dist/server/bot dist/web
  printf 'web\n' >dist/server/web/main.js
  printf 'bot\n' >dist/server/bot/main.js
  printf 'html\n' >dist/web/index.html
fi
EOF
chmod 755 "$ROOT/bin/npm"
tar -czf "$ROOT/source.tgz" -C "$ROOT/source" .
source_sha="$(sha256sum "$ROOT/source.tgz" | awk '{print $1}')"
PATH="$ROOT/bin:$PATH" \
  "$SCRIPT_DIR/manage-production-release.sh" stage 3333333 \
  "$ROOT/source.tgz" "$source_sha" |
  grep -q '^production_release_staged release=3333333 sha256='
[[ -r "$release_root/3333333/dist/server/web/main.js" ]]
[[ "$(stat -c '%A' "$release_root/3333333/dist/server/web/main.js")" != *w* ]]

mkdir -p "$release_root/1111111" "$release_root/2222222"
printf 'hash-one\n' >"$release_root/1111111/.waw-release-sha256"
printf 'hash-two\n' >"$release_root/2222222/.waw-release-sha256"

"$SCRIPT_DIR/manage-production-release.sh" activate 1111111 |
  grep -qx 'production_release_activated release=1111111'
[[ "$(readlink -f "$ROOT/opt/waw/current")" == "$release_root/1111111" ]]

"$SCRIPT_DIR/manage-production-release.sh" activate 2222222 |
  grep -qx 'production_release_activated release=2222222'
[[ "$(readlink -f "$ROOT/opt/waw/current")" == "$release_root/2222222" ]]
[[ "$(readlink -f "$ROOT/opt/waw/previous")" == "$release_root/1111111" ]]

"$SCRIPT_DIR/manage-production-release.sh" rollback 2222222 |
  grep -qx 'production_release_rolled_back release=1111111'
[[ "$(readlink -f "$ROOT/opt/waw/current")" == "$release_root/1111111" ]]

mkdir -p "$ROOT/outside"
ln -sfn "$ROOT/outside" "$ROOT/opt/waw/current"
if "$SCRIPT_DIR/manage-production-release.sh" activate 2222222 >/dev/null 2>&1; then
  echo outside_current_was_accepted >&2
  exit 1
fi
echo production_release_manager_test_passed
