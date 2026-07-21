import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";

const seconds = Number(process.argv[2] ?? 5);
if (!Number.isFinite(seconds) || seconds < 1) throw new Error("duration must be positive seconds");

const started = Date.now();
const delays = monitorEventLoopDelay({ resolution: 10 });
const seen = new Set();
let applied = 0;
for (let i = 0; i < 10_000; i++) {
  const id = i % 9_000;
  if (!seen.has(id)) {
    seen.add(id);
    applied++;
  }
}

const server = http.createServer((request, response) => {
  if (!["/health", "/status", "/settings"].includes(request.url)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: true, applied }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
delays.enable();
const { port } = server.address();
const latencies = [];
let requests = 0;
let errors = 0;
let peakRss = 0;
const rssTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 100);

async function request(path) {
  const before = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    if (!response.ok) errors++;
    await response.arrayBuffer();
  } catch {
    errors++;
  }
  requests++;
  latencies.push(performance.now() - before);
}

const paths = ["/health", "/status", "/settings"];
let tick = 0;
while (Date.now() - started < seconds * 1000) {
  await Promise.all(Array.from({ length: 5 }, (_, i) => request(paths[(tick + i) % paths.length])));
  tick++;
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

clearInterval(rssTimer);
delays.disable();
await new Promise((resolve) => server.close(resolve));
latencies.sort((a, b) => a - b);
const percentile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
console.log(JSON.stringify({
  runtime: `node ${process.version}`,
  duration_seconds: (Date.now() - started) / 1000,
  input_events: 10_000,
  duplicate_events: 1_000,
  applied_events: applied,
  requests,
  errors,
  error_rate: requests ? errors / requests : 1,
  http_p95_ms: percentile(latencies, 0.95),
  scheduler_p99_ms: delays.percentile(99) / 1e6,
  peak_rss_mib: peakRss / 1024 / 1024,
}));
