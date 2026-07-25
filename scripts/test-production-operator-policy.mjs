import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "waw-operator-policy-"));
const output = join(root, "policy.json");

try {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/render-production-operator-policy.mjs",
      "deploy/iam/waw-production-operator-policy.json.tmpl",
      output,
      "123456789012",
      "01234567-89ab-cdef-0123-456789abcdef",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /production_operator_policy_rendered/);

  const policy = JSON.parse(await readFile(output, "utf8"));
  const allows = policy.Statement.filter(({ Effect }) => Effect === "Allow");
  assert.equal(allows.length, 2);
  assert.ok(
    allows.every(
      ({ Condition }) =>
        Condition.Bool["aws:MultiFactorAuthPresent"] === "true" &&
        Condition.StringEquals["aws:RequestedRegion"] === "ap-northeast-2",
    ),
  );
  assert.equal(
    allows.find(({ Sid }) => Sid.includes("Ssh")).Resource,
    "arn:aws:lightsail:ap-northeast-2:123456789012:Instance/01234567-89ab-cdef-0123-456789abcdef",
  );
  assert.ok(
    !JSON.stringify(policy).match(
      /iam:|s3:|Create|Delete|Snapshot|Domain|PublicPorts|StartInstance|StopInstance|RebootInstance/,
    ),
  );

  console.log("production_operator_policy_test_passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
