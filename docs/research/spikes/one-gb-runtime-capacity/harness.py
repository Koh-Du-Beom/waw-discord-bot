import json
import resource
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 5
if seconds < 1:
    raise ValueError("duration must be positive seconds")

started = time.monotonic()
seen = set()
for event in range(10_000):
    seen.add(event % 9_000)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/health", "/status", "/settings"):
            self.send_error(404)
            return
        body = json.dumps({"ok": True, "applied": len(seen)}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
latencies = []
errors = 0
requests = 0
paths = ("/health", "/status", "/settings")
scheduler_delays = []
rss_samples = []
monitor_done = threading.Event()


def monitor_scheduler():
    expected = time.monotonic()
    while not monitor_done.wait(0.01):
        expected += 0.01
        now = time.monotonic()
        scheduler_delays.append(max(0, (now - expected) * 1000))
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        rss_samples.append(rss / 1024 / 1024 if sys.platform == "darwin" else rss / 1024)
        expected = now


def request(path):
    before = time.monotonic()
    failed = 0
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}{path}", timeout=2) as response:
            failed = response.status != 200
            response.read()
    except Exception:
        failed = 1
    return (time.monotonic() - before) * 1000, failed


threading.Thread(target=monitor_scheduler, daemon=True).start()

with ThreadPoolExecutor(max_workers=5) as pool:
    while time.monotonic() - started < seconds:
        batch = list(pool.map(request, (paths[(requests + offset) % 3] for offset in range(5))))
        latencies.extend(item[0] for item in batch)
        errors += sum(item[1] for item in batch)
        requests += 5
        time.sleep(2.5)

monitor_done.set()
server.shutdown()
latencies.sort()
scheduler_delays.sort()
percentile = lambda values, fraction: values[max(0, int(len(values) * fraction + 0.999999) - 1)] if values else 0
rss_samples.sort()
print(json.dumps({
    "runtime": sys.version.split()[0],
    "duration_seconds": time.monotonic() - started,
    "input_events": 10_000,
    "duplicate_events": 1_000,
    "applied_events": len(seen),
    "requests": requests,
    "errors": errors,
    "error_rate": errors / requests if requests else 1,
    "http_p95_ms": percentile(latencies, 0.95),
    "scheduler_p99_ms": percentile(scheduler_delays, 0.99),
    "rss_p95_mib": percentile(rss_samples, 0.95),
}))
