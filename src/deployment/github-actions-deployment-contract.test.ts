import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ci = await readFile(".github/workflows/ci.yml", "utf8");
const deploy = await readFile(".github/workflows/deploy-production.yml", "utf8");
const preflight = await readFile(
  ".github/workflows/preflight-production-ssh.yml",
  "utf8",
);
const gameObservation = await readFile(
  ".github/workflows/game-observation-production.yml",
  "utf8",
);
const local = await readFile("scripts/deploy-production-via-lightsail.sh", "utf8");
const remote = await readFile("scripts/deploy-production-release-remote.sh", "utf8");
const gameObservationRemote = await readFile(
  "scripts/manage-production-game-observation-remote.sh",
  "utf8",
);
const alertVerifier = await readFile(
  "scripts/verify-discord-alert-channel.mjs",
  "utf8",
);
const commandManager = await readFile(
  "scripts/manage-discord-guild-commands.mjs",
  "utf8",
);

test("CI has no deployment authority", () => {
  assert.match(ci, /branches: \[develop, production\]/u);
  assert.match(ci, /branches: \[develop\]/u);
  assert.doesNotMatch(ci, /id-token:\s*write/u);
  assert.doesNotMatch(ci, /aws-actions/u);
  assert.match(ci, /npm test/u);
  assert.match(ci, /WAW_SKIP_POSTGRES_INTEGRATION:\s*"1"/u);
  assert.match(ci, /npm run test:browser/u);
  assert.match(
    ci,
    /node node_modules\/playwright-core\/cli\.js install --with-deps chromium/u,
  );
  assert.match(ci, /bash scripts\/test-deploy-production-via-lightsail\.sh/u);
  assert.match(ci, /verify-discord-alert-channel\.mjs --self-test/u);
  assert.match(ci, /manage-discord-guild-commands\.mjs --self-test/u);
  assert.match(ci, /test-manage-production-game-observation-remote\.sh/u);
});

test("production deployment is exact, serialized and branch-bound", () => {
  assert.match(deploy, /branches: \[production\]/u);
  assert.doesNotMatch(deploy, /id-token:\s*write/u);
  assert.doesNotMatch(deploy, /aws-actions/u);
  assert.match(deploy, /cancel-in-progress:\s*false/u);
  assert.match(deploy, /refs\/heads\/production/u);
  assert.match(deploy, /github\.sha/u);
  assert.match(deploy, /secrets\.LIGHTSAIL_DEPLOY_SSH_KEY/u);
  assert.match(deploy, /secrets\.LIGHTSAIL_SSH_KNOWN_HOSTS/u);
  assert.match(deploy, /vars\.LIGHTSAIL_HOST/u);
  assert.match(deploy, /vars\.LIGHTSAIL_USER/u);
  assert.match(deploy, /if: \$\{\{ always\(\) \}\}/u);
  assert.match(deploy, /rm -f -- "\$RUNNER_TEMP\/waw-deploy-key"/u);
  assert.doesNotMatch(deploy, /set -x/u);
});

test("all third-party actions are pinned to full commit SHAs", () => {
  for (const source of [ci, deploy, gameObservation]) {
    const uses = [...source.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/gu)];
    assert.ok(uses.length > 0);
    for (const entry of uses) assert.match(entry[1] ?? "", /^[a-f0-9]{40}$/u);
  }
});

