import assert from "node:assert/strict";
import test from "node:test";

import { CommandFailure, type CommandRequest } from "../commands/command-handler.ts";
import { KboBetCommandExecutor, KboBettingCommandExecutor } from "./bet-command-executor.ts";

const request: CommandRequest = {
  eventId: "discord:bet-interaction",
  correlationId: "correlation",
  actorId: "22345678901234567",
  guildId: "12345678901234567",
  channelId: "32345678901234567",
  isThread: false,
  commandName: "베팅 하기",
  options: {
    경기: "game-id-0001",
    결과: "home_win",
    금액: "1000",
    홈점수: "3",
    원정점수: "2",
  },
  signal: new AbortController().signal,
};

test("places one normalized KBO bet and formats only the fixed success fields", async () => {
  const inputs: unknown[] = [];
  const executor = new KboBetCommandExecutor(
    {
      async place(input) {
        inputs.push(input);
        return {
          status: "placed",
          betId: input.betId,
          gameId: input.gameId,
          marketVersion: 1n,
          stakeDate: "2026-08-10",
        };
      },
    },
    true,
    () => "11111111-1111-4111-8111-111111111111",
    () => new Date("2026-08-10T00:42:00Z"),
  );

  assert.equal(
    await executor.execute(request),
    "**베팅 접수 완료**\n경기: game-id-0001\n선택: 홈 승\n금액: 1,000 크레딧",
  );
  assert.deepEqual(inputs, [{
    operationId: request.eventId,
    betId: "kbo_bet:11111111-1111-4111-8111-111111111111",
    guildId: request.guildId,
    discordUserId: request.actorId,
    gameId: "game-id-0001",
    rightsStatus: "authorized",
    stake: 1_000n,
    prediction: "home_win",
    predictedHomeScore: 3,
    predictedAwayScore: 2,
    placedAt: new Date("2026-08-10T00:42:00Z"),
  }]);
});

test("keeps KBO betting default-off and maps denials without store data", async () => {
  let calls = 0;
  const disabled = new KboBetCommandExecutor(
    { async place() { calls += 1; throw new Error("must not place"); } },
    false,
    () => "unused",
    () => new Date(),
  );
  await assert.rejects(
    disabled.execute(request),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_betting_unavailable",
  );
  assert.equal(calls, 0);

  const denied = new KboBetCommandExecutor(
    { async place() { return { status: "denied", reason: "daily_limit_exceeded" }; } },
    true,
    () => "11111111-1111-4111-8111-111111111111",
    () => new Date("2026-08-10T00:42:00Z"),
  );
  await assert.rejects(
    denied.execute(request),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_bet_daily_limit_exceeded",
  );
});

test("rejects malformed KBO bet options and preserves enrollment routing", async () => {
  const executor = new KboBetCommandExecutor(
    { async place() { throw new Error("must not place"); } },
    true,
    () => "unused",
    () => new Date(),
  );
  await assert.rejects(
    executor.execute({ ...request, options: { ...request.options, 원정점수: undefined } }),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_bet_invalid_input",
  );

  const routed: string[] = [];
  const composite = new KboBettingCommandExecutor(
    { async execute() { routed.push("enrollment"); return "가입"; } },
    { async execute() { routed.push("bet"); return "베팅"; } },
    { async execute() { routed.push("query"); return "조회"; } },
    { async execute() { routed.push("ranking"); return "랭킹"; } },
  );
  assert.equal(await composite.execute({ ...request, commandName: "베팅 가입" }), "가입");
  assert.equal(await composite.execute(request), "베팅");
  assert.equal(await composite.execute({ ...request, commandName: "베팅 내역" }), "조회");
  assert.equal(await composite.execute({ ...request, commandName: "랭킹 크레딧" }), "랭킹");
  assert.deepEqual(routed, ["enrollment", "bet", "query", "ranking"]);
});
