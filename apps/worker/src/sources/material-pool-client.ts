import { createHash } from "node:crypto";

import {
  materialPoolEnvelopeSchema,
  type MaterialPoolRow,
} from "./material-schemas.js";

const DEFAULT_BASE_URL =
  "https://dataservice-api.dw.alibaba-inc.com/project/23017/query/material/pool/list";
const DEFAULT_APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330";
const RETRYABLE_STATUS = new Set([502, 503, 504]);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export type MaterialPoolErrorCode =
  | "MATERIAL_PROTOCOL_ERROR"
  | "MATERIAL_RESOURCE_LIMIT";

export class MaterialPoolError extends Error {
  constructor(
    readonly code: MaterialPoolErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MaterialPoolError";
  }
}

export interface MaterialPoolQuery {
  media: string;
  poolIds: readonly number[];
  itemIds: readonly (string | null)[];
}

export interface MaterialPoolObservation {
  pageCount: number;
  rawRowCount: number;
  uniqueRowCount: number;
  fingerprint: string;
  observedAt: string;
}

export interface MaterialPoolResult {
  rows: MaterialPoolRow[];
  observation: MaterialPoolObservation;
}

export interface MaterialPoolClientOptions {
  baseUrl?: string;
  appCode?: string;
  fetchFn?: FetchLike;
  sleep?: Sleep;
  pageSize?: number;
  maxPages?: number;
  maxRows?: number;
  maxResponseBytes?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  timeoutMs?: number;
  now?: () => Date;
}

interface NormalizedQuery {
  media: string;
  poolIds: number[];
  itemIds: string[];
  includeNullItemId: boolean;
}

interface MaterialPage {
  rows: MaterialPoolRow[];
  pageNum: number;
  pageSize: number;
  totalNum: number;
}

interface MaterialPaginationState {
  merged: Map<string, { row: MaterialPoolRow; canonical: string }>;
  expectedTotal: number | null;
  rawRowCount: number;
  pageCount: number;
}

export class MaterialPoolClient {
  private readonly baseUrl: string;
  private readonly appCode: string;
  private readonly fetchFn: FetchLike;
  private readonly sleep: Sleep;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly maxRows: number;
  private readonly maxResponseBytes: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options: MaterialPoolClientOptions = {}) {
    this.baseUrl = validatedBaseUrl(valueOr(options.baseUrl, DEFAULT_BASE_URL));
    this.appCode = requiredText(valueOr(options.appCode, DEFAULT_APP_CODE), "appCode");
    this.fetchFn = valueOr(options.fetchFn, fetch);
    this.sleep = valueOr(options.sleep, defaultSleep);
    this.pageSize = boundedInteger(valueOr(options.pageSize, 500), 1, 500, "pageSize");
    this.maxPages = boundedInteger(valueOr(options.maxPages, 1000), 1, 1000, "maxPages");
    this.maxRows = boundedInteger(valueOr(options.maxRows, 10_000), 1, 1_000_000, "maxRows");
    this.maxResponseBytes = boundedInteger(
      valueOr(options.maxResponseBytes, 10 * 1024 * 1024),
      1,
      100 * 1024 * 1024,
      "maxResponseBytes",
    );
    this.maxRetries = boundedInteger(valueOr(options.maxRetries, 2), 0, 5, "maxRetries");
    this.retryBaseMs = boundedInteger(valueOr(options.retryBaseMs, 100), 1, 60_000, "retryBaseMs");
    this.timeoutMs = boundedInteger(valueOr(options.timeoutMs, 30_000), 1, 180_000, "timeoutMs");
    this.now = valueOr(options.now, systemNow);
  }

  async listAll(query: MaterialPoolQuery): Promise<MaterialPoolResult> {
    const normalized = normalizeQuery(query);
    const state = createPaginationState();

    for (let pageNum = 1; pageNum <= this.maxPages; pageNum += 1) {
      const page = await this.fetchPage(normalized, pageNum);
      const complete = applyMaterialPage(state, page, pageNum, this.pageSize, this.maxRows);
      if (complete) return buildMaterialResult(state, this.now);
      assertMaterialPageCanContinue(page, pageNum, this.maxPages);
    }
    throw protocolError("Material pagination is incomplete");
  }

  private async fetchPage(query: NormalizedQuery, pageNum: number): Promise<MaterialPage> {
    const url = this.buildUrl(query, pageNum);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        let response: Response;
        try {
          response = await this.fetchFn(url, {
            method: "GET",
            headers: { accept: "application/json", "user-agent": "ka-material-source-bridge" },
            signal: controller.signal,
          });
        } catch {
          throw protocolError("Material upstream transport failed");
        }
        if (RETRYABLE_STATUS.has(response.status)) {
          if (attempt === this.maxRetries) throw protocolError("Material upstream unavailable");
          await this.sleep(this.retryBaseMs * 2 ** attempt);
          continue;
        }
        if (!response.ok) throw protocolError("Material upstream rejected the request");
        return parseMaterialPage(await readBoundedText(response, this.maxResponseBytes));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw protocolError("Material upstream unavailable");
  }

  private buildUrl(query: NormalizedQuery, pageNum: number): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set("appCode", this.appCode);
    url.searchParams.set("media", query.media);
    url.searchParams.set("poolIds", query.poolIds.join(","));
    if (query.itemIds.length > 0) url.searchParams.set("itemIds", query.itemIds.join(","));
    url.searchParams.set("includeNullItemId", String(query.includeNullItemId));
    url.searchParams.set("returnTotalNum", "true");
    url.searchParams.set("pageNum", String(pageNum));
    url.searchParams.set("pageSize", String(this.pageSize));
    return url.toString();
  }
}

