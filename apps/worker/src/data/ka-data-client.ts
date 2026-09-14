import {
  namedDimensionWindowRowSchema,
  pivotWindowRowsSchema,
  summarizeDimensionSources,
  labelBasisEarliestKnownWarning,
  capLabelBasisWarnings,
  type LabelBasisEarliestKnownWarning,
  canonicalRowSchemaVersionByQueryId,
  type SourceAuthority,
  type SourceLineage,
  type SourceQueryResult,
  type StableDataQueryErrorCode,
  type WindowComparisonMode,
} from "@ka/domain";
import { z } from "zod";
import { assertProductionEnvironment } from "../production-environment.js";

import {
  createDataQueryRegistry,
  isResolvedDataQuery,
  type ResolvedDataQuery,
  type ScopedAccount,
  type KaDataQueryPlan,
} from "./query-registry.js";
import { decodeKaWindowMembers } from "./ka-window-members.js";
import type { AccountLabelsAsOf } from "./account-labels.js";
import { summarizeKaWindowMembers, summarizeKaWindowGroup } from "./ka-window-summary.js";
import { assembleKaWindowAggregates } from "./ka-window-aggregate.js";
import {
  CanonicalQueryRowError,
  canonicalizeQueryRows,
  maskCanonicalQueryRows,
} from "./canonical-query-rows.js";

export const DEFAULT_KA_DATA_TIMEOUT_MS = 15_000;
export const DEFAULT_KA_DATA_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const SUSPECTED_ROW_BOUNDARIES = new Set([2_000, 10_000]);

