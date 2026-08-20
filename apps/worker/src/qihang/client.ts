import {
  accountPageSchema,
  qihangEnvelopeSchema,
  rowArraySchema,
} from "./schemas.js";
import {
  BlockedAuthError,
  QihangBusinessError,
  QihangError,
  QihangHttpError,
  QihangResourceLimitError,
  QihangSuspectedTruncationError,
  RetryExhaustedError,
} from "./errors.js";
import { createQihangObservation, type QihangObservation } from "./observation.js";

const DEFAULT_BASE_URL =
  "https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data";
const RETRYABLE_STATUS = new Set([502, 503, 504]);
export const DEFAULT_MAX_QIHANG_RESPONSE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_QIHANG_ROWS = 10_000;
export const DEFAULT_MAX_QIHANG_IDS_PER_QUERY = 1_000;
export const DEFAULT_MAX_QIHANG_QUERY_URL_BYTES = 64 * 1024;

type CommonQuery = {
  userId: string;
  media?: string;
  accountIds?: readonly string[];
};

export type QihangQuery =
  | (CommonQuery & {
      resource: "account";
      pageNum?: number;
      pageSize?: number;
      keyword?: string;
      bizName?: string;
    })
  | (CommonQuery & {
      resource: "account_offline";
      beginDate: string;
      endDate: string;
    })
  | (CommonQuery & {
      resource: "account_realtime";
      ds: string;
    })
  | (CommonQuery & {
      resource: "ad_realtime";
      ds: string;
      hh?: number | string;
      adIds?: readonly string[];
    });

export type QihangRow = Record<string, unknown>;

export interface QihangQueryResult {
  rows: QihangRow[];
  pagination?: {
    totalNum: number | null;
    pageNum: number | null;
    pageSize: number | null;
  };
  envelope: Record<string, unknown>;
  observation?: QihangObservation;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export interface QihangClientOptions {
  baseUrl?: string;
  fetchFn?: FetchLike;
  sleep?: Sleep;
  maxRetries?: number;
  retryBaseMs?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRows?: number;
  maxIdsPerQuery?: number;
  maxQueryUrlBytes?: number;
  suspectedAdTruncationRows?: number | null;
  now?: () => Date;
}

interface QihangClientConfig {
  baseUrl: string;
  fetchFn: FetchLike;
  sleep: Sleep;
  maxRetries: number;
  retryBaseMs: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRows: number;
  maxIdsPerQuery: number;
  maxQueryUrlBytes: number;
  suspectedAdTruncationRows: number | null;
  now: () => Date;
}

type QihangResourceLimits = Pick<
  QihangClientConfig,
  | "maxResponseBytes"
  | "maxRows"
  | "maxIdsPerQuery"
  | "maxQueryUrlBytes"
  | "suspectedAdTruncationRows"
>;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function numericOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendParam(params: URLSearchParams, name: string, value: unknown): void {
  if (value === null || value === undefined || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0) {
      params.set(name, value.join(","));
    }
    return;
  }
  params.set(name, typeof value === "boolean" ? String(value) : `${value as string | number}`);
}

function compactQihangDate(value: string, name: string): string {
  if (!/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) {
    throw new QihangError(`${name} must use YYYY-MM-DD or YYYYMMDD format`);
  }
  const compact = value.replaceAll("-", "");
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new QihangError(`${name} is not a valid calendar date`);
  }
  return compact;
}

