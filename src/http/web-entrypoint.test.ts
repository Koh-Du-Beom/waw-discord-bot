import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWebListenConfiguration,
  startDashboardWebServer,
  type DashboardListener,
} from "./web-entrypoint.ts";

test("accepts only a fixed loopback listener and bounded port", () => {
  assert.deepEqual(
    parseWebListenConfiguration({
      WAW_WEB_HOST: "127.0.0.1",
      WAW_WEB_PORT: "4310",
    }),
    { host: "127.0.0.1", port: 4310 },
  );
  for (const input of [
    { WAW_WEB_HOST: "0.0.0.0", WAW_WEB_PORT: "4310" },
    { WAW_WEB_HOST: "::", WAW_WEB_PORT: "4310" },
    { WAW_WEB_HOST: "127.0.0.1", WAW_WEB_PORT: "0" },
    { WAW_WEB_HOST: "127.0.0.1", WAW_WEB_PORT: "not-a-port" },
  ]) {
    assert.throws(
      () => parseWebListenConfiguration(input),
      /web-listen-configuration-invalid/,
    );
  }
});

test("starts the injected server on loopback and closes it on shutdown", async () => {
  const calls: unknown[] = [];
  const listener: DashboardListener = {
    async listen(input) {
      calls.push(["listen", input]);
      return "http://127.0.0.1:4310";
    },
    async close() {
      calls.push(["close"]);
    },
  };
  const running = await startDashboardWebServer(listener, {
    host: "127.0.0.1",
    port: 4310,
  });
  assert.equal(running.address, "http://127.0.0.1:4310");
  await running.close();
  assert.deepEqual(calls, [
    ["listen", { host: "127.0.0.1", port: 4310 }],
    ["close"],
  ]);
});
