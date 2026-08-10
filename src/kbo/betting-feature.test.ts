import assert from "node:assert/strict";
import test from "node:test";

import { kboBettingFeatureEnabled } from "./betting-feature.ts";

test("KBO betting requires exact feature and rights flags and is default-off", () => {
  assert.equal(kboBettingFeatureEnabled(undefined, undefined), false);
  assert.equal(kboBettingFeatureEnabled("1", "0"), false);
  assert.equal(kboBettingFeatureEnabled("0", "1"), false);
  assert.equal(kboBettingFeatureEnabled("1", "1"), true);
  assert.throws(() => kboBettingFeatureEnabled("true", "1"), /invalid KBO betting/u);
  assert.throws(() => kboBettingFeatureEnabled("1", "yes"), /invalid KBO data rights/u);
});
