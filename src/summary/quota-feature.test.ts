import assert from "node:assert/strict";
import test from "node:test";

import { summaryQuotaEnforcementEnabled } from "./quota-feature.ts";

test("summary quota enforcement is default-off and accepts only exact one", () => {
  assert.equal(summaryQuotaEnforcementEnabled(undefined), false);
  assert.equal(summaryQuotaEnforcementEnabled(""), false);
  assert.equal(summaryQuotaEnforcementEnabled("0"), false);
  assert.equal(summaryQuotaEnforcementEnabled("true"), false);
  assert.equal(summaryQuotaEnforcementEnabled("01"), false);
  assert.equal(summaryQuotaEnforcementEnabled("1"), true);
});
