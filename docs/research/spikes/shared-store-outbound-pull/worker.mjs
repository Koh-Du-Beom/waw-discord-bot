import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.SPIKE_WORKER_DATABASE_URL);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let handled = 0;

while (true) {
  const [request] = await sql`
    UPDATE spike_requests
    SET claimed_at = now()
    WHERE operation_id = (
      SELECT operation_id FROM spike_requests
      WHERE claimed_at IS NULL AND expires_at > now()
      ORDER BY expires_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING operation_id, expires_at
  `;

  if (!request) {
    await pause(100);
    continue;
  }

  await sql`
    INSERT INTO spike_results(operation_id, allowed, role_name, expires_at)
    VALUES (${request.operation_id}, true, 'operator', ${request.expires_at})
    ON CONFLICT DO NOTHING
  `;
  handled += 1;
  if (handled % 10 === 0) console.log(JSON.stringify({ handled }));
}
