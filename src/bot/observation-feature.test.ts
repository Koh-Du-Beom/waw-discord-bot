import assert from "node:assert/strict";
import test from "node:test";

import {
  gameAlertChannelId,
  observationFeatureEnabled,
} from "./observation-feature.ts";

test("keeps game observation disabled by default and accepts only exact flags", () => {
  assert.equal(observationFeatureEnabled(undefined), false);
  assert.equal(observationFeatureEnabled("0"), false);
  assert.equal(observationFeatureEnabled("1"), true);
  assert.throws(() => observationFeatureEnabled("true"));
  assert.throws(() => observationFeatureEnabled(""));
});

test("requires an exact alert channel when observation is enabled", () => {
  assert.equal(gameAlertChannelId(undefined, false), undefined);
  assert.equal(gameAlertChannelId("ignored", false), undefined);
  assert.equal(
    gameAlertChannelId("12345678901234567", true),
    "12345678901234567",
  );
  assert.throws(() => gameAlertChannelId(undefined, true));
  assert.throws(() => gameAlertChannelId("channel", true));
});
