import assert from "node:assert/strict";
import test from "node:test";

import { CommandFailure, type CommandRequest } from "../commands/command-handler.ts";
import { KboRankingCommandExecutor } from "./ranking-command-executor.ts";

const request: CommandRequest = {
  eventId: "discord:ranking-interaction",
  correlationId: "correlation",
  actorId: "22345678901234567",
  guildId: "12345678901234567",
  channelId: "32345678901234567",
  isThread: false,
  commandName: "랭킹 적중률",
  options: { 대회: "KBO_REGULAR", 시즌: "2026", 페이지: "2" },
  signal: new AbortController().signal,
};

test("formats shared KBO rankings without mention or internal identifiers", async () => {
  const inputs: unknown[] = [];
  const executor = new KboRankingCommandExecutor({
    async read(input) {
      inputs.push(input);
      return [{
        rank: 1n,
        displayLabel: "@everyone_*선두*",
        isSelf: true,
        validSettlements: 10n,
        outcomeHits: 7n,
        scoreHits: 3n,
      }];
    },
  }, true);
  const output = await executor.execute(request);
  assert.match(output, /1위 · @​everyone\\_\\\*선두\\\* \(나\)/u);
  assert.match(output, /결과 7 · 점수 3 · 유효 10 · 70\.0%/u);
  assert.equal(output.includes("account"), false);
  assert.deepEqual(inputs, [{
    guildId: request.guildId,
    discordUserId: request.actorId,
    metric: "hit_rate",
    page: 2,
    competitionId: "KBO_REGULAR",
    seasonId: "2026",
  }]);
});

test("formats credit ranking and discloses only that an admin adjustment is included", async () => {
  const executor = new KboRankingCommandExecutor({
    async read() {
      return [{
        rank: 1n,
        displayLabel: "가입자",
        isSelf: false,
        availableBalance: 50_000n,
        adminAdjusted: true,
      }];
    },
  }, true);
  const output = await executor.execute({
    ...request,
    commandName: "랭킹 크레딧",
    options: {},
  });
  assert.match(output, /50,000 크레딧/u);
  assert.match(output, /관리자 조정 포함/u);
});

test("keeps public KBO rankings default-off", async () => {
  let calls = 0;
  const executor = new KboRankingCommandExecutor({
    async read() { calls += 1; return []; },
  }, false);
  await assert.rejects(
    executor.execute(request),
    (error) => error instanceof CommandFailure && error.reasonCode === "kbo_ranking_unavailable",
  );
  assert.equal(calls, 0);
});
