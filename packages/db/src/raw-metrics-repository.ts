import type { Pool, PoolClient } from "pg";

export type RawMetricResource =
  | "account"
  | "account_offline"
  | "account_realtime"
  | "ad_realtime";

export interface RawMetricInsert {
  workspaceId: string;
  media: string;
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
  media: string;
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

export interface AccountMetadataUpsert {
  workspaceId: string;
  media: string;
  accountId: string;
  accountName: string | null;
  status: string | null;
}

interface QueryPort {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

type ReplayRow = {
  workspace_id: string;
  media: string;
  account_id: string;
  ds: string;
  resource: "account_offline" | "account_realtime";
  payload: Record<string, unknown>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_PATTERN = /^[A-Z0-9_]{1,32}$/;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function tupleKey(value: { workspaceId: string; media: string; accountId: string }): string {
  return JSON.stringify([value.workspaceId, value.media, value.accountId]);
}

function assertOptionalText(value: string | null, field: string, maxLength: number): void {
  if (value !== null && (value.trim() === "" || value.length > maxLength)) {
    throw new Error(`${field} is invalid`);
  }
}

function validateMetadata(metadata: readonly AccountMetadataUpsert[]): Set<string> {
  const keys = new Set<string>();
  for (const account of metadata) {
    if (!UUID_PATTERN.test(account.workspaceId)) throw new Error("workspaceId must be a UUID");
    if (!MEDIA_PATTERN.test(account.media)) throw new Error("media is invalid");
    if (!ACCOUNT_ID_PATTERN.test(account.accountId)) throw new Error("accountId is invalid");
    assertOptionalText(account.accountName, "accountName", 256);
    assertOptionalText(account.status, "status", 64);
    const key = tupleKey(account);
    if (keys.has(key)) throw new Error("Account metadata batch contains a duplicate tuple");
    keys.add(key);
  }
  return keys;
}

function validateAtomicBatch(
  metadata: readonly AccountMetadataUpsert[],
  records: readonly RawMetricInsert[],
): void {
  if (metadata.length === 0 && records.length === 0) return;
  if (metadata.length === 0 || records.length === 0) {
    throw new Error("Account metadata and raw rows must be written together");
  }
  const metadataKeys = validateMetadata(metadata);
  const rawKeys = new Set<string>();
  for (const record of records) {
    if (record.resource !== "account" || record.source !== "metadata") {
      throw new Error("Atomic account synchronization only accepts account metadata raw rows");
    }
    const key = tupleKey(record);
    if (!metadataKeys.has(key)) throw new Error("Raw account row escaped the metadata tuple set");
    const payloadId = record.payload.account_id;
    if (String(payloadId) !== record.accountId || payloadId === null || payloadId === undefined) {
      throw new Error("Raw account payload account_id does not match its trusted tuple");
    }
    rawKeys.add(key);
  }
  if (rawKeys.size !== metadataKeys.size) {
    throw new Error("Account metadata tuple set does not match raw account rows");
  }
}

async function insertRaw(
  queryPort: QueryPort,
  records: readonly RawMetricInsert[],
): Promise<void> {
  if (records.length === 0) return;
  const values: unknown[] = [];
  const tuples = records.map((record, index) => {
    const offset = index * 9;
    values.push(
      record.workspaceId,
      record.media,
      record.accountId,
      record.ds,
      record.resource,
      record.source,
      record.requestParams,
      record.payload,
      record.fetchedByUserId,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::date, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8}::jsonb, $${offset + 9})`;
  });
  await queryPort.query(
    `INSERT INTO metrics_raw (
       workspace_id, media, account_id, ds, resource, source,
       request_params, payload, fetched_by_user
     ) VALUES ${tuples.join(", ")}`,
    values,
  );
}

async function upsertAccountMetadata(
  client: PoolClient,
  metadata: readonly AccountMetadataUpsert[],
): Promise<void> {
  if (metadata.length === 0) return;
  await client.query(
    `INSERT INTO accounts (workspace_id, media, account_id, account_name, status)
     SELECT value.workspace_id, value.media, value.account_id, value.account_name, value.status
     FROM jsonb_to_recordset($1::jsonb) AS value(
       workspace_id uuid, media text, account_id text, account_name text, status text
     )
     ON CONFLICT (workspace_id, media, account_id) DO UPDATE
       SET account_name = COALESCE(EXCLUDED.account_name, accounts.account_name),
           status = COALESCE(EXCLUDED.status, accounts.status)`,
    [JSON.stringify(metadata.map((account) => ({
      workspace_id: account.workspaceId,
      media: account.media,
      account_id: account.accountId,
      account_name: account.accountName,
      status: account.status,
    })))],
  );
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original write error.
  }
}

export class RawMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async appendRaw(records: readonly RawMetricInsert[]): Promise<void> {
    await insertRaw(this.pool, records);
  }

  async syncAccountMetadataAndRaw(
    metadata: readonly AccountMetadataUpsert[],
    records: readonly RawMetricInsert[],
  ): Promise<void> {
    validateAtomicBatch(metadata, records);
    if (records.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await upsertAccountMetadata(client, metadata);
      await insertRaw(client, records);
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadMergeInputs(scope: RawMergeScope): Promise<RawMergeInput[]> {
    const result = await this.pool.query<ReplayRow>(
      `SELECT DISTINCT ON (workspace_id, media, account_id, ds, resource)
         workspace_id, media, account_id, to_char(ds, 'YYYY-MM-DD') AS ds, resource, payload
       FROM metrics_raw
       WHERE workspace_id = $1
         AND ds BETWEEN $2::date AND $3::date
         AND resource IN ('account_offline', 'account_realtime')
       ORDER BY workspace_id, media, account_id, ds, resource, fetched_at DESC, id DESC`,
      [scope.workspaceId, scope.dateFrom, scope.dateTo],
    );
    const grouped = new Map<string, RawMergeInput>();
    for (const row of result.rows) {
      const ds = row.ds;
      const key = `${row.workspace_id}\u0000${row.media}\u0000${row.account_id}\u0000${ds}`;
      const current = grouped.get(key) ?? {
        workspaceId: row.workspace_id,
        media: row.media,
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
        left.ds.localeCompare(right.ds) || left.media.localeCompare(right.media) ||
        left.accountId.localeCompare(right.accountId),
    );
  }
}
