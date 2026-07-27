import assert from "node:assert/strict";
import test from "node:test";

import { summaryProviderEnabled } from "./provider-feature.ts";

test("summary provider is default-off and accepts only exact one", () => {
  for (const value of [undefined, "", "0", "true", "01"]) {
    assert.equal(summaryProviderEnabled(value), false);
  }
  assert.equal(summaryProviderEnabled("1"), true);
});
