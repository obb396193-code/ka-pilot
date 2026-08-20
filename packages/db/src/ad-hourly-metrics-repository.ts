import type { HourlyAdMetric } from "@ka/domain";
import type { Pool } from "pg";

export type AdHourlyMetricRecord = Readonly<
  Omit<HourlyAdMetric, "lastSyncTime" | "dataCorrectionFields"> & { workspaceId: string }
>;

export class AdHourlyMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async upsertHourly(records: readonly AdHourlyMetricRecord[]): Promise<void> {
    validateRecords(records);
    if (records.length === 0) return;
    const result = await this.pool.query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS value(
           workspace_id uuid, ad_id text, account_id text, ds date, hh smallint,
           cost numeric, exposure bigint, click bigint, conversion bigint,
           real_conversion bigint, bid numeric, budget numeric
         )
       )
       INSERT INTO ad_metrics_hourly (
         workspace_id, ad_id, account_id, ds, hh, cost, exposure, click,
         conversion, real_conversion, bid, budget
       ) SELECT
         workspace_id, ad_id, account_id, ds, hh, cost, exposure, click,
         conversion, real_conversion, bid, budget
       FROM incoming
       ON CONFLICT (workspace_id, ad_id, ds, hh) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         cost = EXCLUDED.cost,
         exposure = EXCLUDED.exposure,
         click = EXCLUDED.click,
         conversion = EXCLUDED.conversion,
         real_conversion = EXCLUDED.real_conversion,
         bid = EXCLUDED.bid,
         budget = EXCLUDED.budget
       WHERE ad_metrics_hourly.account_id = EXCLUDED.account_id
       RETURNING ad_id`,
      [JSON.stringify(records.map(toDatabaseRecord))],
    );
    if (result.rowCount !== records.length) {
      throw new Error(`Failed to upsert hourly batch of ${records.length} rows`);
    }
  }
}

function toDatabaseRecord(record: AdHourlyMetricRecord): Record<string, unknown> {
  return {
    workspace_id: record.workspaceId,
    ad_id: record.adId,
    account_id: record.accountId,
    ds: record.ds,
    hh: record.hh,
    cost: record.cost,
    exposure: record.exposure,
    click: record.click,
    conversion: record.conversion,
    real_conversion: record.realConversion,
    bid: record.bid,
    budget: record.budget,
  };
}

function validateRecords(records: readonly AdHourlyMetricRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    validateRecord(record);
    const key = JSON.stringify([record.workspaceId, record.adId, record.ds, record.hh]);
    if (seen.has(key)) throw new Error("Hourly metrics contain a duplicate workspace/ad/date/hour");
    seen.add(key);
  }
}

function validateRecord(record: AdHourlyMetricRecord): void {
  if (record.workspaceId.trim() === "" || record.adId.trim() === "" || record.accountId.trim() === "") {
    throw new Error("Hourly metrics require workspace, ad and account identifiers");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.ds)) throw new Error("Hourly metrics require an ISO date");
  if (!Number.isInteger(record.hh) || record.hh < 0 || record.hh > 23) {
    throw new Error("Hourly metrics require hh between 0 and 23");
  }
  const values = [record.cost, record.exposure, record.click, record.conversion,
    record.realConversion, record.bid, record.budget];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Hourly metrics require finite nonnegative values");
  }
  const counts = [record.exposure, record.click, record.conversion, record.realConversion];
  if (counts.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("Hourly count metrics require safe integers");
  }
}
