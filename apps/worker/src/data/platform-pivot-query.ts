import type { Pool } from "pg";
import { z } from "zod";
import { PlatformPivotRepository, PlatformPivotContractError, withSemanticReadSnapshot } from "@ka/db";
import {
  aggregatePivotWindow, approvedWorkspaceAuthContextSchema, queryWindowSchema, dimensionTypeSchema,
  canonicalMetricSetSchema, dailyAssessmentInputSchema, calendarDateSchema,
  aggregateWindowMetrics, computeWindowAssessment, pivotWindowRowsSchema,
} from "@ka/domain";
import { taskQueryIdSchema } from "./query-registry.js";
import {
  type AccountLabels, accountLabelKey, groupableDimension, loadAccountLabels, needsAccountLabels,
} from "./account-labels.js";

const inputSchema = z.object({ auth: approvedWorkspaceAuthContextSchema, window: queryWindowSchema,
  dimA: dimensionTypeSchema, dimB: dimensionTypeSchema,
  taskIds: z.array(taskQueryIdSchema).max(1000).refine(ids => new Set(ids).size === ids.length, "Duplicate task IDs").optional(),
}).strict();
const dateTime = z.string().datetime({ offset: true }).refine(value => calendarDateSchema.safeParse(value.slice(0, 10)).success);
const memberSchema = z.object({ workspaceId: z.string().uuid(), media: z.string().regex(/^[A-Z0-9_]{1,32}$/),
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), observed: z.boolean(),
  accountName: z.string().nullable(), taskId: z.string().min(1).nullable(), taskName: z.string().nullable(), bizName: z.string().min(1).nullable(),
  computedAt: dateTime.nullable(), metrics: canonicalMetricSetSchema, assessment: dailyAssessmentInputSchema }).strict();
const observationSchema = z.object({ expectedAccountDays: z.number().int().nonnegative(), observedAccountDays: z.number().int().nonnegative(),
  observedAccounts: z.number().int().nonnegative(), missingComputedAt: z.number().int().nonnegative(),
  earliestComputedAt: dateTime.nullable(), latestComputedAt: dateTime.nullable() }).strict();
const snapshotSchema = z.object({ window: queryWindowSchema, members: z.array(memberSchema).max(10000), observation: observationSchema }).strict();
type Member = z.infer<typeof memberSchema>;
export interface PlatformPivotReader { read(auth: unknown, window: unknown): Promise<unknown> }
export interface AccountLabelReader {
  read(input: { workspaceId: string; accounts: readonly { media: string; accountId: string }[] }): Promise<AccountLabels>;
}
export class PlatformPivotQueryError extends Error {
  readonly retryable = false;
  constructor(readonly code: "DIMENSION_UNSUPPORTED" | "SOURCE_UNAVAILABLE" | "UPSTREAM_INVALID_RESPONSE") {
    super(code === "DIMENSION_UNSUPPORTED" ? "Pivot dimension source is not ready" :
      code === "SOURCE_UNAVAILABLE" ? "Team pivot published source is not ready" : "Invalid pivot source evidence");
    this.name = "PlatformPivotQueryError";
  }
}
function invalid(): never { throw new PlatformPivotQueryError("UPSTREAM_INVALID_RESPONSE"); }
function bounded(value: unknown): void {
  if (!value || typeof value !== "object" || !("members" in value) || !Array.isArray(value.members) || value.members.length > 10000) return invalid();
  try { if (Buffer.byteLength(JSON.stringify(value)) >= 16 * 1024 * 1024) return invalid(); } catch { return invalid(); }
}
/**
 * v1.9.34 ⑩（Q-041 ⑦）：透视的两条轴开放到**全部清洗维度**与任意清洗段 `segment:<key>`。
 * 固定三维从 member 自己身上取；其余从昵称标签取——标签由 `loadAccountLabels` 一处算，
 * 与维度查询、级联选项同源（三处各读各的必然分组结果对不上，而且不会报错）。
 * 标签里没有这一维 = 这个账户没标注 → key 为 null，前端归「未标注」桶，**不猜不填默认值**。
 */
function axis(member: Member, dimension: string, labels: AccountLabels) {
  if (dimension === "account") return { key: `${member.media}:${member.accountId}`, label: member.accountName };
  if (dimension === "task") return { key: member.taskId, label: member.taskName };
  if (dimension === "biz") return { key: member.bizName, label: member.bizName };
  const value = labels.get(accountLabelKey(member))?.[dimension] ?? null;
  return { key: value, label: value };
}

