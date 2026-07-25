import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adminCommandFeatureEnabled,
  shutdownBotFeatures,
  startAdminCommandServerFeature,
} from "./admin-command-feature.ts";

test("admin command IPC feature is disabled by default and accepts only exact flags", () => {
  assert.equal(adminCommandFeatureEnabled(undefined), false);
  assert.equal(adminCommandFeatureEnabled("0"), false);
  assert.equal(adminCommandFeatureEnabled("1"), true);
  assert.throws(() => adminCommandFeatureEnabled("true"));
});

test("disabled or duplicate bot never creates or listens on the admin socket", async () => {
  let creates = 0;
  const createServer = () => {
    creates += 1;
    return { async listen() {}, async close() {} };
  };
  for (const state of [
    { enabled: false, duplicateBot: false },
    { enabled: true, duplicateBot: true },
  ]) {
    assert.equal(await startAdminCommandServerFeature({
      ...state,
      createServer,
      async execute() {
        throw new Error("not reached");
      },
    }), undefined);
  }
  assert.equal(creates, 0);
});

test("starts after singleton acceptance and shuts transport before gateway and database", async () => {
  const calls: string[] = [];
  const admin = await startAdminCommandServerFeature({
    enabled: true,
    duplicateBot: false,
    createServer: () => ({
      async listen() { calls.push("admin.listen"); },
      async close() { calls.push("admin.close"); },
    }),
    async execute() {
      throw new Error("not invoked");
    },
  });
  await shutdownBotFeatures({
    ...(admin === undefined ? {} : { adminCommand: admin }),
    memberRole: { async close() { calls.push("member.close"); } },
    async shutdownBot() { calls.push("bot.shutdown"); },
    async closeDatabase() { calls.push("database.close"); },
  });
  assert.deepEqual(calls, [
    "admin.listen",
    "admin.close",
    "member.close",
    "bot.shutdown",
    "database.close",
  ]);
});
