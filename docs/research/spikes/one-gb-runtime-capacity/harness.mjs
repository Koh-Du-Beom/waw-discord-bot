import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import fs from "node:fs";

const seconds = Number(process.argv[2] ?? 5);
if (!Number.isFinite(seconds) || seconds < 1) throw new Error("duration must be positive seconds");

const started = Date.now();
const storePath = process.env.WAW_SYNTHETIC_STORE;
if (!storePath || fs.statSync(storePath).size !== 40 * 1024 * 1024) throw new Error("40MiB synthetic store is required");
const store = fs.openSync(storePath, "r+");
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
const endpointRequests = { "/health": 0, "/status": 0, "/settings": 0 };
const endpointErrors = { "/health": 0, "/status": 0, "/settings": 0 };
const rssSamples = [];
const rssTimer = setInterval(() => {
  rssSamples.push(process.memoryUsage().rss / 1024 / 1024);
}, 100);

async function request(path) {
  const before = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.applied !== 9_000) {
      errors++;
      endpointErrors[path]++;
    }
  } catch {
    errors++;
    endpointErrors[path]++;
  }
  requests++;
  endpointRequests[path]++;
  latencies.push(performance.now() - before);
}

const paths = ["/health", "/status", "/settings"];
let tick = 0;
const workloadStarted = performance.now();
let nextBatch = workloadStarted;
while (performance.now() - workloadStarted < seconds * 1000) {
  const buffer = Buffer.alloc(4096, tick % 256);
  const offset = (tick * buffer.length) % (40 * 1024 * 1024 - buffer.length);
  fs.writeSync(store, buffer, 0, buffer.length, offset);
  fs.readSync(store, buffer, 0, buffer.length, offset);
  await Promise.all(Array.from({ length: 5 }, (_, i) => request(paths[(tick + i) % paths.length])));
  tick++;
  nextBatch += 2500;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextBatch - performance.now())));
}

clearInterval(rssTimer);
delays.disable();
await new Promise((resolve) => server.close(resolve));
fs.closeSync(store);
latencies.sort((a, b) => a - b);
rssSamples.sort((a, b) => a - b);
const percentile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
console.log(JSON.stringify({
  runtime: `node ${process.version}`,
  duration_seconds: (Date.now() - started) / 1000,
  input_events: 10_000,
  duplicate_events: 1_000,
  applied_events: applied,
  requests,
  request_rate_per_second: requests / seconds,
  endpoint_requests: endpointRequests,
  endpoint_errors: endpointErrors,
  errors,
  error_rate: requests ? errors / requests : 1,
  http_p95_ms: percentile(latencies, 0.95),
  scheduler_p99_ms: delays.percentile(99) / 1e6,
  rss_p95_mib: percentile(rssSamples, 0.95),
}));
