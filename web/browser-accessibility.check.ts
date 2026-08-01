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
    await page.getByRole("heading", { name: "대시보드" }).waitFor();

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

    const gameTab = page.getByRole("button", { name: "몰랭" });
    await gameTab.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "검거 이력" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "필터 적용" }).isEnabled(), true);
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id),
      [],
    );
    const correct = page.getByRole("button", { name: "정정" });
    await correct.focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("변경 사유").fill("브라우저 접근성 정정");
    await page.getByRole("checkbox", { name: /감사 기록/ }).check();
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id),
      [],
    );
    await page.getByRole("button", { name: "확인 후 실행" }).press("Enter");
    await page.getByText("사건을 정정했습니다.").waitFor();

    await page.getByRole("button", { name: "설정" }).click();
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
    await page.getByRole("button", { name: "운영 기록" }).click();
    assert.match((await page.getByText("서버 요약 설정 변경").textContent()) ?? "", /서버 요약/);

    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id),
      [],
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      await app.close();
    }
  }
});

test("Discord login page has no automatic axe violations", async () => {
  const app = buildBrowserFixtureServer({ authenticated: false });
  let browser: Browser | undefined;
  try {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    browser = await chromium.launch(
      process.platform === "win32"
        ? { executablePath: edgeExecutable, headless: true }
        : { headless: true },
    );
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await context.newPage();
    await page.goto(address, { waitUntil: "networkidle" });
    const title = page.getByRole("heading", { name: "Discord 서버와 연결" });
    await title.waitFor();
    assert.equal(await title.evaluate((element) => getComputedStyle(element).whiteSpace), "nowrap");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id),
      [],
    );
  } finally {
    await browser?.close();
    await app.close();
  }
});
