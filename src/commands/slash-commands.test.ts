import assert from "node:assert/strict";
import test from "node:test";

import { WAW_SLASH_COMMANDS } from "./slash-commands.ts";

test("defines the approved command tree with Korean descriptions", () => {
  assert.deepEqual(WAW_SLASH_COMMANDS.map((command) => command.name), [
    "도움말",
    "요약",
    "라이엇계정",
    "몰랭검거",
    "크보",
  ]);
  const groups = WAW_SLASH_COMMANDS.find(({ name }) => name === "크보")?.options as Array<{
    name: string;
    options?: Array<{ name: string; options?: Array<{ name: string; required?: boolean; description: string }> }>;
  }>;
  assert.deepEqual(groups.map(({ name }) => name), ["크레딧", "베팅", "랭킹"]);
  assert.deepEqual(
    groups.map(({ options }) => options?.map(({ name }) => name)),
    [
      ["내정보", "받기"],
      ["가입", "하기", "경기", "내역"],
      ["크레딧", "결과", "점수", "적중률"],
    ],
  );
  const enrollment = groups.find(({ name }) => name === "베팅")
    ?.options?.find(({ name }) => name === "가입")?.options?.[0];
  assert.equal(enrollment?.name, "동의");
  assert.equal(enrollment?.required, true);
  assert.match(enrollment?.description ?? "", /비현금.*공개 랭킹.*1년.*30일/u);
  assert.equal(JSON.stringify(WAW_SLASH_COMMANDS).includes("관리자"), true);
});
