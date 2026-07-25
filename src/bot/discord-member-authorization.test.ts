import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseBotAuthorizationConfiguration,
  resolveMemberAuthorization,
} from "./discord-member-authorization.ts";

const configuration = parseBotAuthorizationConfiguration({
  WAW_DISCORD_GUILD_ID: "123456789012345678",
  WAW_DISCORD_OPERATOR_ROLE_IDS: "234567890123456789",
  WAW_DISCORD_ADMINISTRATOR_ROLE_IDS: "345678901234567890",
});

test("bot maps only configured roles and guild owner to authorization tiers", () => {
  assert.equal(
    resolveMemberAuthorization({
      actorId: "456789012345678901",
      guildOwnerId: "999999999999999999",
      roleIds: ["234567890123456789"],
      configuration,
    }),
    "operator",
  );
  assert.equal(
    resolveMemberAuthorization({
      actorId: "456789012345678901",
      guildOwnerId: "456789012345678901",
      roleIds: [],
      configuration,
    }),
    "administrator",
  );
  assert.equal(
    resolveMemberAuthorization({
      actorId: "456789012345678901",
      guildOwnerId: "999999999999999999",
      roleIds: ["567890123456789012"],
      configuration,
    }),
    undefined,
  );
});

test("bot rejects malformed or overlapping authorization configuration", () => {
  assert.throws(() =>
    parseBotAuthorizationConfiguration({
      WAW_DISCORD_GUILD_ID: "invalid",
      WAW_DISCORD_OPERATOR_ROLE_IDS: "234567890123456789",
      WAW_DISCORD_ADMINISTRATOR_ROLE_IDS: "345678901234567890",
    }),
  );
  assert.throws(() =>
    parseBotAuthorizationConfiguration({
      WAW_DISCORD_GUILD_ID: "123456789012345678",
      WAW_DISCORD_OPERATOR_ROLE_IDS: "234567890123456789",
      WAW_DISCORD_ADMINISTRATOR_ROLE_IDS: "234567890123456789",
    }),
  );
});
