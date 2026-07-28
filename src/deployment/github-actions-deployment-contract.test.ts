import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ci = await readFile(".github/workflows/ci.yml", "utf8");
const deploy = await readFile(".github/workflows/deploy-production.yml", "utf8");
const local = await readFile("scripts/deploy-production-via-lightsail.sh", "utf8");
const remote = await readFile("scripts/deploy-production-release-remote.sh", "utf8");

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
  for (const source of [ci, deploy]) {
    const uses = [...source.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/gu)];
    assert.ok(uses.length > 0);
    for (const entry of uses) assert.match(entry[1] ?? "", /^[a-f0-9]{40}$/u);
  }
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
  assert.match(remote, /bash "\$manager" rollback/u);
  assert.match(remote, /waw-backup\.timer/u);
  assert.match(remote, /waw-monitor\.timer/u);
  assert.match(remote, /"status":"healthy"/u);
});