export interface DataQueryExecutionScope {
  workspaceId: string;
  userId: string;
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  accounts: readonly ScopedAccount[];
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * v1.9.46（Q-041 ⑧）：团队账户的昵称清洗标签**在我们自己库里**（`account_name_parses`），
 * 不在 ka-data。所以团队维度分组 = ka-data 出账户日事实 + 这个读取器出标签。
 * 没注入它就只能做大盘与趋势，维度查询照旧回 `VIEW_UNSUPPORTED`——
 * 不能悄悄退回「全部归未标注」，那在页面上跟「这批账户都没标注」长得一模一样。
 */
export interface KaDimensionLabelReader {
  /** v1.9.49 ①：按窗口读归属历史；每个账户日按自己的业务日选行。 */
  read(input: { workspaceId: string; accounts: readonly { media: string; accountId: string }[]; from: string; to: string }):
    Promise<AccountLabelsAsOf>;
}

export interface KaDataClientOptions {
  baseUrl: string;
  token: string;
  teamWorkspaceId?: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  maxResponseBytes?: number;
  labels?: KaDimensionLabelReader;
}

export interface KaDataClientRuntimeOverrides {
  fetchFn?: FetchLike;
  /** 团队账户的昵称标签读取器；缺省时团队维度查询回 `VIEW_UNSUPPORTED`，不静默降级。 */
  labels?: KaDimensionLabelReader;
}

const kaDataEnvelopeSchema = z
  .object({
    backend: z.enum(["sqlite", "holo", "odps"]),
    rowCount: z.number().int().nonnegative(),
    rows: z.array(z.record(z.string(), z.unknown())),
    truncated: z.boolean().optional().default(false),
    limit_clamped: z.boolean().optional().default(false),
    note: z.string().optional(),
    datasetVersion: z.string().min(1).optional(),
    dataAsOf: z.string().datetime({ offset: true }).optional(),
    timezone: z.string().min(1).optional(),
    dayCut: z.string().min(1).optional(),
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

function objectCoverage(
  queryId: ResolvedDataQuery["queryId"],
  rows: readonly Record<string, unknown>[],
  requestedObjects: number | undefined,
): { returnedObjects?: number; incomplete: boolean } {
  // The shared reader has no authoritative account inventory. Observed rows
  // cannot prove every team account was returned, nor a cross-day union count.
  if (requestedObjects === undefined) {
    if (queryId === "account.trend") return { incomplete: true };
    const returnedObjects = queryId === "account.summary"
      ? finiteAccountCount(rows[0]?.accountCount)
      : new Set(rows.map((row) => `${String(row.media)}\u0000${String(row.accountId)}`)).size;
    return { returnedObjects, incomplete: true };
  }
  if (queryId === "account.summary") {
    const returnedObjects = finiteAccountCount(rows[0]?.accountCount);
    if (returnedObjects > requestedObjects) throw new CanonicalQueryRowError();
    return { returnedObjects, incomplete: returnedObjects < requestedObjects };
  }
  if (queryId === "account.trend") {
    const counts = rows.map((row) => {
      const nested = row.metrics;
      if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
        throw new CanonicalQueryRowError();
      }
      return finiteAccountCount((nested as Record<string, unknown>).accountCount);
    });
    if (counts.some((count) => count > requestedObjects)) throw new CanonicalQueryRowError();
    if (requestedObjects === 0 || counts.length === 0) {
      return { returnedObjects: 0, incomplete: requestedObjects > 0 };
    }
    if (counts.every((count) => count === requestedObjects)) {
      return { returnedObjects: requestedObjects, incomplete: false };
    }
    return { incomplete: true };
  }
  const returnedObjects = new Set(
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
  if (returnedObjects > requestedObjects) throw new CanonicalQueryRowError();
  return { returnedObjects, incomplete: returnedObjects < requestedObjects };
}

function finiteAccountCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function assertTeamResultFilters(resolved: ResolvedDataQuery, rows: readonly Record<string, unknown>[]): void {
  const requested = resolved.params.accountId === undefined ? resolved.params.accountIds : [resolved.params.accountId];
  const dates = new Set<string>();
  for (const row of rows) {
    if (typeof row.ds === "string") {
      if (row.ds < resolved.params.dateFrom || row.ds > resolved.params.dateTo) throw new CanonicalQueryRowError();
      if (resolved.queryId === "account.trend" && dates.has(row.ds)) throw new CanonicalQueryRowError();
      dates.add(row.ds);
    }
    if (resolved.outputShape !== "account_rows") continue;
    if (resolved.params.media !== undefined && row.media !== resolved.params.media) throw new CanonicalQueryRowError();
    if (requested !== undefined && !requested.includes(String(row.accountId))) throw new CanonicalQueryRowError();
  }
}

/** Account counts alone do not prove coverage across a requested date window. */
function aggregateDateCoverageIncomplete(
  resolved: ResolvedDataQuery,
  rawRows: readonly Record<string, unknown>[],
  rows: readonly Record<string, unknown>[],
  requestedAccounts: number,
): boolean {
  const { dateFrom, dateTo } = resolved.params;
  const days = 1 + Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000);
  if (resolved.queryId === "account.summary") {
    const count = rawRows[0]?.account_day_count;
    // A single-day account count is sufficient; older responses without the
    // explicit multi-day count cannot claim a complete window.
    if (count === undefined || count === null) return days > 1 && requestedAccounts > 0;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > days * requestedAccounts) {
      throw new CanonicalQueryRowError();
    }
    return count < days * requestedAccounts;
  }
  if (resolved.queryId !== "account.trend") return false;
  const dates = new Set(rows.map((row) => row.ds as string));
  if (dates.size !== rows.length || [...dates].some((ds) => ds < dateFrom || ds > dateTo)) {
    throw new CanonicalQueryRowError();
  }
  return requestedAccounts > 0 && dates.size !== days;
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
  envelope: z.infer<typeof kaDataEnvelopeSchema>,
  returnedObjects: number | undefined,
  transportPartial: boolean,
  coveragePartial: boolean,
  reason: string | undefined,
  queryTemplateVersion: string,
): SourceLineage {
  const sourceMetadata = {
    datasetVersion: envelope.datasetVersion ?? null,
    dataAsOf: envelope.dataAsOf ?? null,
    timezone: envelope.timezone ?? null,
    dayCut: envelope.dayCut ?? null,
  };
  const knownMetadata = Object.values(sourceMetadata).filter((value) => value !== null).length;
  return {
    source: "ka_data",
    workspaceKind: scope.scopeKind === "team_workspace_readonly" ? "team" : "personal",
    ...sourceMetadata,
    metadataAvailability: knownMetadata === 0
      ? "unknown"
      : knownMetadata === 4
        ? "known"
        : "partial",
    queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    authority: authorityFor(resolved),
    objectIdentity: {
      objectType: "account",
      joinKeys: ["workspace_id", "media", "account_id"],
    },
    coverage: {
      complete: !transportPartial && !coveragePartial,
      ...(reason === undefined ? {} : { reason }),
      ...(scope.scopeKind === "explicit_accounts" ? { requestedObjects: scope.accounts.length } : {}),
      ...(returnedObjects === undefined ? {} : { returnedObjects }),
    },
    truncated: transportPartial,
    partial: transportPartial || coveragePartial,
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
  readonly #teamWorkspaceId: string | undefined;
  readonly #labels: KaDimensionLabelReader | undefined;
  readonly #registry = createDataQueryRegistry();

  constructor(options: KaDataClientOptions) {
    this.#queryUrl = fixedQueryUrl(options.baseUrl);
    if (options.token.trim() === "") throw new Error("KA Data reader token is required");
    this.#token = options.token;
    const binding = z.string().uuid().safeParse(options.teamWorkspaceId);
    this.#teamWorkspaceId = binding.success ? binding.data : undefined;
    this.#fetchFn = options.fetchFn ?? fetch;
    this.#labels = options.labels;
    this.#timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_KA_DATA_TIMEOUT_MS, "timeoutMs");
    this.#maxResponseBytes = positiveInteger(
      options.maxResponseBytes ?? DEFAULT_KA_DATA_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    );
  }

  toJSON(): Record<string, string> {
    return { kind: "KaDataClient" };
  }

  /** Internal v3 source reader. Public summary switches only with Platform/HTTP/BFF. */
  async queryTeamWindowMembers(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope, window: unknown, compare?: WindowComparisonMode) {
    if (scope.scopeKind !== "team_workspace_readonly" || !z.string().uuid().safeParse(scope.userId).success) {
      throw new KaDataClientError("FORBIDDEN", "Team window query requires approved team context", false);
    }
    if (this.#teamWorkspaceId === undefined || scope.workspaceId !== this.#teamWorkspaceId) {
      throw new KaDataClientError("SOURCE_UNAVAILABLE", "Team data source workspace binding is unavailable", false);
    }
    const plan = this.#registry.buildTeamKaWindowPlan(resolved, window, compare);
    const { envelope, exactLimit } = await this.#readPlan(plan);
    if (exactLimit || envelope.truncated || envelope.limit_clamped || envelope.rowCount !== envelope.rows.length ||
      envelope.rows.length >= plan.limit || SUSPECTED_ROW_BOUNDARIES.has(envelope.rows.length) || SUSPECTED_ROW_BOUNDARIES.has(envelope.rowCount)) {
      throw new KaDataClientError("SOURCE_TRUNCATED", "Window member response is incomplete", false);
    }
    let members;
    try { members = decodeKaWindowMembers(envelope.rows, plan, resolved, scope.workspaceId); }
    catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid window member response", false); }
    const returnedObjects = new Set(members.filter((row) => row.observed && row.ds >= plan.window.from && row.ds <= plan.window.to)
      .map((row) => JSON.stringify([row.media, row.accountId]))).size;
    const reason = "Team account inventory is unavailable; observed rows do not prove complete coverage";
    return {
      members, window: plan.window, previousWindow: plan.previousWindow,
      lineage: sourceLineage(resolved, scope, envelope, returnedObjects, false, true, reason, plan.queryTemplateVersion),
      warnings: [reason],
    };
  }

  async queryTeamWindowSummary(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope, window: unknown, compare?: WindowComparisonMode) {
    const snapshot = await this.queryTeamWindowMembers(resolved, scope, window, compare);
    try {
      const summary = summarizeKaWindowMembers(snapshot.members, snapshot.window, snapshot.previousWindow, compare);
      return { row: summary.row, window: snapshot.window, lineage: snapshot.lineage,
        warnings: [...snapshot.warnings, ...summary.warnings] };
    } catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid window summary response", false); }
  }

  /**
   * v1.9.46（Q-041 ⑧）：团队源按命名维度/清洗段分组。
   *
   * 事实来自 ka-data 的成员网格（与大盘同一张），标签来自我们自己的库——
   * 团队账户的昵称解析行在我们这边，ka-data 没有。两者按 `media:accountId` 对齐。
   * 分组汇总复用 `summarizeKaWindowGroup`（就是大盘那份），不另写一套聚合：
   * 再加一份的话，「按优化师分组的合计」与「大盘合计」迟早对不上，而且不会有东西报错。
   */
  private async queryTeamDimension(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope, window: unknown) {
    if (scope.scopeKind !== "team_workspace_readonly" || this.#teamWorkspaceId === undefined
      || scope.workspaceId !== this.#teamWorkspaceId) {
      throw new KaDataClientError("FORBIDDEN", "Team dimension query requires approved team context", false);
    }
    const dimension = resolved.params.dimensionType;
    if (dimension === undefined) throw new KaDataClientError("INVALID_REQUEST", "Dimension type is required", false);
    if (this.#labels === undefined) {
      throw new KaDataClientError("VIEW_UNSUPPORTED", "Team naming labels are not configured for this source", false);
    }
    const plan = this.#registry.buildTeamKaWindowPlan(resolved, window);
    const { envelope, exactLimit } = await this.#readPlan(plan);
    if (exactLimit || envelope.truncated || envelope.limit_clamped || envelope.rowCount !== envelope.rows.length
      || envelope.rows.length >= plan.limit) {
      throw new KaDataClientError("SOURCE_TRUNCATED", "Team dimension response is incomplete", false);
    }
    let members;
    try { members = decodeKaWindowMembers(envelope.rows, plan, resolved, scope.workspaceId); }
    catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid team member grid", false); }
    const accounts = [...new Map(members.map((member) =>
      [`${member.media}:${member.accountId}`, { media: member.media, accountId: member.accountId }])).values()];
    // v1.9.49 ①：成员网格是账户日粒度，归属按每个成员自己的 `ds` 选行——
    // 窗口跨改名日时，改名前后的钱各归各的。
    const labels = await this.#labels.read({ workspaceId: scope.workspaceId, accounts,
      from: plan.previousWindow?.from ?? plan.window.from, to: plan.window.to });
    const groups = new Map<string | null, typeof members>();
    const sources = new Map<string | null, (string | null)[]>();
    const labelBasis: LabelBasisEarliestKnownWarning[] = [];
    for (const member of members) {
      const basis = labels.on(member, member.ds);
      if (basis?.earliestKnown) {
        labelBasis.push(labelBasisEarliestKnownWarning({ media: member.media, accountId: member.accountId, businessDate: member.ds }));
      }
      const value = basis?.dimensions?.[dimension]?.value ?? null;
      groups.set(value, [...(groups.get(value) ?? []), member]);
      // 标签有没有来源这件事按**账户**算，不按账户日算，否则一个投了 30 天的账户会把来源票数刷爆。
      const seen = sources.get(value) ?? [];
      if (!seen.includes(member.accountId)) sources.set(value, [...seen, member.accountId]);
    }
    const rows = [...groups.entries()]
      .sort(([a], [b]) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1)
      .map(([key, items]) => namedDimensionWindowRowSchema.parse({
        key, label: key ?? "未标注",
        ...summarizeDimensionSources(sources.get(key)!.map(() => key === null ? null : "nickname")),
        ...summarizeKaWindowGroup(items, plan.window),
        anomaly: false,
      }));
    const reason = "Team account inventory is unavailable; observed rows do not prove complete coverage";
    return { rows, dimension, window: plan.window,
      lineage: sourceLineage(resolved, scope, envelope, accounts.length, false, true, reason, plan.queryTemplateVersion),
      warnings: [reason], labelBasis: capLabelBasisWarnings(labelBasis) };
  }

  /**
   * A3（arch 2026-09-13 执行序）：团队空间透视。与团队维度（Q-041 ⑧）同一套：事实来自 ka-data 成员网格，
   * 两根轴的值来自本库昵称解析行、按每个成员自己的业务日取归属（v1.9.49 ①）；每个格子复用
   * `summarizeKaWindowGroup`（大盘那一份），不另写聚合——否则「透视里张三的合计」与
   * 「按优化师分组里张三的合计」迟早对不上，而且不会有东西报错。团队侧未实测，内网验。
   */
  async teamPivot(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope): Promise<{
    source: SourceQueryResult; cellCoverage: { cells: number; withData: number; undeterminable: number };
  }> {
    if (!isResolvedDataQuery(resolved) || resolved.queryId !== "account.pivot2") {
      throw new KaDataClientError("INVALID_REQUEST", "Query was not resolved by the registry", false);
    }
    if (scope.scopeKind !== "team_workspace_readonly" || this.#teamWorkspaceId === undefined
      || scope.workspaceId !== this.#teamWorkspaceId) {
      throw new KaDataClientError("FORBIDDEN", "Team pivot requires approved team context", false);
    }
    const dimA = resolved.params.dimA, dimB = resolved.params.dimB;
    if (dimA === undefined || dimB === undefined) throw new KaDataClientError("INVALID_REQUEST", "Pivot dimensions are required", false);
    // 缺的是我们自己这半（标签），就连源都不打，也不退回「全部未标注」。
    if (this.#labels === undefined) {
      throw new KaDataClientError("VIEW_UNSUPPORTED", "Team naming labels are not configured for this source", false);
    }
    const plan = this.#registry.buildTeamKaWindowPlan(resolved,
      { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" });
    const { envelope, exactLimit } = await this.#readPlan(plan);
    if (exactLimit || envelope.truncated || envelope.limit_clamped || envelope.rowCount !== envelope.rows.length
      || envelope.rows.length >= plan.limit) {
      throw new KaDataClientError("SOURCE_TRUNCATED", "Team pivot response is incomplete", false);
    }
    let members;
    try { members = decodeKaWindowMembers(envelope.rows, plan, resolved, scope.workspaceId); }
    catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid team member grid", false); }
    const accounts = [...new Map(members.map((member) =>
      [`${member.media}:${member.accountId}`, { media: member.media, accountId: member.accountId }])).values()];
    const labels = await this.#labels.read({ workspaceId: scope.workspaceId, accounts, from: plan.window.from, to: plan.window.to });
    const cells = new Map<string, { a: string | null; b: string | null; members: typeof members }>();
    const borrowed: LabelBasisEarliestKnownWarning[] = [];
    for (const member of members) {
      const basis = labels.on(member, member.ds);
      if (basis?.earliestKnown) {
        borrowed.push(labelBasisEarliestKnownWarning({ media: member.media, accountId: member.accountId, businessDate: member.ds }));
      }
      const a = basis?.dimensions?.[dimA]?.value ?? null, b = basis?.dimensions?.[dimB]?.value ?? null;
      const key = JSON.stringify([a, b]), cell = cells.get(key) ?? { a, b, members: [] };
      cell.members.push(member); cells.set(key, cell);
    }
    const order = (x: string | null, y: string | null) => x === y ? 0 : x === null ? -1 : y === null ? 1 : x < y ? -1 : 1;
    const sorted = [...cells.values()].sort((x, y) => order(x.a, y.a) || order(x.b, y.b));
    let projection;
    try {
      projection = pivotWindowRowsSchema.parse({ queryId: resolved.queryId, rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        dimA, dimB, rows: sorted.map((cell) => ({ a: { key: cell.a, label: cell.a }, b: { key: cell.b, label: cell.b },
          ...summarizeKaWindowGroup(cell.members, plan.window) })) });
    } catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid team pivot cells", false); }
    const reason = "Team account inventory is unavailable; observed rows do not prove complete coverage";
    const lineage = sourceLineage(resolved, scope, envelope, accounts.length, false, true, reason, plan.queryTemplateVersion);
    return {
      source: {
        queryId: resolved.queryId, rowSchemaVersion: projection.rowSchemaVersion, dimA, dimB, status: "ready",
        rows: projection.rows, returnedRowCount: projection.rows.length,
        wholeResultTotal: { value: null, availability: "partial", reason: "Team inventory coverage is unknown" },
        // 对象形告警只进 lineage；顶层 warnings 仍只放字符串。
        lineage: { ...lineage, window: plan.window, warnings: [reason, ...capLabelBasisWarnings(borrowed)] },
        warnings: [reason],
      } as SourceQueryResult,
      cellCoverage: { cells: sorted.length, withData: sorted.filter((cell) => cell.members.some((member) => member.observed)).length,
        undeterminable: projection.rows.filter((row) => row.assessment.onTarget === null).length },
    };
  }

  private async queryTeamWindowAggregate(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope, window: unknown, compare?: WindowComparisonMode) {
    if (scope.scopeKind !== "team_workspace_readonly" || !z.string().uuid().safeParse(scope.userId).success) {
      throw new KaDataClientError("FORBIDDEN", "Team window query requires approved team context", false);
    }
    if (this.#teamWorkspaceId === undefined || scope.workspaceId !== this.#teamWorkspaceId) {
      throw new KaDataClientError("SOURCE_UNAVAILABLE", "Team data source workspace binding is unavailable", false);
    }
    const plan = this.#registry.buildTeamKaWindowAggregatePlan(resolved, window, compare);
    const { envelope, exactLimit } = await this.#readPlan(plan);
    if (exactLimit || envelope.truncated || envelope.limit_clamped || envelope.rowCount !== envelope.rows.length ||
      envelope.rows.length >= plan.limit || SUSPECTED_ROW_BOUNDARIES.has(envelope.rows.length) || SUSPECTED_ROW_BOUNDARIES.has(envelope.rowCount)) {
      throw new KaDataClientError("SOURCE_TRUNCATED", "Window aggregate response is incomplete", false);
    }
    let result;
    try { result = assembleKaWindowAggregates(envelope.rows, plan, compare); }
    catch { throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "Invalid window aggregate response", false); }
    const reason = "Team account inventory is unavailable; observed rows do not prove complete coverage";
    return { ...result, window: plan.window,
      lineage: sourceLineage(resolved, scope, envelope, result.returnedObjects, false, true, reason, plan.queryTemplateVersion),
      warnings: [reason, ...result.warnings] };
  }

  async #readPlan(plan: KaDataQueryPlan) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetchFn(this.#queryUrl, {
        method: "POST", redirect: "manual", signal: controller.signal,
        headers: { accept: "application/json", authorization: `Bearer ${this.#token}`, "content-type": "application/json" },
        body: JSON.stringify({ backend: plan.backend, sql: plan.sql, limit: plan.limit }),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new KaDataClientError("SOURCE_UNAVAILABLE", "KA Data redirect was rejected", false);
      }
      if (!response.ok) {
        throw new KaDataClientError(response.status === 401 || response.status === 403 ? "FORBIDDEN" : "SOURCE_UNAVAILABLE",
          "KA Data request failed", response.status >= 500);
      }
      const body = await readBoundedBody(response, this.#maxResponseBytes);
      const envelope = parseEnvelope(body.text);
      if (envelope.backend !== "sqlite") {
        throw new KaDataClientError("UPSTREAM_INVALID_RESPONSE", "KA Data returned an unexpected backend", false);
      }
      return { envelope, exactLimit: body.exactLimit };
    } catch (error) {
      if (error instanceof KaDataClientError) throw error;
      if (isAbortError(error)) throw new KaDataClientError("UPSTREAM_TIMEOUT", "KA Data request timed out", true);
      throw new KaDataClientError("SOURCE_UNAVAILABLE", "KA Data request failed", true);
    } finally { clearTimeout(timeout); }
  }

  async query(
    resolved: ResolvedDataQuery,
    scope: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
    if (!isResolvedDataQuery(resolved)) {
      throw new KaDataClientError("INVALID_REQUEST", "Query was not resolved by the registry", false);
    }
    const team = scope.scopeKind === "team_workspace_readonly";
    if (team && (this.#teamWorkspaceId === undefined || scope.workspaceId !== this.#teamWorkspaceId)) {
      throw new KaDataClientError(
        "SOURCE_UNAVAILABLE",
        "Team data source workspace binding is unavailable",
        false,
      );
    }
    if (!team && scope.scopeKind !== "explicit_accounts") {
      throw new KaDataClientError(
        "FORBIDDEN",
        "KA Data direct queries require an explicit approved account scope",
        false,
      );
    }
    // v1.9.46（Q-041 ⑧）：团队源的维度分组走成员网格 + 我们自己的标签，不走 ka-data 的 SQL 下推。
    if (resolved.queryId === "account.dimension" && team) {
      const result = await this.queryTeamDimension(resolved, scope, {
        from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" });
      return {
        queryId: resolved.queryId, rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        dimension: result.dimension, status: "ready", rows: result.rows, returnedRowCount: result.rows.length,
        wholeResultTotal: { value: null, availability: "partial", reason: "Team inventory coverage is unknown" },
        // 对象形告警只进 lineage；顶层 warnings 仍只放字符串。
        lineage: { ...result.lineage, window: result.window, warnings: [...result.warnings, ...result.labelBasis] }, warnings: result.warnings,
      };
    }
    if (resolved.queryId === "account.summary" || resolved.queryId === "account.trend") {
      const window = { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" };
      const result = await this.queryTeamWindowAggregate(resolved, scope, window, resolved.params.compare);
      const rows: Record<string, unknown>[] = resolved.queryId === "account.summary" ? [result.row] : result.trend;
      return {
        queryId: resolved.queryId, rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        status: "ready", rows, returnedRowCount: rows.length,
        wholeResultTotal: { value: null, availability: "partial", reason: "Team inventory coverage is unknown" },
        lineage: { ...result.lineage, window: result.window, warnings: result.warnings }, warnings: result.warnings,
      };
    }
    const plan = team
      ? this.#registry.buildTeamKaDataPlan(resolved)
      : this.#registry.buildKaDataPlan(resolved, scope.accounts);
    try {
      const { envelope: upstreamEnvelope, exactLimit } = await this.#readPlan(plan);
      const canonicalRows = canonicalizeQueryRows(
        resolved.queryId,
        "ka_data",
        upstreamEnvelope.rows,
        scope.workspaceId,
      );
      if (team) assertTeamResultFilters(resolved, canonicalRows);
      const envelope = { ...upstreamEnvelope, rows: canonicalRows };
      const warnings: string[] = [];
      const suspectedRowBoundary = SUSPECTED_ROW_BOUNDARIES.has(envelope.rowCount) ||
        SUSPECTED_ROW_BOUNDARIES.has(envelope.rows.length);
      if (suspectedRowBoundary) warnings.push("Response exactly hit a suspected row boundary");
      if (exactLimit) warnings.push("Response exactly hit the configured byte boundary");
      if (envelope.truncated) warnings.push("KA Data reported a truncated response");
      if (envelope.limit_clamped) warnings.push("KA Data clamped the requested row limit");
      if (envelope.rowCount !== envelope.rows.length) warnings.push("KA Data row count did not match returned rows");
      if (envelope.rows.length > resolved.maxRows) warnings.push("Response exceeded the registry row budget");
      const transportPartial = envelope.truncated || envelope.limit_clamped || suspectedRowBoundary ||
        exactLimit || envelope.rowCount !== envelope.rows.length || envelope.rows.length > resolved.maxRows;
      const coverage = objectCoverage(resolved.queryId, envelope.rows, team ? undefined : scope.accounts.length);
      const objectCoverageIncomplete = coverage.incomplete || (!team && aggregateDateCoverageIncomplete(
        resolved, upstreamEnvelope.rows, envelope.rows, scope.accounts.length,
      ));
      if (objectCoverageIncomplete) {
        warnings.push(team
          ? "Team account inventory is unavailable; observed rows do not prove complete coverage"
          : "Requested account scope is not fully represented by source rows");
      }
      const partial = transportPartial || objectCoverageIncomplete;
      const reason = partial ? warnings.join("; ") : undefined;
      const wholeResultTotal = partial
        ? { value: null, availability: "partial" as const, reason: "Whole-result total withheld" }
        : resolved.queryId === "account.table"
          ? { value: null, availability: "missing" as const, reason: "Page response has no total count" }
          : { value: envelope.rowCount, availability: "available" as const };
      return {
        queryId: resolved.queryId,
        rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        status: "ready",
        rows: transportPartial ? maskCanonicalQueryRows(resolved.queryId, envelope.rows, "error") : envelope.rows,
        returnedRowCount: envelope.rows.length,
        wholeResultTotal,
        lineage: sourceLineage(
          resolved,
          scope,
          envelope,
          coverage.returnedObjects,
          transportPartial,
          objectCoverageIncomplete,
          reason,
          plan.queryTemplateVersion,
        ),
        warnings,
      };
    } catch (error) {
      if (error instanceof KaDataClientError) throw error;
      if (error instanceof CanonicalQueryRowError) {
        throw new KaDataClientError(
          "UPSTREAM_INVALID_RESPONSE",
          "KA Data returned rows outside the canonical query contract",
          false,
        );
      }
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
  assertProductionEnvironment(env);
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
    ...(env.KA_DATA_TEAM_WORKSPACE_ID === undefined ? {} : { teamWorkspaceId: env.KA_DATA_TEAM_WORKSPACE_ID }),
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
    ...overrides,
  });
}
