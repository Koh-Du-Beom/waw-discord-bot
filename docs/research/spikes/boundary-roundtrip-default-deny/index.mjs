import { createHash, createHmac, randomBytes } from "node:crypto";

export default async function handler() {
  const body = JSON.stringify({ guild_id: "test-guild", actor_id: "test-operator", kind: "read" });
  const headers = {
    timestamp: String(Date.now()), nonce: randomBytes(12).toString("hex"),
    environment: "fixed-preview", audience: "role-check", keyId: "current",
  };
  const hash = createHash("sha256").update(body).digest("hex");
  const canonical = ["POST", "/role-check", headers.timestamp, headers.nonce, headers.environment, headers.audience, hash].join("\n");
  const signature = createHmac("sha256", process.env.SPIKE_CURRENT_KEY).update(canonical).digest("hex");
  const started = Date.now();
  try {
    const upstream = await fetch(`${process.env.SPIKE_TARGET_URL}/role-check`, {
      method: "POST", body, signal: AbortSignal.timeout(5_000),
      headers: {
        "content-type": "application/json", "x-timestamp": headers.timestamp, "x-nonce": headers.nonce,
        "x-environment": headers.environment, "x-audience": headers.audience, "x-key-id": headers.keyId,
        "x-signature": signature,
      },
    });
    return Response.json({ outcome: upstream.ok ? "ok" : "denied", duration_ms: Date.now() - started }, { status: upstream.ok ? 200 : 502 });
  } catch {
    return Response.json({ outcome: "unavailable", duration_ms: Date.now() - started }, { status: 503 });
  }
}
