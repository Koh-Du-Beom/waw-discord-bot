import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.SPIKE_WEB_DATABASE_URL);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(request) {
  const url = new URL(request.url, 'https://spike.invalid');
  const operationId = request.headers['x-spike-operation-id'] || randomUUID();
  const expired = url.searchParams.get('expired') === '1';
  const started = Date.now();

  await sql`
    INSERT INTO spike_requests(operation_id, action, expires_at)
    VALUES (${operationId}, 'high_risk', now() + ${expired ? '-1 second' : '5 seconds'}::interval)
    ON CONFLICT DO NOTHING
  `;

  while (Date.now() - started < 5000) {
    const [result] = await sql`
      SELECT allowed, role_name
      FROM spike_results
      WHERE operation_id = ${operationId} AND expires_at > now()
    `;
    if (result) {
      return Response.json({ outcome: 'ok', operation_id: operationId, duration_ms: Date.now() - started, ...result });
    }
    await pause(100);
  }

  return Response.json({ outcome: 'unavailable', operation_id: operationId, duration_ms: Date.now() - started }, { status: 503 });
}
