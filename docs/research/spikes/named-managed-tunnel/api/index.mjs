import { createHash, createHmac, randomBytes } from "node:crypto";

export default async function handler() {
  const body = JSON.stringify({ guild_id: "test-guild", actor_id: "test-operator", kind: "high-risk" });
  const timestamp = String(Date.now());
  const nonce = randomBytes(12).toString("hex");
  const hash = createHash("sha256").update(body).digest("hex");
  const canonical = ["POST", "/role-check", timestamp, nonce, "fixed-preview", "role-check", hash].join("\n");
  const signature = createHmac("sha256", process.env.SPIKE_CURRENT_KEY).update(canonical).digest("hex");
  const basic = Buffer.from(`spike:${process.env.SPIKE_BASIC_PASSWORD}`).toString("base64");
  const started = Date.now();

  try {
    const upstream = await fetch(`${process.env.SPIKE_TARGET_URL}/role-check`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/json",
        "ngrok-skip-browser-warning": "spike",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-environment": "fixed-preview",
        "x-audience": "role-check",
        "x-key-id": "current",
        "x-signature": signature,
      },
    });
    return Response.json({ outcome: upstream.ok ? "ok" : "denied", duration_ms: Date.now() - started }, { status: upstream.ok ? 200 : 502 });
  } catch {
    return Response.json({ outcome: "unavailable", duration_ms: Date.now() - started }, { status: 503 });
  }
}
