import assert from "node:assert/strict";
import test from "node:test";

import {
  KboEnrollmentActorInputError,
  PostgresKboEnrollmentActorStore,
} from "./postgres-kbo-enrollment-actor-store.ts";
import { PersistenceError } from "./postgres-persistence.ts";

const actor = {
  guildId: "12345678901234567",
  discordUserId: "22345678901234567",
  displayLabel: "가입 사용자",
  registeredAt: new Date("2026-08-07T05:00:00.000Z"),
};

test("registers only the bounded KBO enrollment actor fields", async () => {
  const calls: unknown[] = [];
  const store = new PostgresKboEnrollmentActorStore({
    async query(text: string, values: readonly unknown[]) {
      calls.push({ text, values });
      return { rows: [] } as never;
    },
  } as never);
  await store.register(actor);
  const call = calls[0] as { text: string; values: unknown[] };
  assert.match(call.text, /registered_discord_user/u);
  assert.deepEqual(call.values, [
    actor.guildId,
    actor.discordUserId,
    actor.displayLabel,
    actor.registeredAt,
  ]);
});

test("rejects malformed actors before querying and normalizes database failure", async () => {
  let queried = false;
  const store = new PostgresKboEnrollmentActorStore({
    async query() {
      queried = true;
      throw new Error("database-secret-canary");
    },
  } as never);
  await assert.rejects(
    store.register({ ...actor, guildId: "direct-message" }),
    KboEnrollmentActorInputError,
  );
  assert.equal(queried, false);
  await assert.rejects(
    store.register(actor),
    (error) =>
      error instanceof PersistenceError &&
      error.reasonCode === "kbo_enrollment_actor_registration_failed" &&
      !error.message.includes("database-secret-canary"),
  );
});
