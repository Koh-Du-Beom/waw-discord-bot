import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPTED_OBSERVATION_POLICY,
  compareGameEvidence,
  riotGameKey,
} from "./observation-state.ts";

test("keeps unknown separate and applies five-minute grace plus two-minute interruption", () => {
  const started = new Date("2026-07-25T00:00:00Z");
  assert.equal(
    compareGameEvidence(
      { riot: "unknown", goLive: "inactive", gameStartedAt: started },
      new Date("2026-07-25T00:10:00Z"),
      ACCEPTED_OBSERVATION_POLICY,
    ),
    "unknown",
  );
  assert.equal(
    compareGameEvidence(
      { riot: "active", goLive: "inactive", gameStartedAt: started },
      new Date("2026-07-25T00:04:59.999Z"),
      ACCEPTED_OBSERVATION_POLICY,
    ),
    "grace",
  );
  assert.equal(
    compareGameEvidence(
      {
        riot: "active",
        goLive: "inactive",
        gameStartedAt: started,
        goLiveInterruptedAt: new Date("2026-07-25T00:05:00Z"),
      },
      new Date("2026-07-25T00:06:59.999Z"),
      ACCEPTED_OBSERVATION_POLICY,
    ),
    "interrupted",
  );
  assert.equal(
    compareGameEvidence(
      {
        riot: "active",
        goLive: "inactive",
        gameStartedAt: started,
        goLiveInterruptedAt: new Date("2026-07-25T00:05:00Z"),
      },
      new Date("2026-07-25T00:07:00Z"),
      ACCEPTED_OBSERVATION_POLICY,
    ),
    "violation",
  );
  assert.equal(riotGameKey("KR", "123"), "KR:123");
});
