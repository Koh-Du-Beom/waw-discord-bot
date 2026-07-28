import assert from "node:assert/strict";
import test from "node:test";

import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser } from "playwright-core";

import { buildBrowserFixtureServer } from "./browser-fixture-server.ts";

const edgeExecutable =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

test("production SPA has no automatic axe violations and supports keyboard mutation", async () => {
  const app = buildBrowserFixtureServer();
  let browser: Browser | undefined;
  try {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    browser = await chromium.launch(
      process.platform === "win32"
        ? { executablePath: edgeExecutable, headless: true }
        : { headless: true },
    );
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(address, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "운영 현황" }).waitFor();

    const accessibility = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      accessibility.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
      [],
    );

    const checkbox = page.getByRole("checkbox", { name: "서버 요약 기능 사용" });
    await checkbox.focus();
    await page.keyboard.press("Space");
    assert.equal(await checkbox.isChecked(), false);

    const save = page.getByRole("button", { name: "설정 저장" });
    await save.focus();
    await page.keyboard.press("Enter");
    const result = page.getByRole("status", { name: "저장 결과" });
    await result.waitFor();
    assert.match((await result.textContent()) ?? "", /저장했습니다/);
    assert.equal(
      await result.evaluate((element) => element === document.activeElement),
      true,
    );
    assert.match(
      (await page.getByRole("list", { name: "최근 감사 결과" }).textContent()) ?? "",
      /성공/,
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await app.close();
    }
  }
});
