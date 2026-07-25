import assert from "node:assert/strict";
import test from "node:test";

import {
  RiotAccountLinkService,
  RiotLinkConflictError,
  type RiotAccountLink,
} from "./account-link.ts";

test("supports 1:N links while rejecting an active PUUID owned by another member", async () => {
  const links: RiotAccountLink[] = [];
  const service = new RiotAccountLinkService({
    async findActiveByPuuid(puuid) {
      return links.find((link) => link.puuid === puuid && !link.removedAt);
    },
    async listActive(discordUserId) {
      return links.filter((link) => link.discordUserId === discordUserId && !link.removedAt);
    },
    async save(link) {
      links.push(link);
    },
    async remove(linkId, discordUserId, removedAt) {
      const link = links.find(
        (value) => value.linkId === linkId && value.discordUserId === discordUserId && !value.removedAt,
      );
      if (!link) return false;
      link.removedAt = removedAt;
      return true;
    },
  });
  const base = {
    discordUserId: "discord-1",
    platformId: "KR",
    gameName: "표시 이름",
    tagLine: "KR1",
    administratorId: "admin-1",
    createdAt: new Date("2026-07-25T00:00:00Z"),
  };
  const first = await service.approve({ ...base, linkId: "link-1", puuid: "puuid-1" });
  const second = await service.approve({ ...base, linkId: "link-2", puuid: "puuid-2" });
  assert.equal(first.isPrimary, true);
  assert.equal(second.isPrimary, false);
  assert.equal(first.verificationMethod, "admin_approved_unverified");
  await assert.rejects(
    service.approve({
      ...base,
      linkId: "link-3",
      discordUserId: "discord-2",
      puuid: "puuid-1",
    }),
    RiotLinkConflictError,
  );
  assert.equal(await service.unlink("link-1", "discord-1", new Date()), true);
});
