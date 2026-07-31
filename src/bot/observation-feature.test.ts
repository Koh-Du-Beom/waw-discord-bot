import assert from "node:assert/strict";
import test from "node:test";

import {
  gameAlertChannelId,
  observationTimingConfiguration,
  observationFeatureEnabled,
} from "./observation-feature.ts";

test("keeps game observation disabled by default and accepts only exact flags", () => {
  assert.equal(observationFeatureEnabled(undefined), false);
  assert.equal(observationFeatureEnabled("0"), false);
  assert.equal(observationFeatureEnabled("1"), true);
  assert.throws(() => observationFeatureEnabled("true"));
  assert.throws(() => observationFeatureEnabled(""));
});

test("validates Discord voice reconciliation and freshness timing", () => {
  assert.deepEqual(observationTimingConfiguration({}), {
    reconciliationIntervalMilliseconds: 120_000,
    freshnessMilliseconds: 180_000,
  });
  assert.deepEqual(
    observationTimingConfiguration({
      reconciliationInterval: "60000",
      freshness: "120000",
    }),
    {
      reconciliationIntervalMilliseconds: 60_000,
      freshnessMilliseconds: 120_000,
    },
  );
  assert.throws(() =>
    observationTimingConfiguration({
      reconciliationInterval: "30000",
      freshness: "30000",
    }),
  );
  assert.throws(() =>
    observationTimingConfiguration({
      reconciliationInterval: "120000",
      freshness: "300001",
    }),
  );
  assert.throws(() =>
    observationTimingConfiguration({ reconciliationInterval: "1.5" }),
  );
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