export class QihangClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly sleep: Sleep;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxRows: number;
  private readonly maxIdsPerQuery: number;
  private readonly maxQueryUrlBytes: number;
  private readonly suspectedAdTruncationRows: number | null;
  private readonly now: () => Date;

  constructor(options: QihangClientOptions = {}) {
    const config = normalizeClientConfig(options);
    this.baseUrl = config.baseUrl;
    this.fetchFn = config.fetchFn;
    this.sleep = config.sleep;
    this.maxRetries = config.maxRetries;
    this.retryBaseMs = config.retryBaseMs;
    this.timeoutMs = config.timeoutMs;
    this.maxResponseBytes = config.maxResponseBytes;
    this.maxRows = config.maxRows;
    this.maxIdsPerQuery = config.maxIdsPerQuery;
    this.maxQueryUrlBytes = config.maxQueryUrlBytes;
    this.suspectedAdTruncationRows = config.suspectedAdTruncationRows;
    this.now = config.now;
  }

  async query(query: QihangQuery): Promise<QihangQueryResult> {
    if (query.userId.trim() === "") {
      throw new BlockedAuthError("Qihang user identity is missing");
    }
    this.assertQueryBudget(query);
    const url = this.buildUrl(query);
    if (new TextEncoder().encode(url).byteLength > this.maxQueryUrlBytes) {
      throw new QihangResourceLimitError(
        `Qihang query URL exceeds configured limit ${this.maxQueryUrlBytes} bytes`,
      );
    }
    const attempts = this.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.queryOnce(url, query);
      } catch (error) {
        lastError = retryableCauseOrThrow(error);
        if (attempt >= this.maxRetries) {
          throw new RetryExhaustedError(attempts, { cause: lastError });
        }
        await this.sleep(this.retryBaseMs * 2 ** attempt);
      }
    }

    throw new RetryExhaustedError(attempts, { cause: lastError });
  }

  private async queryOnce(
    url: string,
    query: QihangQuery,
  ): Promise<QihangQueryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      assertResponseStatus(response);
      const bodyText = await readBoundedResponse(response, this.maxResponseBytes);
      assertSuccessfulHttpResponse(response, bodyText);
      const envelope = parseSuccessfulEnvelope(bodyText);
      const result = this.extractResult(query.resource, envelope);
      assertRowBudget(result.rows, this.maxRows);
      this.assertNotSuspectedTruncation(query.resource, result.rows.length);
      return {
        ...result,
        observation: createQihangObservation(query.resource, result.rows, this.now()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertQueryBudget(query: QihangQuery): void {
    assertIdBudget("accountIds", query.accountIds, this.maxIdsPerQuery);
    if (query.resource === "ad_realtime") {
      assertIdBudget("adIds", query.adIds, this.maxIdsPerQuery);
      if (!hasValues(query.accountIds) && !hasValues(query.adIds)) {
        throw new QihangError("ad_realtime requires non-empty accountIds or adIds");
      }
    }
  }

  private assertNotSuspectedTruncation(
    resource: QihangQuery["resource"],
    rowCount: number,
  ): void {
    if (
      resource === "ad_realtime" &&
      this.suspectedAdTruncationRows !== null &&
      rowCount === this.suspectedAdTruncationRows
    ) {
      throw new QihangSuspectedTruncationError(rowCount, this.suspectedAdTruncationRows);
    }
  }

  private buildUrl(query: QihangQuery): string {
    const url = new URL(this.baseUrl);
    appendParam(url.searchParams, "resource", query.resource);
    appendParam(url.searchParams, "userId", query.userId);
    appendParam(url.searchParams, "media", query.media ?? "KUAISHOU");
    appendParam(url.searchParams, "accountIds", query.accountIds);

    switch (query.resource) {
      case "account":
        appendParam(url.searchParams, "returnTotalNum", true);
        appendParam(url.searchParams, "pageNum", query.pageNum ?? 1);
        appendParam(url.searchParams, "pageSize", query.pageSize ?? 50);
        appendParam(url.searchParams, "keyword", query.keyword);
        appendParam(url.searchParams, "bizName", query.bizName);
        break;
      case "account_offline":
        appendParam(
          url.searchParams,
          "beginDate",
          compactQihangDate(query.beginDate, "beginDate"),
        );
        appendParam(
          url.searchParams,
          "endDate",
          compactQihangDate(query.endDate, "endDate"),
        );
        break;
      case "account_realtime":
        appendParam(url.searchParams, "ds", compactQihangDate(query.ds, "ds"));
        break;
      case "ad_realtime":
        appendParam(url.searchParams, "ds", compactQihangDate(query.ds, "ds"));
        appendParam(url.searchParams, "hh", query.hh);
        appendParam(url.searchParams, "adIds", query.adIds);
        break;
    }
    return url.toString();
  }

  private extractResult(
    resource: QihangQuery["resource"],
    envelope: ReturnType<typeof qihangEnvelopeSchema.parse>,
  ): QihangQueryResult {
    if (resource === "account") {
      const page = accountPageSchema.parse(envelope.data);
      return {
        rows: page.rows,
        pagination: {
          totalNum: numericOrNull(page.totalNum),
          pageNum: numericOrNull(page.pageNum),
          pageSize: numericOrNull(page.pageSize),
        },
        envelope,
      };
    }
    return {
      rows: rowArraySchema.parse(envelope.data ?? []),
      envelope,
    };
  }
}

function normalizeClientConfig(options: QihangClientOptions): QihangClientConfig {
  return {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    fetchFn: options.fetchFn ?? fetch,
    sleep: options.sleep ?? defaultSleep,
    maxRetries: options.maxRetries ?? 3,
    retryBaseMs: options.retryBaseMs ?? 2_000,
    timeoutMs: options.timeoutMs ?? 120_000,
    now: options.now ?? (() => new Date()),
    ...normalizeResourceLimits(options),
  };
}

function normalizeResourceLimits(options: QihangClientOptions): QihangResourceLimits {
  return {
    maxResponseBytes: positiveInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_QIHANG_RESPONSE_BYTES,
      "maxResponseBytes",
    ),
    maxRows: positiveInteger(options.maxRows ?? DEFAULT_MAX_QIHANG_ROWS, "maxRows"),
    maxIdsPerQuery: positiveInteger(
      options.maxIdsPerQuery ?? DEFAULT_MAX_QIHANG_IDS_PER_QUERY,
      "maxIdsPerQuery",
    ),
    maxQueryUrlBytes: positiveInteger(
      options.maxQueryUrlBytes ?? DEFAULT_MAX_QIHANG_QUERY_URL_BYTES,
      "maxQueryUrlBytes",
    ),
    suspectedAdTruncationRows:
      options.suspectedAdTruncationRows === null
        ? null
        : positiveInteger(options.suspectedAdTruncationRows ?? 2_000, "suspectedAdTruncationRows"),
  };
}

