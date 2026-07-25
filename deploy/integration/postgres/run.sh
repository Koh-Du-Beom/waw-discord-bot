#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
image="waw-postgres-integration-$$"

cleanup() {
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -q -t "$image" \
  -f "$ROOT/deploy/integration/postgres/Dockerfile" "$ROOT" >/dev/null
docker run --rm "$image"

echo postgres_17_full_test_passed
