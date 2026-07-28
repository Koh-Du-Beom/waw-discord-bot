#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

NODE=/usr/local/bin/node
CURRENT=/opt/waw/current
DATABASE=/etc/waw-credentials/web-database-url
BOT_TOKEN=/etc/waw-credentials/bot-discord-token
RUN_DIR=

fail() {
  local stage="$1"
  [[ -z "$RUN_DIR" || ! -d "$RUN_DIR" ]] || rm -rf -- "$RUN_DIR" 2>/dev/null || true
  printf 'SUMMARY_CONTENT_DIAGNOSTIC result=FAIL stage=%s\n' "$stage"
  exit 1
}

[[ -x "$NODE" && -L "$CURRENT" &&
  -f "$DATABASE" && ! -L "$DATABASE" &&
  -f "$BOT_TOKEN" && ! -L "$BOT_TOKEN" ]] || fail PRECONDITION
[[ "$(stat -c '%U:%G:%a' "$DATABASE")" == root:root:600 &&
  "$(stat -c '%U:%G:%a' "$BOT_TOKEN")" == root:root:600 ]] ||
  fail METADATA
RUN_DIR="$(mktemp -d /tmp/waw-summary-content-diagnostic.XXXXXX)" ||
  fail MATERIAL
chmod 700 "$RUN_DIR"

set +e
"$NODE" --input-type=module - "$CURRENT" "$DATABASE" "$BOT_TOKEN" <<'JS'
import fs from "node:fs";
import process from "node:process";
import { createRequire } from "node:module";

const [root, databasePath, tokenPath] = process.argv.slice(2);
let stage = "MATERIAL";
const fail = (classification) => {
  console.log(`SUMMARY_CONTENT_DIAGNOSTIC result=FAIL stage=${stage} class=${classification}`);
  process.exitCode = 1;
};
try {
  const require = createRequire(import.meta.url);
  const { Pool } = require(`${root}/node_modules/pg`);
  const databaseUrl = fs.readFileSync(databasePath, "utf8").trim();
  const token = fs.readFileSync(tokenPath, "utf8").trim();
  if (
    databaseUrl.length < 20 || token.length < 20 ||
    /[\r\n]/u.test(databaseUrl) || /[\r\n]/u.test(token)
  ) {
    fail("INVALID_CREDENTIAL");
  } else {
    stage = "AUDIT_LOOKUP";
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    });
    let row;
    try {
      const result = await pool.query(
        `select channel_id, occurred_at
           from audit_event
          where event_type = 'discord.command'
            and command_name = '요약'
            and reason_code = 'summary_content_unavailable'
          order by occurred_at desc
          limit 1`,
      );
      row = result.rows[0];
    } finally {
      await pool.end().catch(() => {});
    }
    if (
      !row || !/^[1-9][0-9]{16,19}$/u.test(row.channel_id) ||
      !(row.occurred_at instanceof Date) ||
      !Number.isFinite(row.occurred_at.getTime())
    ) {
      fail("AUDIT_NOT_FOUND");
    } else {
      stage = "DISCORD_FETCH";
      const response = await fetch(
        `https://discord.com/api/v10/channels/${row.channel_id}/messages?limit=100`,
        {
          headers: { Authorization: `Bot ${token}` },
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.status !== 200) {
        const classification =
          response.status === 401 ? "AUTHENTICATION" :
          response.status === 403 ? "AUTHORIZATION" :
          response.status === 404 ? "NOT_FOUND" :
          response.status === 429 ? "RATE_LIMIT" : "OTHER_HTTP";
        fail(classification);
      } else {
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.length > 100) {
          fail("INVALID_RESPONSE");
        } else {
          const auditTime = row.occurred_at.getTime();
          let total = 0;
          let totalWithContent = 0;
          let within10 = 0;
          let within10WithContent = 0;
          let within24 = 0;
          let within24WithContent = 0;
          for (const message of payload) {
            const timestamp = Date.parse(message?.timestamp);
            if (
              !/^[1-9][0-9]{16,19}$/u.test(message?.id) ||
              typeof message?.content !== "string" ||
              !Number.isFinite(timestamp)
            ) {
              fail("INVALID_RESPONSE");
              break;
            }
            total += 1;
            const hasContent = message.content.trim().length > 0;
            if (hasContent) totalWithContent += 1;
            const age = auditTime - timestamp;
            if (age >= 0 && age <= 10 * 60_000) {
              within10 += 1;
              if (hasContent) within10WithContent += 1;
            }
            if (age >= 0 && age <= 24 * 60 * 60_000) {
              within24 += 1;
              if (hasContent) within24WithContent += 1;
            }
          }
          if (!process.exitCode) {
            const classification =
              total === 0 ? "HISTORY_EMPTY_OR_PERMISSION" :
              within10 === 0 ? "RECENT_10M_EMPTY" :
              within10WithContent === 0 ? "CONTENT_REDACTED" :
              "CONTENT_AVAILABLE";
            console.log(
              `SUMMARY_CONTENT_DIAGNOSTIC counts=total:${total},content:${totalWithContent},` +
              `within10:${within10},within10content:${within10WithContent},` +
              `within24:${within24},within24content:${within24WithContent}`,
            );
            console.log(
              `SUMMARY_CONTENT_DIAGNOSTIC classification=${classification} ` +
              "db_queries=1 discord_requests=1 provider_calls=0",
            );
            console.log("SUMMARY_CONTENT_DIAGNOSTIC result=PASS sensitive_output=0");
          }
        }
      }
    }
  }
} catch {
  fail("LOCAL_OR_TRANSPORT");
}
JS
diagnostic_rc=$?
set -e

rm -rf -- "$RUN_DIR" || fail CLEANUP
RUN_DIR=
exit "$diagnostic_rc"
