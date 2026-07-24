import assert from "node:assert/strict";
import test from "node:test";

import { createBotRuntime, createWebRuntime, type LocalCommandService } from "./capabilities.ts";

test("web runtime receives only the local command capability", () => {
  const submitted: string[] = [];
  const commandService: LocalCommandService = {
    submit(input): void {
      submitted.push(input.operationId);
    },
  };
  const webRuntime = createWebRuntime(commandService);

  webRuntime.submitCommand({
    actorId: "discord-user-1",
    authorizationTier: "operator",
    operationId: "operation-0002",
  });

  assert.deepEqual(submitted, ["operation-0002"]);
  assert.equal("botToken" in webRuntime, false);
  assert.equal("readCurrentRole" in webRuntime, false);
});

test("bot runtime keeps its injected token out of the public capability", () => {
  const botRuntime = createBotRuntime("synthetic-token-not-a-secret", {
    readCurrentRole: () => "administrator",
  });

  assert.equal(botRuntime.isConfigured(), true);
  assert.equal(botRuntime.readCurrentRole("discord-user-1"), "administrator");
  assert.equal("botToken" in botRuntime, false);
  assert.equal("submitCommand" in botRuntime, false);
});

test("bot runtime rejects an empty injected token", () => {
  assert.throws(
    () => createBotRuntime("", { readCurrentRole: () => undefined }),
    /bot token must be injected/,
  );
});
