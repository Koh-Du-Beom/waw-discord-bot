import assert from "node:assert/strict";
import test from "node:test";

import type { CommandRequest } from "../commands/command-handler.ts";
import {
  RiotCommandExecutor,
  type RiotCommandStore,
} from "./riot-command-executor.ts";

test("creates an approval request without PUUID and labels pending and active links", async () => {
  const requested: Parameters<RiotCommandStore["requestLinkWithAudit"]>[0][] = [];
  const store: RiotCommandStore = {
    async requestLinkWithAudit(input) {
      requested.push(input);
      return "created";
    },
    async list() {
      return [
        {
          kind: "pending",
          requestId: "request",
          gameName: "대기계정",
          tagLine: "KR1",
          platformId: "KR",
        },
        {
          kind: "active",
          linkId: "link",
          discordUserId: "actor",
          discordUserLabel: "요청자",
          gameName: "승인계정",
          tagLine: "KR2",
          platformId: "KR",
          verificationMethod: "admin_approved_unverified",
          isPrimary: true,
        },
      ];
    },
    async listAll() {
      return [{
        kind: "active",
        linkId: "link",
        discordUserId: "actor",
        discordUserLabel: "요청자",
        gameName: "승인계정",
        tagLine: "KR2",
        platformId: "KR",
        verificationMethod: "admin_approved_unverified",
        isPrimary: true,
      }];
    },
    async unlinkWithAudit() {
      return "removed";
    },
  };
  const executor = new RiotCommandExecutor(
    store,
    () => new Date("2026-07-25T00:00:00Z"),
  );
  assert.match(
    await executor.execute(request("라이엇계정 연결", {
      계정: "대기계정#kr1",
    })),
    /승인된 활성 계정은 .*자동 관측/,
  );
  assert.equal("puuid" in requested[0]!, false);
  assert.equal(requested[0]?.platformId, "KR");
  assert.equal(requested[0]?.tagLine, "KR1");
  const list = await executor.execute(request("라이엇계정 목록", {}));
  assert.match(list, /요청자/);
  assert.match(list, /연결 ID: `link`/);
});

test("accepts a display Riot ID as one option and rejects a login username", async () => {
  const requests: Parameters<RiotCommandStore["requestLinkWithAudit"]>[0][] = [];
  const store: RiotCommandStore = {
    async requestLinkWithAudit(input) {
      requests.push(input);
      return "created";
    },
    async list() {
      return [];
    },
    async listAll() {
      return [];
    },
    async unlinkWithAudit() {
      return "removed";
    },
  };
  const executor = new RiotCommandExecutor(
    store,
    () => new Date("2026-07-27T00:00:00.000Z"),
  );

  await executor.execute(request("라이엇계정 연결", {
    계정: "표시 이름#kr1",
  }));
  assert.equal(requests[0]?.gameName, "표시 이름");
  assert.equal(requests[0]?.tagLine, "KR1");

  await executor.execute(request("라이엇계정 연결", {
    계정: "simsul복숭아#심복타도",
  }));
  assert.equal(requests[1]?.gameName, "simsul복숭아");
  assert.equal(requests[1]?.tagLine, "심복타도");

  await assert.rejects(
    executor.execute(request("라이엇계정 연결", {
      계정: "login-username",
    })),
    (error: unknown) =>
      error instanceof Error &&
      "reasonCode" in error &&
      error.reasonCode === "invalid_riot_id",
  );

  await assert.rejects(
    executor.execute(request("라이엇계정 연결", {
      계정: "표시 이름#잘못/된태그",
    })),
    (error: unknown) =>
      error instanceof Error &&
      "reasonCode" in error &&
      error.reasonCode === "invalid_riot_id",
  );
});

test("explains that an already active Riot ID does not need another request", async () => {
  const executor = new RiotCommandExecutor(
    {
      async requestLinkWithAudit() { return "already_linked"; },
      async list() { return []; },
      async listAll() { return []; },
      async unlinkWithAudit() { return "removed"; },
    },
    () => new Date("2026-07-29T00:00:00Z"),
  );

  assert.match(
    await executor.execute(request("라이엇계정 연결", { 계정: "고두범#KR1" })),
    /이미 연결/,
  );
});

test("unlinks only through the caller-scoped store operation", async () => {
  let unlinkInput: Parameters<RiotCommandStore["unlinkWithAudit"]>[0] | undefined;
  const executor = new RiotCommandExecutor(
    {
      async requestLinkWithAudit() { return "created"; },
      async list() { return []; },
      async listAll() { return []; },
      async unlinkWithAudit(input) {
        unlinkInput = input;
        return "removed";
      },
    },
    () => new Date("2026-07-25T00:00:00Z"),
  );
  assert.match(
    await executor.execute(request("라이엇계정 연결해제", { 계정: "link-1" })),
    /해제했습니다/,
  );
  assert.equal(unlinkInput?.discordUserId, "actor");
  assert.equal(unlinkInput?.linkId, "link-1");
});

function request(
  commandName: CommandRequest["commandName"],
  options: Readonly<Record<string, string>>,
): CommandRequest {
  return {
    eventId: "event",
    correlationId: "correlation",
    actorId: "actor",
    guildId: "guild",
    channelId: "channel",
    isThread: false,
    commandName,
    options,
    signal: new AbortController().signal,
  };
}
