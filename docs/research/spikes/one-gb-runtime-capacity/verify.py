import json
import sys

result = json.loads(sys.stdin.read())
checks = {
    "event accounting": result["input_events"] == 10_000 and result["duplicate_events"] == 1_000 and result["applied_events"] == 9_000,
    "requests completed": result["requests"] > 0,
    "error rate <= 0.1%": result["error_rate"] <= 0.001,
    "HTTP p95 <= 500ms": result["http_p95_ms"] <= 500,
    "scheduler p99 <= 100ms": result["scheduler_p99_ms"] <= 100,
    "peak RSS <= 650MiB": result["peak_rss_mib"] <= 650,
}
for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
