import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardQuotaEnabled,
  summaryQuotaEnforcementEnabled,
} from "./quota-feature.ts";

for (const [name, enabled] of [
  ["summary quota enforcement", summaryQuotaEnforcementEnabled],
  ["dashboard quota", dashboardQuotaEnabled],
] as const) {
  test(`${name} is default-off and accepts only the exact enabled value`, () => {
    assert.equal(enabled(undefined), false);
    assert.equal(enabled(""), false);
    assert.equal(enabled("0"), false);
    assert.equal(enabled("true"), false);
    assert.equal(enabled("01"), false);
    assert.equal(enabled("1"), true);
  });
}
