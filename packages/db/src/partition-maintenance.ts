import type { Pool, PoolClient } from "pg";

export interface PartitionMaintenanceOptions {
  asOf?: Date;
  monthsAhead?: number;
}

export async function ensureMetricPartitions(
  pool: Pool,
  options: PartitionMaintenanceOptions = {},
): Promise<void> {
  const asOf = options.asOf ?? new Date();
  const monthsAhead = options.monthsAhead ?? 6;
  if (!Number.isFinite(asOf.getTime())) throw new Error("partition maintenance requires a valid date");
  if (!Number.isInteger(monthsAhead) || monthsAhead < 1 || monthsAhead > 12) {
    throw new Error("monthsAhead must be an integer between 1 and 12");
  }
  const client = await pool.connect();
  try {
    await runMaintenance(client, asOf, monthsAhead);
  } finally {
    client.release();
  }
}

async function runMaintenance(client: PoolClient, asOf: Date, monthsAhead: number): Promise<void> {
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ka.metric.partition.maintenance'))");
    await client.query(
      `SELECT ensure_monthly_metric_partitions(month_start::date)
       FROM generate_series(
         date_trunc('month', $1::timestamptz),
         date_trunc('month', $1::timestamptz) + make_interval(months => $2),
         interval '1 month'
       ) AS month_start`,
      [asOf, monthsAhead],
    );
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  }
}
