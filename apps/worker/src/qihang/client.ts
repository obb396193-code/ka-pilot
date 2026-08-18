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
  RetryExhaustedError,
} from "./errors.js";

const DEFAULT_BASE_URL =
  "https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data";
const RETRYABLE_STATUS = new Set([502, 503, 504]);

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
}

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

export class QihangClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly sleep: Sleep;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;

  constructor(options: QihangClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseMs = options.retryBaseMs ?? 2_000;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async query(query: QihangQuery): Promise<QihangQueryResult> {
    if (query.userId.trim() === "") {
      throw new BlockedAuthError("Qihang user identity is missing");
    }
    const url = this.buildUrl(query);
    const attempts = this.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchFn(url, {
          method: "GET",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const bodyText = await response.text();

        if (response.status === 401 || response.status === 403) {
          throw new BlockedAuthError(`Qihang HTTP ${response.status}`);
        }
        if (RETRYABLE_STATUS.has(response.status)) {
          lastError = new QihangHttpError(response.status, `Qihang HTTP ${response.status}`);
          if (attempt >= this.maxRetries) {
            throw new RetryExhaustedError(attempts, { cause: lastError });
          }
          await this.sleep(this.retryBaseMs * 2 ** attempt);
          continue;
        }
        if (!response.ok) {
          throw new QihangHttpError(
            response.status,
            `Qihang HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
          );
        }

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
        return this.extractResult(query.resource, envelope);
      } catch (error) {
        if (
          error instanceof BlockedAuthError ||
          error instanceof QihangBusinessError ||
          error instanceof QihangHttpError ||
          error instanceof QihangError
        ) {
          throw error;
        }
        lastError = error;
        if (attempt >= this.maxRetries) {
          throw new RetryExhaustedError(attempts, { cause: lastError });
        }
        await this.sleep(this.retryBaseMs * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new RetryExhaustedError(attempts, { cause: lastError });
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
        appendParam(url.searchParams, "beginDate", query.beginDate);
        appendParam(url.searchParams, "endDate", query.endDate);
        break;
      case "account_realtime":
        appendParam(url.searchParams, "ds", query.ds);
        break;
      case "ad_realtime":
        appendParam(url.searchParams, "ds", query.ds);
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
