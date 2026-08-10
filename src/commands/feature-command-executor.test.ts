import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
  type KoreanCommandName,
} from "./command-handler.ts";
import { RoutedFeatureCommandExecutor } from "./feature-command-executor.ts";

const kboCommands: KoreanCommandName[] = [
  "크레딧 내정보",
  "크레딧 받기",
  "베팅 가입",
  "베팅 하기",
  "베팅 경기",
  "베팅 내역",
  "랭킹 크레딧",
  "랭킹 결과",
  "랭킹 점수",
  "랭킹 적중률",
  "크레딧 관리자조정",
];

test("master gate rejects every KBO command before a feature executor runs", () => {
  let calls = 0;
  const delegate: FeatureCommandExecutor = {
    async execute() {
      calls += 1;
      return "ok";
    },
  };
  const router = new RoutedFeatureCommandExecutor(
    delegate,
    delegate,
    delegate,
    delegate,
    false,
  );

  for (const commandName of kboCommands) {
    assert.throws(
      () => router.execute(request(commandName)),
      (error: unknown) => error instanceof CommandFailure &&
        error.reasonCode === "kbo_commands_unavailable",
    );
  }
  assert.equal(calls, 0);
});

test("enabled master gate preserves existing KBO routing", async () => {
  const calls: string[] = [];
  const delegate = (name: string): FeatureCommandExecutor => ({
    async execute() {
      calls.push(name);
      return name;
    },
  });
  const router = new RoutedFeatureCommandExecutor(
    delegate("riot"),
    delegate("game"),
    delegate("credit"),
    delegate("betting"),
    true,
  );

  assert.equal(await router.execute(request("크레딧 받기")), "credit");
  assert.equal(await router.execute(request("베팅 가입")), "betting");
  assert.equal(await router.execute(request("랭킹 크레딧")), "betting");
  assert.deepEqual(calls, ["credit", "betting", "betting"]);
});

function request(commandName: KoreanCommandName): CommandRequest {
  return {
    eventId: "event",
    correlationId: "correlation",
    actorId: "actor",
    guildId: "guild",
    channelId: "channel",
    isThread: false,
    commandName,
    options: {},
    signal: AbortSignal.abort(),
  };
}
