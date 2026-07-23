import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

test("reads a file credential, retries 429 once, and preserves state on delivery failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "waw-monitor-test."));
  const credentialDirectory = join(root, "credentials");
  const fixturePath = join(root, "fixture.json");
  const successState = join(root, "success-state.json");
  const failureState = join(root, "failure-state.json");
  const requests: Buffer[] = [];
  let rateAttempts = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks));
      if (request.url?.startsWith("/rate") && rateAttempts++ === 0) {
        response.writeHead(429, { "retry-after": "0" }).end();
      } else {
        response.writeHead(request.url?.startsWith("/fail") ? 500 : 204).end();
      }
    });
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fake_server_unavailable");
    const port = address.port;
    await mkdir(credentialDirectory);
    await writeFile(
      fixturePath,
      JSON.stringify({
        now: "2026-07-23T00:00:00.000Z",
        observedAt: "2026-07-23T00:00:00.000Z",
        serviceVersion: "0.1.0",
        expectedUnits: { "waw-web.service": false },
        runtimeHealth: "healthy",
        lastBackupPublishedAt: "2026-07-22T23:00:00.000Z",
        certificateExpiresAt: null,
        journalUsedBytes: 100,
        journalMaxBytes: 1024 ** 3,
        filesystemFreeBytes: 6 * 1024 ** 3,
        journalSuppressionConsecutive: 0,
      }),
    );

    const syntheticSecret = "SYNTHETIC_WEBHOOK_SECRET";
    await writeFile(
      join(credentialDirectory, "discord-webhook"),
      `http://127.0.0.1:${port}/rate/${syntheticSecret}\n`,
    );
    const success = await runMonitor(credentialDirectory, fixturePath, successState);
    assert.equal(success.code, 0);
    assert.match(success.stdout, /^monitor_complete notifications=1\n$/);
    assert.equal(`${success.stdout}${success.stderr}`.includes(syntheticSecret), false);
    assert.equal(requests.length, 2);
    const payload = JSON.parse(requests[0]?.toString("utf8") ?? "") as {
      content: string;
      allowed_mentions: { parse: unknown[] };
    };
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.content.includes("@"), false);
    assert.ok(requests[0]!.byteLength <= 1_800);
    assert.match(await readFile(successState, "utf8"), /service\.waw-web\.service/);

    await writeFile(
      join(credentialDirectory, "discord-webhook"),
      `http://127.0.0.1:${port}/fail/${syntheticSecret}\n`,
    );
    const failure = await runMonitor(credentialDirectory, fixturePath, failureState);
    assert.equal(failure.code, 1);
    assert.equal(failure.stderr, "monitor_failed\n");
    await assert.rejects(readFile(failureState), { code: "ENOENT" });
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

function runMonitor(
  credentialDirectory: string,
  fixturePath: string,
  statePath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "run-monitor.ts")], {
      env: {
        ...process.env,
        CREDENTIALS_DIRECTORY: credentialDirectory,
        WAW_MONITOR_ALLOW_FIXTURE: "1",
        WAW_MONITOR_ALLOW_LOOPBACK: "1",
        WAW_MONITOR_FIXTURE: fixturePath,
        WAW_MONITOR_STATE: statePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => (stdout += value));
    child.stderr.setEncoding("utf8").on("data", (value) => (stderr += value));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
