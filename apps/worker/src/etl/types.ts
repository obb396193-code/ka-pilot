import type { QihangQuery, QihangQueryResult } from "../qihang/client.js";

export type MetricResource = QihangQuery["resource"];
export type MetricSource = "realtime" | "offline" | "metadata";

export interface RawMetricRecord {
  workspaceId: string;
  accountId: string;
  ds: string;
  source: MetricSource;
  resource: MetricResource;
  requestParams: Record<string, unknown>;
  payload: Record<string, unknown>;
  fetchedByUserId: string | null;
}

export interface EtlRunStore {
  startRun(
    jobId: string,
    runKind: "full" | "incr",
    scope: Record<string, unknown>,
  ): Promise<number>;
  appendRaw(records: readonly RawMetricRecord[]): Promise<void>;
  finishRun(runId: number, rowsIngested: number): Promise<void>;
  failRun(runId: number, stepFailed: string, errorSummary: string): Promise<void>;
}

export interface QihangQueryPort {
  query(query: QihangQuery): Promise<QihangQueryResult>;
}
