import assert from "node:assert/strict";
import test from "node:test";

import { CommandFailure, type CommandRequest } from "../commands/command-handler.ts";
import { KboBetQueryCommandExecutor } from "./bet-query-command-executor.ts";

const request: CommandRequest = {
  eventId: "discord:query-interaction",
  correlationId: "correlation",
  actorId: "22345678901234567",
  guildId: "12345678901234567",
  channelId: "32345678901234567",
  isThread: false,
  commandName: "베팅 내역",
  options: {},
  signal: new AbortController().signal,
};

test("formats only five recent KBO bets with canonical correction results", async () => {
  const inputs: unknown[] = [];
  const executor = new KboBetQueryCommandExecutor(
    {
      async listOpenGames() { throw new Error("games not requested"); },
      async readRecent(input) {
        inputs.push(input);
        return {
          status: "ok",
          bets: [{
            homeTeamId: "LG",
            awayTeamId: "DOOSAN",
            scheduledStartAt: new Date("2026-08-10T09:30:00Z"),
            prediction: "home_win",
            predictedHomeScore: 5,
            predictedAwayScore: 3,
            stake: 1_000n,
            status: "settled",
            corrected: true,
            actualHomeScore: 5,
            actualAwayScore: 3,
            returnAmount: 3_000n,
            placedAt: new Date("2026-08-10T00:00:00Z"),
          }],
        };
      },
    },
    false,
    () => new Date(),
  );
  const output = await executor.execute(request);
  assert.match(output, /DOOSAN @ LG/u);
  assert.match(output, /홈 승 3:5 · 1,000 크레딧 · 정산\(정정\) · 실제 3:5 · 반환 3,000/u);
  assert.equal(output.includes("settlement"), false);
  assert.deepEqual(inputs, [{ guildId: request.guildId, discordUserId: request.actorId }]);
});

test("gates open games but keeps recent KBO bets readable", async () => {
  let calls = 0;
  const disabled = new KboBetQueryCommandExecutor(
    {
      async listOpenGames() { calls += 1; return []; },
      async readRecent() { return { status: "not_enrolled" }; },
    },
    false,
    () => new Date(),
  );
  await assert.rejects(
    disabled.execute({ ...request, commandName: "베팅 경기" }),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_betting_unavailable",
  );
  assert.equal(calls, 0);
  await assert.rejects(
    disabled.execute(request),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_not_enrolled",
  );
});

test("formats fresh open KBO games with source evidence", async () => {
  const now = new Date("2026-08-10T00:04:00Z");
  const executor = new KboBetQueryCommandExecutor(
    {
      async listOpenGames(input) {
        assert.deepEqual(input, { now });
        return [{
          gameId: "game-id-0001",
          homeTeamId: "LG",
          awayTeamId: "DOOSAN",
          scheduledStartAt: new Date("2026-08-10T09:30:00Z"),
          sourceUpdatedAt: new Date("2026-08-10T00:02:00Z"),
          collectedAt: new Date("2026-08-10T00:03:00Z"),
        }];
      },
      async readRecent() { throw new Error("recent not requested"); },
    },
    true,
    () => now,
  );
  const output = await executor.execute({ ...request, commandName: "베팅 경기" });
  assert.match(output, /경기 ID: game-id-0001/u);
  assert.match(output, /출처 갱신:.*수집:/u);
});
