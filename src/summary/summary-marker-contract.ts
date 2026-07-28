import type { SummarySections } from "./conversation-summary.ts";

export type SummarySection = keyof SummarySections;

export interface SummaryMarkerExpectation {
  readonly marker: string;
  readonly section: SummarySection;
}

export interface SummaryMarkerCounts {
  readonly omissionCount: number;
  readonly duplicateCount: number;
  readonly wrongSectionCount: number;
  readonly unmarkedItemCount: number;
}

export const SUMMARY_MARKER_INSTRUCTIONS =
  "입력에 [WAW:CORE:...], [WAW:DECISION:...], [WAW:ACTION:...], " +
  "[WAW:UNRESOLVED:...] 형식의 합성 검증 marker가 있으면 문자 하나도 바꾸지 " +
  "말고 각각 정확히 한 번 출력한다. CORE marker는 coreDiscussion, DECISION " +
  "marker는 decisions, ACTION marker는 actionItems, UNRESOLVED marker는 " +
  "unresolved 섹션에만 둔다. marker가 하나라도 있는 입력에서는 모든 출력 " +
  "항목에 입력에 있던 marker를 정확히 하나 포함하고, 입력에 없던 marker나 " +
  "marker 없는 항목을 만들지 않는다.";

const SECTIONS: readonly SummarySection[] = [
  "coreDiscussion",
  "decisions",
  "actionItems",
  "unresolved",
];

export function evaluateSummaryMarkers(
  sections: SummarySections,
  expectations: readonly SummaryMarkerExpectation[],
): SummaryMarkerCounts {
  const expectedMarkers = new Set<string>();
  for (const expectation of expectations) {
    if (
      expectation.marker.length === 0 ||
      expectedMarkers.has(expectation.marker)
    ) {
      throw new Error("summary_marker_expectation_invalid");
    }
    expectedMarkers.add(expectation.marker);
  }

  let omissionCount = 0;
  let duplicateCount = 0;
  let wrongSectionCount = 0;
  let unmarkedItemCount = 0;

  for (const expectation of expectations) {
    let occurrences = 0;
    for (const section of SECTIONS) {
      for (const item of sections[section]) {
        const itemOccurrences = countLiteral(item, expectation.marker);
        occurrences += itemOccurrences;
        if (section !== expectation.section) {
          wrongSectionCount += itemOccurrences;
        }
      }
    }
    if (occurrences === 0) omissionCount += 1;
    if (occurrences > 1) duplicateCount += occurrences - 1;
  }

  for (const section of SECTIONS) {
    for (const item of sections[section]) {
      if (![...expectedMarkers].some((marker) => item.includes(marker))) {
        unmarkedItemCount += 1;
      }
    }
  }

  return {
    omissionCount,
    duplicateCount,
    wrongSectionCount,
    unmarkedItemCount,
  };
}

function countLiteral(value: string, marker: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }
  return count;
}
