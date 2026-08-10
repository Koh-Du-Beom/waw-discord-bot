import assert from "node:assert/strict";
import test from "node:test";

import { WAW_SLASH_COMMANDS } from "./slash-commands.ts";

test("defines the approved command tree with Korean descriptions", () => {
  assert.deepEqual(WAW_SLASH_COMMANDS.map((command) => command.name), [
    "도움말",
    "요약",
    "라이엇계정",
    "몰랭검거",
    "크레딧",
    "베팅",
    "랭킹",
  ]);
  const subcommands = WAW_SLASH_COMMANDS.flatMap((command) =>
    (command.options ?? []).map((option) => option.name),
  );
  assert.deepEqual(subcommands, [
    "최근",
    "직접",
    "연결",
    "목록",
    "연결해제",
    "현황",
    "정정",
    "취소",
    "내정보",
    "받기",
    "가입",
    "하기",
    "경기",
    "내역",
    "크레딧",
    "결과",
    "점수",
    "적중률",
  ]);
  const enrollment = (WAW_SLASH_COMMANDS.find(({ name }) => name === "베팅")
    ?.options?.[0] as { options?: Array<{ name: string; required?: boolean; description: string }> })
    .options?.[0];
  assert.equal(enrollment?.name, "동의");
  assert.equal(enrollment?.required, true);
  assert.match(enrollment?.description ?? "", /비현금.*공개 랭킹.*1년.*30일/u);
  assert.equal(JSON.stringify(WAW_SLASH_COMMANDS).includes("관리자"), true);
});
