import type { AdHourlyMetricRecord } from "@ka/db";

import type { QihangQuery, QihangQueryResult } from "../qihang/client.js";
import type { QihangObservation } from "../qihang/observation.js";

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
    runKind: "full" | "incr" | "backfill_coordinator" | "backfill_day" | "canonical" | "quality",
    scope: Record<string, unknown>,
  ): Promise<number>;
  appendRaw(records: readonly RawMetricRecord[]): Promise<void>;
  recordObservation(runId: number, observation: EtlRunObservation): Promise<void>;
  finishRun(runId: number, rowsIngested: number): Promise<void>;
  failRun(runId: number, stepFailed: string, errorSummary: string): Promise<void>;
}

export interface EtlQueryObservation extends QihangObservation {
  ds?: string;
  beginDate?: string;
  endDate?: string;
  hh?: number | string;
}

export interface EtlDerivationObservation {
  kind: "hourly_derivation";
  resource: "ad_realtime";
  rowCount: number;
  observedAt: string;
  lastSyncTime: string | null;
  availability: "observed" | "observed_unverified";
  ds: string;
  hh: number;
  issueCount: number;
  issueFields: readonly string[];
}

export type EtlRunObservation = EtlQueryObservation | EtlDerivationObservation;

export interface AdHourlyStore {
  upsertHourly(records: readonly AdHourlyMetricRecord[]): Promise<void>;
}

export interface QihangQueryPort {
  query(query: QihangQuery): Promise<QihangQueryResult>;
}
