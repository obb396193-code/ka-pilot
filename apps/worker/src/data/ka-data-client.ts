import {
  type SourceAuthority,
  type SourceLineage,
  type SourceQueryResult,
  type StableDataQueryErrorCode,
} from "@ka/domain";
import { z } from "zod";

import {
  createDataQueryRegistry,
  isResolvedDataQuery,
  type ResolvedDataQuery,
  type ScopedAccount,
} from "./query-registry.js";

export const DEFAULT_KA_DATA_TIMEOUT_MS = 15_000;
export const DEFAULT_KA_DATA_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const SUSPECTED_ROW_BOUNDARIES = new Set([2_000, 10_000]);

export interface DataQueryExecutionScope {
  workspaceId: string;
  userId: string;
  accounts: readonly ScopedAccount[];
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface KaDataClientOptions {
  baseUrl: string;
  token: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  maxResponseBytes?: number;
  datasetVersion?: string;
  now?: () => Date;
}

export interface KaDataClientRuntimeOverrides {
  fetchFn?: FetchLike;
  now?: () => Date;
}

const kaDataEnvelopeSchema = z
  .object({
    backend: z.enum(["sqlite", "holo", "odps"]),
    rowCount: z.number().int().nonnegative(),
    rows: z.array(z.record(z.string(), z.unknown())),
    truncated: z.boolean().optional().default(false),
    limit_clamped: z.boolean().optional().default(false),
    note: z.string().optional(),
  })
  .passthrough();

export class KaDataClientError extends Error {
  constructor(
    readonly code: StableDataQueryErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KaDataClientError";
  }
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function fixedQueryUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("KA Data base URL must be a credential-free HTTPS origin");
  }
  return new URL("/api/query", url.origin);
}

function authorityFor(resolved: ResolvedDataQuery): SourceAuthority {
  const role = resolved.authorityPolicy.defaultSource === "ka_data"
    ? "default_authoritative"
    : resolved.authorityPolicy.defaultSource === "source_versioned"
      ? "source_versioned"
      : "comparison_reference";
  return {
    policyVersion: resolved.authorityPolicy.policyVersion,
    useCase: resolved.authorityPolicy.useCase,
    role,
  };
}

function accountCount(rows: readonly Record<string, unknown>[]): number {
  return new Set(
    rows
      .map((row) => {
        const media = row.media;
        const accountId = row.account_id ?? row.accountId;
        if (typeof media !== "string") return null;
        if (typeof accountId !== "string" && typeof accountId !== "number") return null;
        return `${media}\u0000${String(accountId)}`;
      })
      .filter((value): value is string => value !== null),
  ).size;
}

interface BoundedBody {
  text: string;
  bytes: number;
  exactLimit: boolean;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<BoundedBody> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new KaDataClientError(
      "SOURCE_TRUNCATED",
      "KA Data response exceeded the configured body limit",
      false,
    );
  }
  if (response.body === null) return { text: "", bytes: 0, exactLimit: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new KaDataClientError(
        "SOURCE_TRUNCATED",
        "KA Data response exceeded the configured body limit",
        false,
      );
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return { text: text + decoder.decode(), bytes, exactLimit: bytes === maxBytes };
}

function parseEnvelope(body: string): z.infer<typeof kaDataEnvelopeSchema> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new KaDataClientError(
      "UPSTREAM_INVALID_RESPONSE",
      "KA Data returned an invalid response",
      false,
      { cause: error },
    );
  }
  const envelope = kaDataEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new KaDataClientError(
      "UPSTREAM_INVALID_RESPONSE",
      "KA Data returned an invalid response",
      false,
    );
  }
  return envelope.data;
}

