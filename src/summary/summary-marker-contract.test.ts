import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSummaryMarkers,
  SUMMARY_MARKER_INSTRUCTIONS,
  type SummaryMarkerExpectation,
} from "./summary-marker-contract.ts";

const expected: readonly SummaryMarkerExpectation[] = [
  { marker: "[WAW:CORE:7M2K]", section: "coreDiscussion" },
  { marker: "[WAW:DECISION:4P9R]", section: "decisions" },
  { marker: "[WAW:ACTION:8T3N]", section: "actionItems" },
  { marker: "[WAW:UNRESOLVED:6V5Q]", section: "unresolved" },
];

test("defines the marker preservation and section ownership contract for the prompt", () => {
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /문자 하나도 바꾸지/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /정확히 한 번/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /CORE.*coreDiscussion/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /DECISION.*decisions/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /ACTION.*actionItems/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /UNRESOLVED.*unresolved/u);
  assert.match(SUMMARY_MARKER_INSTRUCTIONS, /모든 출력 항목/u);
});

test("reports zero counts for a conforming fake response", () => {
  assert.deepEqual(evaluateSummaryMarkers({
    coreDiscussion: ["합성 토론 [WAW:CORE:7M2K]"],
    decisions: ["합성 결정 [WAW:DECISION:4P9R]"],
    actionItems: ["합성 할 일 [WAW:ACTION:8T3N]"],
    unresolved: ["합성 질문 [WAW:UNRESOLVED:6V5Q]"],
  }, expected), {
    omissionCount: 0,
    duplicateCount: 0,
    wrongSectionCount: 0,
    unmarkedItemCount: 0,
  });
});

test("distinguishes omission without returning response content", () => {
  const result = evaluateSummaryMarkers({
    coreDiscussion: [],
    decisions: ["합성 결정 [WAW:DECISION:4P9R]"],
    actionItems: ["합성 할 일 [WAW:ACTION:8T3N]"],
    unresolved: ["합성 질문 [WAW:UNRESOLVED:6V5Q]"],
  }, expected);
  assert.deepEqual(result, {
    omissionCount: 1,
    duplicateCount: 0,
    wrongSectionCount: 0,
    unmarkedItemCount: 0,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "duplicateCount",
    "omissionCount",
    "unmarkedItemCount",
    "wrongSectionCount",
  ]);
});

test("distinguishes duplicate marker occurrences", () => {
  assert.deepEqual(evaluateSummaryMarkers({
    coreDiscussion: [
      "합성 토론 [WAW:CORE:7M2K]",
      "중복 토론 [WAW:CORE:7M2K]",
    ],
    decisions: ["합성 결정 [WAW:DECISION:4P9R]"],
    actionItems: ["합성 할 일 [WAW:ACTION:8T3N]"],
    unresolved: ["합성 질문 [WAW:UNRESOLVED:6V5Q]"],
  }, expected), {
    omissionCount: 0,
    duplicateCount: 1,
    wrongSectionCount: 0,
    unmarkedItemCount: 0,
  });
});

test("distinguishes a marker assigned to the wrong section", () => {
  assert.deepEqual(evaluateSummaryMarkers({
    coreDiscussion: ["합성 토론 [WAW:DECISION:4P9R]"],
    decisions: ["합성 결정 [WAW:CORE:7M2K]"],
    actionItems: ["합성 할 일 [WAW:ACTION:8T3N]"],
    unresolved: ["합성 질문 [WAW:UNRESOLVED:6V5Q]"],
  }, expected), {
    omissionCount: 0,
    duplicateCount: 0,
    wrongSectionCount: 2,
    unmarkedItemCount: 0,
  });
});

test("distinguishes an output item with no expected marker", () => {
  assert.deepEqual(evaluateSummaryMarkers({
    coreDiscussion: [
      "합성 토론 [WAW:CORE:7M2K]",
      "marker 없는 합성 추가 사실",
    ],
    decisions: ["합성 결정 [WAW:DECISION:4P9R]"],
    actionItems: ["합성 할 일 [WAW:ACTION:8T3N]"],
    unresolved: ["합성 질문 [WAW:UNRESOLVED:6V5Q]"],
  }, expected), {
    omissionCount: 0,
    duplicateCount: 0,
    wrongSectionCount: 0,
    unmarkedItemCount: 1,
  });
});
