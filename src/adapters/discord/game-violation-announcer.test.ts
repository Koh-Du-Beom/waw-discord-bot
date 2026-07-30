import assert from "node:assert/strict";
import test from "node:test";

import { createGameViolationAnnouncer } from "./game-violation-announcer.ts";

test("sends one public alert with only the detected member mention enabled", async () => {
  const sent: unknown[] = [];
  const announcer = createGameViolationAnnouncer({
    channelId: "channel",
    async resolveChannel() {
      return {
        async send(input) {
          sent.push(input);
        },
      };
    },
  });

  await announcer.notify({ guildId: "guild", discordUserId: "123" });

  assert.deepEqual(sent, [{
    content:
      "🚨🚨🚨🚨🚨🚨🚨 몰랭검거!!!! 🚨🚨🚨🚨🚨🚨🚨\n" +
      "<@123> 님의 몰랭이 적발되었습니다!",
    allowedMentions: { users: ["123"] },
  }]);
});
