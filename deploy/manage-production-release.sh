#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-}"
RELEASE_ID="${2:-}"
ROOT="${WAW_INSTALL_ROOT:-/}"
RELEASE_ROOT="${WAW_RELEASE_ROOT:-$(if [[ "$ROOT" == / ]]; then echo /opt/waw/releases; else echo "${ROOT%/}/opt/waw/releases"; fi)}"
CURRENT="${WAW_CURRENT_LINK:-$(if [[ "$ROOT" == / ]]; then echo /opt/waw/current; else echo "${ROOT%/}/opt/waw/current"; fi)}"
PREVIOUS="${WAW_PREVIOUS_LINK:-$(if [[ "$ROOT" == / ]]; then echo /opt/waw/previous; else echo "${ROOT%/}/opt/waw/previous"; fi)}"

[[ "$ACTION" == stage || "$ACTION" == activate || "$ACTION" == rollback ]] ||
  { echo invalid_release_action >&2; exit 1; }
[[ "$RELEASE_ID" =~ ^[a-f0-9]{7,64}$ ]] ||
  { echo invalid_release_id >&2; exit 1; }

release="$RELEASE_ROOT/$RELEASE_ID"

atomic_link() {
  local destination="$1" target="$2"
  local temporary="${destination}.new.$$"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$destination"
}

if [[ "$ACTION" == stage ]]; then
  archive="${3:-}"
  expected_sha="${4:-}"
  [[ -f "$archive" && "$expected_sha" =~ ^[a-f0-9]{64}$ ]] ||
    { echo invalid_release_archive >&2; exit 1; }
  actual_sha="$(sha256sum "$archive" | awk '{print $1}')"
  [[ "$actual_sha" == "$expected_sha" ]] ||
    { echo release_archive_hash_mismatch >&2; exit 1; }
  if [[ -e "$release" ]]; then
    [[ -f "$release/.waw-release-sha256" ]] &&
      [[ "$(cat "$release/.waw-release-sha256")" == "$expected_sha" ]] ||
      { echo release_target_conflict >&2; exit 1; }
    echo "production_release_already_staged release=$RELEASE_ID"
    exit 0
  fi
  while IFS= read -r entry; do
    [[ "$entry" != /* && "$entry" != *".."* ]] ||
      { echo unsafe_release_archive_path >&2; exit 1; }
  done < <(tar -tzf "$archive")
  install -d -m 755 "$RELEASE_ROOT"
  temporary="$RELEASE_ROOT/.${RELEASE_ID}.staging.$$"
  trap 'rm -rf -- "$temporary"' EXIT
  install -d -m 755 "$temporary"
  tar -xzf "$archive" -C "$temporary"
  root="$temporary"
  if [[ ! -f "$root/package.json" ]]; then
    entries=("$temporary"/*)
    [[ "${#entries[@]}" == 1 && -f "${entries[0]}/package.json" ]] ||
      { echo release_package_missing >&2; exit 1; }
    root="${entries[0]}"
  fi
  (
    cd "$root"
    npm ci --ignore-scripts
    npm run typecheck
    npm run build
    npm prune --omit=dev
  )
  [[ -r "$root/dist/server/web/main.js" ]] ||
    { echo release_web_entrypoint_missing >&2; exit 1; }
  [[ -r "$root/dist/server/bot/main.js" ]] ||
    { echo release_bot_entrypoint_missing >&2; exit 1; }
  [[ -r "$root/dist/server/persistence/run-migration.js" ]] ||
    { echo release_migration_runner_missing >&2; exit 1; }
  for migration in "$root"/migrations/00*.sql; do
    [[ -f "$migration" ]] ||
      { echo release_migration_source_missing >&2; exit 1; }
    compiled_migration="$root/dist/migrations/$(basename "$migration")"
    [[ -r "$compiled_migration" ]] ||
      { echo release_migration_asset_missing >&2; exit 1; }
    cmp -s "$migration" "$compiled_migration" ||
      { echo release_migration_asset_mismatch >&2; exit 1; }
  done
  [[ -r "$root/dist/web/index.html" ]] ||
    { echo release_web_assets_missing >&2; exit 1; }
  printf '%s\n' "$expected_sha" >"$root/.waw-release-sha256"
  chmod -R a+rX "$root"
  chmod -R a-w "$root"
  chmod u+w "$root"
  mv "$root" "$release"
  chmod a-w "$release"
  trap - EXIT
  [[ "$root" == "$temporary" ]] || rm -rf -- "$temporary"
  echo "production_release_staged release=$RELEASE_ID sha256=$expected_sha"
  exit 0
fi

[[ -d "$release" && -r "$release/.waw-release-sha256" ]] ||
  { echo staged_release_missing >&2; exit 1; }

if [[ "$ACTION" == activate ]]; then
  if [[ -L "$CURRENT" ]]; then
    current_target="$(readlink -f "$CURRENT")"
    [[ "$current_target" == "$RELEASE_ROOT/"* ]] ||
      { echo current_release_outside_root >&2; exit 1; }
    atomic_link "$PREVIOUS" "$current_target"
  fi
  atomic_link "$CURRENT" "$release"
  echo "production_release_activated release=$RELEASE_ID"
  exit 0
fi

[[ -L "$PREVIOUS" ]] || { echo previous_release_missing >&2; exit 1; }
previous_target="$(readlink -f "$PREVIOUS")"
[[ "$previous_target" == "$RELEASE_ROOT/"* && -d "$previous_target" ]] ||
  { echo previous_release_invalid >&2; exit 1; }
restore_previous="${3:-}"
if [[ -n "$restore_previous" ]]; then
  restore_previous="$(readlink -f -- "$restore_previous")"
  [[ "$restore_previous" == "$RELEASE_ROOT/"* &&
     -d "$restore_previous" &&
     "$restore_previous" != "$previous_target" ]] ||
    { echo previous_restore_target_invalid >&2; exit 1; }
fi
atomic_link "$CURRENT" "$previous_target"
[[ -z "$restore_previous" ]] || atomic_link "$PREVIOUS" "$restore_previous"
echo "production_release_rolled_back release=$(basename "$previous_target")"