function sourceLineage(
  resolved: ResolvedDataQuery,
  scope: DataQueryExecutionScope,
  datasetVersion: string,
  dataAsOf: string,
  envelope: z.infer<typeof kaDataEnvelopeSchema>,
  partial: boolean,
  reason: string | undefined,
): SourceLineage {
  return {
    source: "ka_data",
    datasetVersion,
    queryTemplateVersion: resolved.queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    dataAsOf,
    timezone: "Asia/Shanghai",
    dayCut: "calendar_day",
    authority: authorityFor(resolved),
    objectIdentity: {
      objectType: "account",
      joinKeys: ["workspace_id", "media", "account_id"],
    },
    coverage: {
      complete: !partial,
      ...(reason === undefined ? {} : { reason }),
      requestedObjects: scope.accounts.length,
      returnedObjects: accountCount(envelope.rows),
    },
    truncated: partial,
    partial,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class KaDataClient {
  readonly #queryUrl: URL;
  readonly #token: string;
  readonly #fetchFn: FetchLike;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #datasetVersion: string;
  readonly #now: () => Date;
  readonly #registry = createDataQueryRegistry();

  constructor(options: KaDataClientOptions) {
    this.#queryUrl = fixedQueryUrl(options.baseUrl);
    if (options.token.trim() === "") throw new Error("KA Data reader token is required");
    this.#token = options.token;
    this.#fetchFn = options.fetchFn ?? fetch;
    this.#timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_KA_DATA_TIMEOUT_MS, "timeoutMs");
    this.#maxResponseBytes = positiveInteger(
      options.maxResponseBytes ?? DEFAULT_KA_DATA_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    );
    this.#datasetVersion = options.datasetVersion ?? "ka-data-version-unknown";
    this.#now = options.now ?? (() => new Date());
  }

  toJSON(): Record<string, string> {
    return { kind: "KaDataClient" };
  }

  async query(
    resolved: ResolvedDataQuery,
    scope: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
    if (!isResolvedDataQuery(resolved)) {
      throw new KaDataClientError("INVALID_REQUEST", "Query was not resolved by the registry", false);
    }
    const plan = this.#registry.buildKaDataPlan(resolved, scope.accounts);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetchFn(this.#queryUrl, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ backend: plan.backend, sql: plan.sql, limit: plan.limit }),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new KaDataClientError("SOURCE_UNAVAILABLE", "KA Data redirect was rejected", false);
      }
      if (!response.ok) {
        throw new KaDataClientError(
          response.status === 401 || response.status === 403 ? "FORBIDDEN" : "SOURCE_UNAVAILABLE",
          "KA Data request failed",
          response.status >= 500,
        );
      }
      const body = await readBoundedBody(response, this.#maxResponseBytes);
      const envelope = parseEnvelope(body.text);
      const warnings: string[] = [];
      const suspectedRowBoundary = SUSPECTED_ROW_BOUNDARIES.has(envelope.rowCount) ||
        SUSPECTED_ROW_BOUNDARIES.has(envelope.rows.length);
      if (suspectedRowBoundary) warnings.push("Response exactly hit a suspected row boundary");
      if (body.exactLimit) warnings.push("Response exactly hit the configured byte boundary");
      if (envelope.truncated) warnings.push("KA Data reported a truncated response");
      if (envelope.limit_clamped) warnings.push("KA Data clamped the requested row limit");
      if (envelope.rowCount !== envelope.rows.length) warnings.push("KA Data row count did not match returned rows");
      if (envelope.rows.length > resolved.maxRows) warnings.push("Response exceeded the registry row budget");
      const partial = envelope.truncated || envelope.limit_clamped || suspectedRowBoundary ||
        body.exactLimit || envelope.rowCount !== envelope.rows.length || envelope.rows.length > resolved.maxRows;
      const reason = partial ? warnings.join("; ") : undefined;
      const wholeResultTotal = partial
        ? { value: null, availability: "partial" as const, reason: "Whole-result total withheld" }
        : resolved.queryId === "account.table"
          ? { value: null, availability: "missing" as const, reason: "Page response has no total count" }
          : { value: envelope.rowCount, availability: "available" as const };
      return {
        status: "ready",
        rows: envelope.rows,
        returnedRowCount: envelope.rows.length,
        wholeResultTotal,
        lineage: sourceLineage(
          resolved,
          scope,
          this.#datasetVersion,
          this.#now().toISOString(),
          envelope,
          partial,
          reason,
        ),
        warnings,
      };
    } catch (error) {
      if (error instanceof KaDataClientError) throw error;
      if (isAbortError(error)) {
        throw new KaDataClientError(
          "UPSTREAM_TIMEOUT",
          "KA Data request timed out",
          true,
          { cause: error },
        );
      }
      throw new KaDataClientError(
        "SOURCE_UNAVAILABLE",
        "KA Data request failed",
        true,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function optionalPositiveInteger(value: string | undefined, fallback: number, field: string): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be a positive integer`);
  return positiveInteger(Number(value), field);
}

export function createKaDataClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: KaDataClientRuntimeOverrides = {},
): KaDataClient {
  const baseUrl = env.KA_DATA_BASE_URL;
  const token = env.KA_DATA_READER_TOKEN;
  if (baseUrl === undefined || baseUrl.trim() === "") {
    throw new Error("KA_DATA_BASE_URL is required");
  }
  if (token === undefined || token.trim() === "") {
    throw new Error("KA_DATA_READER_TOKEN is required");
  }
  if (
    env.KA_DATA_ACCESS_MODE !== undefined &&
    env.KA_DATA_ACCESS_MODE !== "internal_trial_shared_reader"
  ) {
    throw new Error("KA_DATA_ACCESS_MODE must be internal_trial_shared_reader");
  }
  return new KaDataClient({
    baseUrl,
    token,
    timeoutMs: optionalPositiveInteger(
      env.KA_DATA_TIMEOUT_MS,
      DEFAULT_KA_DATA_TIMEOUT_MS,
      "KA_DATA_TIMEOUT_MS",
    ),
    maxResponseBytes: optionalPositiveInteger(
      env.KA_DATA_MAX_RESPONSE_BYTES,
      DEFAULT_KA_DATA_MAX_RESPONSE_BYTES,
      "KA_DATA_MAX_RESPONSE_BYTES",
    ),
    datasetVersion: env.KA_DATA_DATASET_VERSION ?? "ka-data-version-unknown",
    ...overrides,
  });
}
