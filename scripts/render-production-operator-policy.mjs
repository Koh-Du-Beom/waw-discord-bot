import { readFile, writeFile } from "node:fs/promises";

const [templatePath, outputPath, accountId, instanceId] = process.argv.slice(2);

if (!templatePath || !outputPath || !accountId || !instanceId) {
  console.error(
    "usage: node scripts/render-production-operator-policy.mjs TEMPLATE OUTPUT ACCOUNT_ID INSTANCE_ID",
  );
  process.exit(2);
}

if (!/^\d{12}$/.test(accountId)) {
  throw new Error("account_id_must_be_12_digits");
}

if (!/^[0-9a-f-]{36}$/i.test(instanceId)) {
  throw new Error("instance_id_must_be_lightsail_uuid");
}

const template = await readFile(templatePath, "utf8");
const rendered = template
  .replaceAll("ACCOUNT_ID", accountId)
  .replaceAll("INSTANCE_ID", instanceId);
const policy = JSON.parse(rendered);

const allowedActions = new Set(
  policy.Statement.filter(({ Effect }) => Effect === "Allow").flatMap(({ Action }) =>
    Array.isArray(Action) ? Action : [Action],
  ),
);
const expectedActions = new Set([
  "lightsail:GetRegions",
  "lightsail:GetInstance",
  "lightsail:GetInstanceAccessDetails",
  "lightsail:GetInstanceMetricData",
  "lightsail:GetInstancePortStates",
  "lightsail:GetInstanceState",
  "lightsail:GetOperationsForResource",
]);

if (
  allowedActions.size !== expectedActions.size ||
  [...allowedActions].some((action) => !expectedActions.has(action))
) {
  throw new Error("operator_policy_allowlist_changed");
}

await writeFile(outputPath, `${JSON.stringify(policy, null, 2)}\n`, {
  flag: "wx",
});
console.log("production_operator_policy_rendered");
