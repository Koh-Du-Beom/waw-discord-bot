import json
import sys

result = json.loads(sys.stdin.read())
application_only = "--application-only" in sys.argv[1:]
checks = {
    "event accounting": result["input_events"] == 10_000 and result["duplicate_events"] == 1_000 and result["applied_events"] == 9_000,
    "requests completed": result["requests"] > 0,
    "error rate <= 0.1%": result["error_rate"] <= 0.001,
    "HTTP p95 <= 500ms": result["http_p95_ms"] <= 500,
    "scheduler p99 <= 100ms": result["scheduler_p99_ms"] <= 100,
    "application RSS p95 <= 650MiB": result["rss_p95_mib"] <= 650,
}
if not application_only:
    checks.update({
        "process exited normally": result["process_exit_code"] == 0,
        "duration reached target": result["duration_met"],
        "system available memory >= 128MiB or low < 60s": result["low_available_memory_max_seconds"] < 60,
        "system CPU p95 <= 70%": result["system_cpu_p95_percent"] <= 70,
        "no swap-out growth": result["swap_out_pages"] == 0,
    })
for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
