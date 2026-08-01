import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const handoff = await readFile(
  "docs/operations/plan-0016-game-dashboard-production-gate-handoff-2026-08-01.md",
  "utf8",
);
const runbook = await readFile(
  "docs/operations/game-enforcement-dashboard-runbook.md",
  "utf8",
);
const migration = await readFile(
  "migrations/0012_game_incident_admin_result.sql",
);
const webUnit = await readFile("deploy/systemd/waw-web.service", "utf8");
const botUnit = await readFile("deploy/systemd/waw-bot.service", "utf8");

test("game dashboard handoff separates every production authority gate", () => {
  assert.match(handoff, /Status: Prepared, not approved/u);
  for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D"]) {
    assert.match(handoff, new RegExp(`${gate}[^]*Not approved`, "u"));
  }
  assert.match(handoff, /Gate A는[\s\S]*migration, deploy, flag 변경이나 restart를 승인하지 않는다/u);
  assert.match(handoff, /Gate B는 release deploy나[\s\S]*IPC activation을 승인하지 않는다/u);
  assert.match(handoff, /Gate C는 IPC flag 활성화를 승인하지 않는다/u);
  assert.match(handoff, /First real incident mutation: Not approved/u);
});

test("handoff pins migration bytes and preserves default-off capability units", () => {
  const sha256 = createHash("sha256").update(migration).digest("hex");
  assert.equal(
    sha256,
    "188395af5cf3cbc55b3ca796143f3be9f5ac9381b7df9fcddb191bd9a24db07c",
  );
  assert.match(handoff, new RegExp(sha256, "u"));
  assert.match(webUnit, /^Environment=WAW_ADMIN_COMMAND_IPC_ENABLED=0$/mu);
  assert.match(botUnit, /^Environment=WAW_ADMIN_COMMAND_IPC_ENABLED=0$/mu);
  assert.match(webUnit, /^SupplementaryGroups=waw-member-role waw-admin-command$/mu);
  assert.match(botUnit, /^SupplementaryGroups=waw-admin-command$/mu);
});

test("runbook keeps rollback read-only and evidence non-sensitive", () => {
  assert.match(runbook, /down SQL을 실행하지 않고 남긴다/u);
  assert.match(runbook, /Web에 game write grant를[\s\S]*금지/u);
  assert.match(runbook, /실제 사건 mutation을 smoke test로 만들지 않는다/u);
  assert.match(runbook, /PUUID[\s\S]*정정 사유[\s\S]*운영 로그에 기록하지 않는다/u);
});
