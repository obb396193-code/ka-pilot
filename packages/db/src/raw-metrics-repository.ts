import type { Pool } from "pg";

export type RawMetricResource =
  | "account"
  | "account_offline"
  | "account_realtime"
  | "ad_realtime";

export interface RawMetricInsert {
  workspaceId: string;
  accountId: string;
  ds: string;
  resource: RawMetricResource;
  source: "realtime" | "offline" | "metadata";
  requestParams: Record<string, unknown>;
  payload: Record<string, unknown>;
  fetchedByUserId: string | null;
}

export interface RawMergeInput {
  workspaceId: string;
  accountId: string;
  ds: string;
  reportDate: string;
  offline?: Record<string, unknown>;
  realtime?: Record<string, unknown>;
}

export interface RawMergeScope {
  workspaceId: string;
  dateFrom: string;
  dateTo: string;
  reportDate: string;
}

type ReplayRow = {
  workspace_id: string;
  account_id: string;
  ds: string;
  resource: "account_offline" | "account_realtime";
  payload: Record<string, unknown>;
};

export class RawMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async appendRaw(records: readonly RawMetricInsert[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const values: unknown[] = [];
    const tuples = records.map((record, index) => {
      const offset = index * 8;
      values.push(
        record.workspaceId,
        record.accountId,
        record.ds,
        record.resource,
        record.source,
        record.requestParams,
        record.payload,
        record.fetchedByUserId,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}::date, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb, $${offset + 7}::jsonb, $${offset + 8})`;
    });
    await this.pool.query(
      `INSERT INTO metrics_raw (
         workspace_id, account_id, ds, resource, source,
         request_params, payload, fetched_by_user
       ) VALUES ${tuples.join(", ")}`,
      values,
    );
  }

  async loadMergeInputs(scope: RawMergeScope): Promise<RawMergeInput[]> {
    const result = await this.pool.query<ReplayRow>(
      `SELECT DISTINCT ON (workspace_id, account_id, ds, resource)
         workspace_id, account_id, to_char(ds, 'YYYY-MM-DD') AS ds, resource, payload
       FROM metrics_raw
       WHERE workspace_id = $1
         AND ds BETWEEN $2::date AND $3::date
         AND resource IN ('account_offline', 'account_realtime')
       ORDER BY workspace_id, account_id, ds, resource, fetched_at DESC, id DESC`,
      [scope.workspaceId, scope.dateFrom, scope.dateTo],
    );
    const grouped = new Map<string, RawMergeInput>();
    for (const row of result.rows) {
      const ds = row.ds;
      const key = `${row.workspace_id}\u0000${row.account_id}\u0000${ds}`;
      const current = grouped.get(key) ?? {
        workspaceId: row.workspace_id,
        accountId: row.account_id,
        ds,
        reportDate: scope.reportDate,
      };
      if (row.resource === "account_offline") {
        current.offline = row.payload;
      } else {
        current.realtime = row.payload;
      }
      grouped.set(key, current);
    }
    return [...grouped.values()].sort(
      (left, right) =>
        left.ds.localeCompare(right.ds) || left.accountId.localeCompare(right.accountId),
    );
  }
}
