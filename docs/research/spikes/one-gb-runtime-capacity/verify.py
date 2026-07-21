import json
import sys

result = json.loads(sys.stdin.read())
application_only = "--application-only" in sys.argv[1:]


def at_most(key, limit):
    value = result.get(key)
    return isinstance(value, (int, float)) and value <= limit


checks = {
    "event accounting": result.get("input_events") == 10_000 and result.get("duplicate_events") == 1_000 and result.get("applied_events") == 9_000,
    "requests completed": isinstance(result.get("requests"), int) and result["requests"] > 0,
    "request rate 1.95..2.05/s": isinstance(result.get("request_rate_per_second"), (int, float)) and 1.95 <= result["request_rate_per_second"] <= 2.05,
    "all endpoints exercised": isinstance(result.get("endpoint_requests"), dict) and all(result["endpoint_requests"].get(path, 0) > 0 for path in ("/health", "/status", "/settings")),
    "health endpoint failures = 0": isinstance(result.get("endpoint_errors"), dict) and result["endpoint_errors"].get("/health") == 0,
    "error rate <= 0.1%": at_most("error_rate", 0.001),
    "HTTP p95 <= 500ms": at_most("http_p95_ms", 500),
    "scheduler p99 <= 100ms": at_most("scheduler_p99_ms", 100),
    "application RSS p95 <= 650MiB": at_most("rss_p95_mib", 650),
}
if not application_only:
    checks.update({
        "process exited normally": result.get("process_exit_code") == 0,
        "duration reached target": result.get("duration_met") is True,
        "system available memory >= 128MiB or low < 60s": at_most("low_available_memory_max_seconds", 59),
        "system CPU p95 <= 70%": at_most("system_cpu_p95_percent", 70),
        "no swap-out growth": result.get("swap_out_pages") == 0,
        "kernel OOM kills = 0": result.get("oom_kill_count") == 0,
        "runner restarts = 0": result.get("process_restart_count") == 0,
    })
for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