/** A verified account-day partition, not an authority/ready certification. No source fallback. */
export class PlatformPivotQuery {
  constructor(
    private readonly reader: PlatformPivotReader,
    /** 昵称标签读取器；没有它就只能做 account/task/biz 三维。 */
    private readonly labels?: AccountLabelReader,
  ) {}
  async query(raw: unknown) {
    const input = inputSchema.parse(raw);
    const dimA = String(input.dimA), dimB = String(input.dimB);
    if (input.auth.workspaceKind !== "personal") throw new PlatformPivotQueryError("SOURCE_UNAVAILABLE");
    // 没有解析器产出的维度（ubp/bid_tool/…）当场拒；要靠昵称标签分组、
    // 而这套部署没接标签读取器时同样拒——两种情况都不能悄悄退回「全 null 一个桶」，
    // 那在页面上跟「所有账户都没标注」长得一模一样。
    const labelled = needsAccountLabels(dimA) || needsAccountLabels(dimB);
    if (!groupableDimension(dimA) || !groupableDimension(dimB) || (labelled && !this.labels)) {
      throw new PlatformPivotQueryError("DIMENSION_UNSUPPORTED");
    }
    const accounts = input.auth.scope.accounts.map(({ media, accountId }) => ({ media, accountId }));
    const days = (Date.parse(`${input.window.to}T00:00:00Z`) - Date.parse(`${input.window.from}T00:00:00Z`)) / 86400000 + 1;
    if (days > 31 || days * accounts.length > 10000 || new Set(accounts.map(a => JSON.stringify(a))).size !== accounts.length) return invalid();
    let rawSnapshot: unknown;
    // Keep the validation baseline private; an injected reader must not mutate its own authority.
    try { rawSnapshot = await this.reader.read(structuredClone(input.auth), { ...input.window }); }
    catch (error) { if (error instanceof PlatformPivotContractError) return invalid(); throw error; }
    bounded(rawSnapshot);
    const parsed = snapshotSchema.safeParse(rawSnapshot);
    if (!parsed.success) return invalid();
    const snapshot = parsed.data;
    if (snapshot.window.from !== input.window.from || snapshot.window.to !== input.window.to || snapshot.window.preset !== input.window.preset) return invalid();
    // 标签按**授权范围**取，不按快照里出现的账户取：快照里没有的账户本来就不会成行，
    // 而让读取范围跟着快照走，等于让上游响应决定我们去查谁。
    const labels: AccountLabels = labelled
      ? await this.labels!.read({ workspaceId: input.auth.workspaceId, accounts })
      : new Map();
    const cells = new Map<string, { a: ReturnType<typeof axis>; b: ReturnType<typeof axis>; members: Member[] }>();
    const observedAccounts = new Set<string>(); let observedAccountDays = 0, missingComputedAt = 0;
    let earliestComputedAt: string | null = null, latestComputedAt: string | null = null;
    for (const member of snapshot.members) {
      // v1.9.27 起 metrics 里有 optional 字段（incentiveCost），Object.values 会出现 undefined：
      // 「这一项根本没有」显然不构成「未观测却带着值」，跳过它。
      if (!member.observed && (member.computedAt !== null || Object.values(member.metrics).some(value =>
        value !== undefined && "availability" in value && value.availability !== "missing"))) return invalid();
      if (member.observed) {
        observedAccountDays++; observedAccounts.add(JSON.stringify([member.media, member.accountId]));
        if (member.computedAt === null) missingComputedAt++;
        else {
          const clock = new Date(member.computedAt).toISOString();
          if (earliestComputedAt === null || clock < earliestComputedAt) earliestComputedAt = clock;
          if (latestComputedAt === null || clock > latestComputedAt) latestComputedAt = clock;
        }
      }
      const a = axis(member, dimA, labels), b = axis(member, dimB, labels), key = JSON.stringify([a.key, b.key]);
      const cell = cells.get(key) ?? { a, b, members: [] };
      if (cell.a.label !== a.label || cell.b.label !== b.label) return invalid();
      cell.members.push(member); cells.set(key, cell);
    }
    const observation = { expectedAccountDays: accounts.length * days, observedAccountDays, observedAccounts: observedAccounts.size,
      missingComputedAt, earliestComputedAt, latestComputedAt };
    for (const field of Object.keys(observation) as Array<keyof typeof observation>) {
      if (snapshot.observation[field] !== observation[field]) return invalid();
    }
    let aggregated: ReturnType<typeof aggregatePivotWindow>;
    try {
      aggregated = aggregatePivotWindow({ workspaceId: input.auth.workspaceId, source: "history", granularity: "account_day",
        accounts, window: input.window, dimA, dimB,
        cells: [...cells.values()].map(cell => ({ a: cell.a, b: cell.b, members: cell.members.map(member => ({
          workspaceId: member.workspaceId, media: member.media, accountId: member.accountId, metrics: member.metrics, assessment: member.assessment,
        })) })),
      });
    } catch { return invalid(); }
    // Validate the entire source partition above BEFORE filtering. Otherwise a
    // filter could conceal corrupt/unauthorized rows. Keep observation as source
    // coverage; cellCoverage and totals below describe the selected account-days.
    const selectedTasks = new Set(input.taskIds ?? []);
    const selectedCells = [...cells.values()].map(cell => ({ ...cell,
      members: selectedTasks.size === 0 ? cell.members : cell.members.filter(member => member.taskId !== null && selectedTasks.has(member.taskId)),
    })).filter(cell => cell.members.length > 0);
    let projection: ReturnType<typeof pivotWindowRowsSchema.parse>;
    try { projection = selectedTasks.size === 0 ? aggregated : pivotWindowRowsSchema.parse({
      queryId: aggregated.queryId, rowSchemaVersion: aggregated.rowSchemaVersion, dimA: aggregated.dimA, dimB: aggregated.dimB,
      rows: selectedCells.map(cell => {
        const assessment = computeWindowAssessment(cell.members.map(member => member.assessment));
        return { a: cell.a, b: cell.b, metrics: { ...aggregateWindowMetrics(cell.members.map(member => member.metrics)), costSpace: assessment.costSpace },
          assessment: assessment.assessment };
      }),
    }); } catch { return invalid(); }
    return { ...projection, warnings: aggregated.warnings, window: input.window, observation,
      cellCoverage: { cells: selectedCells.length, withData: selectedCells.filter(cell => cell.members.some(member => member.observed)).length,
        undeterminable: projection.rows.filter(row => row.assessment.onTarget === null).length } };
  }
}
export function createPlatformPivotQuery(pool: Pick<Pool, "connect">): PlatformPivotQuery {
  return new PlatformPivotQuery(new PlatformPivotRepository(pool), {
    // 标签与透视快照各取一次连接：标签是账户级元数据、快照是账户日事实，
    // 两者不共享一次事务也不会互相矛盾（标签按解析行自己的规则版本解释）。
    read: (input) => withSemanticReadSnapshot(pool, (connection) => loadAccountLabels(connection, input)),
  });
}