function createPaginationState(): MaterialPaginationState {
  return {
    merged: new Map(),
    expectedTotal: null,
    rawRowCount: 0,
    pageCount: 0,
  };
}

function applyMaterialPage(
  state: MaterialPaginationState,
  page: MaterialPage,
  requestedPage: number,
  requestedPageSize: number,
  maxRows: number,
): boolean {
  assertPageMetadata(page, requestedPage, requestedPageSize, state.expectedTotal);
  state.pageCount = requestedPage;
  state.expectedTotal = valueOr(state.expectedTotal, page.totalNum);
  if (state.expectedTotal > maxRows) throw resourceLimit("Material row total exceeds limit");
  state.rawRowCount += page.rows.length;
  if (state.rawRowCount > maxRows) throw resourceLimit("Material row count exceeds limit");
  if (state.rawRowCount > state.expectedTotal) {
    throw protocolError("Material rows exceed reported total");
  }
  mergeRows(state.merged, page.rows);
  return state.rawRowCount === state.expectedTotal;
}

function assertMaterialPageCanContinue(
  page: MaterialPage,
  pageNum: number,
  maxPages: number,
): void {
  if (page.rows.length === 0) throw protocolError("Material pagination stopped before total");
  if (pageNum === maxPages) throw resourceLimit("Material page count exceeds limit");
}

function buildMaterialResult(
  state: MaterialPaginationState,
  now: () => Date,
): MaterialPoolResult {
  const rows = [...state.merged.values()].map(({ row }) => row);
  const observedAt = now();
  if (Number.isNaN(observedAt.valueOf())) {
    throw protocolError("Material observation time is invalid");
  }
  return {
    rows,
    observation: {
      pageCount: state.pageCount,
      rawRowCount: state.rawRowCount,
      uniqueRowCount: rows.length,
      fingerprint: fingerprintRows(rows),
      observedAt: observedAt.toISOString(),
    },
  };
}

function normalizeQuery(query: MaterialPoolQuery): NormalizedQuery {
  const media = requiredText(query.media, "media");
  if (query.poolIds.length === 0) throw protocolError("Material pool selection is required");
  if (query.itemIds.length === 0) throw protocolError("Material item selection is required");
  if (query.poolIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw protocolError("Material pool selection is invalid");
  }
  const itemIds = query.itemIds
    .filter((value): value is string => value !== null)
    .map((value) => safeDelimitedValue(requiredText(value, "itemId"), "itemId"));
  return {
    media,
    poolIds: [...new Set(query.poolIds)],
    itemIds: [...new Set(itemIds)],
    includeNullItemId: query.itemIds.includes(null),
  };
}

function parseMaterialPage(body: string): MaterialPage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw protocolError("Material response is not valid JSON");
  }
  const result = materialPoolEnvelopeSchema.safeParse(parsed);
  if (!result.success) throw protocolError("Material response schema is invalid");
  if (![0, "0"].includes(result.data.errCode) || result.data.data === undefined) {
    throw protocolError("Material response contains a business error");
  }
  return result.data.data;
}

function assertPageMetadata(
  page: MaterialPage,
  requestedPage: number,
  requestedPageSize: number,
  expectedTotal: number | null,
): void {
  if (page.pageNum !== requestedPage || page.pageSize !== requestedPageSize) {
    throw protocolError("Material pagination metadata does not match the request");
  }
  if (expectedTotal !== null && page.totalNum !== expectedTotal) {
    throw protocolError("Material pagination total changed between pages");
  }
}

function mergeRows(
  merged: Map<string, { row: MaterialPoolRow; canonical: string }>,
  rows: readonly MaterialPoolRow[],
): void {
  for (const row of rows) {
    const canonical = JSON.stringify(canonicalize(row));
    const existing = merged.get(row.signature);
    if (existing !== undefined && existing.canonical !== canonical) {
      throw protocolError("Material source contains a conflicting duplicate");
    }
    if (existing === undefined) merged.set(row.signature, { row, canonical });
  }
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw resourceLimit("Material response exceeds byte limit");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > limit) throw resourceLimit("Material response exceeds byte limit");
  return new TextDecoder().decode(buffer);
}

function fingerprintRows(rows: readonly MaterialPoolRow[]): string {
  const summaries = rows
    .map((row) => createHash("sha256").update(JSON.stringify(canonicalize(row))).digest("hex"))
    .sort();
  return createHash("sha256").update(JSON.stringify(summaries)).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw protocolError(`${name} is outside its configured boundary`);
  }
  return value;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized === "") throw protocolError(`${name} is required`);
  return normalized;
}

function safeDelimitedValue(value: string, name: string): string {
  if (value.includes(",") || [...value].some(isControlCharacter)) {
    throw protocolError(`${name} contains an unsupported delimiter`);
  }
  return value;
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint < 32 || codePoint === 127;
}

function validatedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw protocolError("Material endpoint must be a credential-free HTTPS URL");
  }
  return url.toString();
}

function protocolError(message: string): MaterialPoolError {
  return new MaterialPoolError("MATERIAL_PROTOCOL_ERROR", message);
}

function resourceLimit(message: string): MaterialPoolError {
  return new MaterialPoolError("MATERIAL_RESOURCE_LIMIT", message);
}

function valueOr<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function systemNow(): Date {
  return new Date();
}
