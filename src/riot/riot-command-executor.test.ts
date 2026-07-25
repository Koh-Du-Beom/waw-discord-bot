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
          gameName: "승인계정",
          tagLine: "KR2",
          platformId: "KR",
          verificationMethod: "admin_approved_unverified",
          isPrimary: true,
        },
      ];
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
      라이엇아이디: "대기계정#KR1",
      플랫폼: "kr",
    })),
    /관리자 승인/,
  );
  assert.equal("puuid" in requested[0]!, false);
  assert.equal(requested[0]?.platformId, "KR");
  const list = await executor.execute(request("라이엇계정 목록", {}));
  assert.match(list, /승인 대기/);
  assert.match(list, /소유권 미검증/);
});

test("unlinks only through the caller-scoped store operation", async () => {
  let unlinkInput: Parameters<RiotCommandStore["unlinkWithAudit"]>[0] | undefined;
  const executor = new RiotCommandExecutor(
    {
      async requestLinkWithAudit() { return "created"; },
      async list() { return []; },
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
