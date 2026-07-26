import assert from "node:assert/strict";
import test from "node:test";

import { WAW_SLASH_COMMANDS } from "./slash-commands.ts";

test("defines the approved command tree with Korean descriptions", () => {
  assert.deepEqual(WAW_SLASH_COMMANDS.map((command) => command.name), [
    "도움말",
    "요약",
    "라이엇계정",
    "몰랭검거",
  ]);
  const subcommands = WAW_SLASH_COMMANDS.flatMap((command) =>
    (command.options ?? []).flatMap((option) =>
      "options" in option ? [option.name] : [],
    ),
  );
  assert.deepEqual(subcommands, ["연결", "목록", "연결해제", "현황", "정정", "취소"]);
  assert.equal(JSON.stringify(WAW_SLASH_COMMANDS).includes("관리자"), true);
});