function retryableCauseOrThrow(error: unknown): unknown {
  if (error instanceof QihangHttpError && RETRYABLE_STATUS.has(error.status)) {
    return error;
  }
  if (error instanceof QihangError) throw error;
  return error;
}

function assertResponseStatus(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new BlockedAuthError(`Qihang HTTP ${response.status}`);
  }
  if (RETRYABLE_STATUS.has(response.status)) {
    throw new QihangHttpError(response.status, `Qihang HTTP ${response.status}`);
  }
}

function assertSuccessfulHttpResponse(response: Response, bodyText: string): void {
  if (!response.ok) {
    throw new QihangHttpError(
      response.status,
      `Qihang HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
    );
  }
}

function parseSuccessfulEnvelope(bodyText: string): ReturnType<typeof qihangEnvelopeSchema.parse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    throw new QihangError("Qihang response is not valid JSON", { cause: error });
  }
  const envelope = qihangEnvelopeSchema.parse(parsed);
  if (!envelope.successful) {
    throw new QihangBusinessError(
      envelope.code === undefined ? null : String(envelope.code),
      envelope.message ?? "Qihang business request was unsuccessful",
    );
  }
  return envelope;
}

function assertRowBudget(rows: readonly QihangRow[], limit: number): void {
  if (rows.length > limit) {
    throw new QihangResourceLimitError(
      `Qihang response row count exceeds configured limit ${limit}`,
    );
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function assertIdBudget(
  name: string,
  values: readonly string[] | undefined,
  limit: number,
): void {
  if (values !== undefined && values.length > limit) {
    throw new QihangResourceLimitError(`${name} exceeds configured limit ${limit}`);
  }
}

function hasValues(values: readonly string[] | undefined): boolean {
  return values !== undefined && values.length > 0;
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new QihangResourceLimitError(
      `Qihang response body exceeds configured limit ${maxBytes} bytes`,
    );
  }
  if (response.body === null) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new QihangResourceLimitError(
        `Qihang response body exceeds configured limit ${maxBytes} bytes`,
      );
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}
