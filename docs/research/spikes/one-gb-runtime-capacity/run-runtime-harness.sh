#!/bin/sh
set -eu

runtime=${1:?usage: run-runtime-harness.sh typescript|python [seconds]}
seconds=${2:-3600}
case "$runtime" in
  typescript) node harness.mjs "$seconds" ;;
  python) python3 harness.py "$seconds" ;;
  *) echo "unknown runtime: $runtime" >&2; exit 2 ;;
esac