test("game observation activation is manual, exact and reversible", () => {
  assert.match(gameObservation, /workflow_dispatch:/u);
  assert.doesNotMatch(gameObservation, /\bpush:/u);
  assert.match(gameObservation, /group:\s*waw-production/u);
  assert.match(gameObservation, /environment:\s*production/u);
  assert.match(gameObservation, /refs\/heads\/develop/u);
  assert.match(gameObservation, /refs\/heads\/production/u);
  assert.match(gameObservation, /test "\$GITHUB_SHA" = "\$EXPECTED_RELEASE"/u);
  assert.match(gameObservation, /StrictHostKeyChecking=yes/u);
  assert.match(gameObservation, /if: \$\{\{ inputs\.action == 'activate' \}\}/u);
  assert.match(gameObservation, /if: \$\{\{ always\(\) \}\}/u);
  assert.doesNotMatch(gameObservation, /set -x/u);

  assert.match(gameObservationRemote, /90-game-observation-enabled\.conf/u);
  assert.match(gameObservationRemote, /WAW_GAME_OBSERVATION_ENABLED=1/u);
  assert.match(gameObservationRemote, /trap rollback ERR/u);
  assert.match(gameObservationRemote, /rm -f -- "\$dropin"/u);
  assert.match(gameObservationRemote, /wait-production-health\.sh/u);

  assert.match(alertVerifier, /VIEW_CHANNEL/u);
  assert.match(alertVerifier, /SEND_MESSAGES/u);
  assert.match(alertVerifier, /discord_alert_channel_preflight_pass/u);
  assert.doesNotMatch(alertVerifier, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/u);
});

test("Discord command registration is exact and rolls back failed writes", () => {
  assert.match(commandManager, /WAW_SLASH_COMMANDS/u);
  assert.match(commandManager, /sha256\(commands\) !== expectedHash/u);
  assert.match(commandManager, /current_commands_mismatch/u);
  assert.match(commandManager, /flag: "wx", mode: 0o600/u);
  assert.match(commandManager, /await request\(route, token, "PUT", previous\)/u);
  assert.match(commandManager, /rollback=PASS/u);
  assert.doesNotMatch(commandManager, /console\.log\([^)]*(?:token|guildId|user\.id)/u);
});

test("manual SSH preflight proves only a pinned connection", () => {
  assert.match(preflight, /workflow_dispatch:/u);
  assert.doesNotMatch(preflight, /\bpush:/u);
  assert.match(preflight, /group:\s*waw-production/u);
  assert.match(preflight, /environment:\s*production/u);
  assert.match(preflight, /secrets\.LIGHTSAIL_DEPLOY_SSH_KEY/u);
  assert.match(preflight, /secrets\.LIGHTSAIL_SSH_KNOWN_HOSTS/u);
  assert.match(preflight, /StrictHostKeyChecking=yes/u);
  assert.match(preflight, /ssh-keygen -F/u);
  assert.match(preflight, /"\$LIGHTSAIL_USER@\$LIGHTSAIL_HOST" true/u);
  assert.match(preflight, /if: \$\{\{ always\(\) \}\}/u);
  assert.doesNotMatch(preflight, /\b(?:scp|sudo|git|curl)\b/u);
  assert.doesNotMatch(preflight, /actions\/checkout/u);
  assert.doesNotMatch(preflight, /deploy-production/u);
  assert.doesNotMatch(preflight, /set -x/u);
});

test("secret-backed Lightsail SSH pins host keys and cleans temporary files", () => {
  assert.doesNotMatch(local, /\baws\b/u);
  assert.doesNotMatch(local, /\bjq\b/u);
  assert.match(local, /StrictHostKeyChecking=yes/u);
  assert.match(local, /ssh-keygen -F/u);
  assert.match(local, /chmod 600/u);
  assert.match(local, /trap cleanup EXIT/u);
  assert.match(local, /ConnectionAttempts=1/u);
  assert.doesNotMatch(local, /StrictHostKeyChecking=no/u);
  assert.doesNotMatch(local, /set -x/u);
});

test("normal deployment excludes migrations and rolls back failed activation", () => {
  assert.doesNotMatch(local + remote, /run-migration/u);
  assert.match(remote, /trap rollback ERR/u);
  assert.match(remote, /bash "\$manager" rollback "\$release_id" "\$previous_before"/u);
  assert.match(remote, /waw-backup\.timer/u);
  assert.match(remote, /waw-monitor\.timer/u);
  assert.match(remote, /"status":"healthy"/u);
});
