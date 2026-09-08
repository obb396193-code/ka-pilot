import type { Pool } from "pg";
import { z } from "zod";
import { PlatformPivotRepository, PlatformPivotContractError } from "@ka/db";
import {
  aggregatePivotWindow, approvedWorkspaceAuthContextSchema, queryWindowSchema, dimensionTypeSchema,
  canonicalMetricSetSchema, dailyAssessmentInputSchema, calendarDateSchema,
  aggregateWindowMetrics, computeWindowAssessment, pivotWindowRowsSchema,
} from "@ka/domain";
import { taskQueryIdSchema } from "./query-registry.js";

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
function axis(member: Member, dimension: "account" | "task" | "biz") {
  if (dimension === "account") return { key: `${member.media}:${member.accountId}`, label: member.accountName };
  if (dimension === "task") return { key: member.taskId, label: member.taskName };
  return { key: member.bizName, label: member.bizName };
}
const supportedDimension = z.enum(["account", "task", "biz"]);

/** A verified account-day partition, not an authority/ready certification. No source fallback. */
export class PlatformPivotQuery {
  constructor(private readonly reader: PlatformPivotReader) {}
  async query(raw: unknown) {
    const input = inputSchema.parse(raw);
    const dimA = supportedDimension.safeParse(input.dimA), dimB = supportedDimension.safeParse(input.dimB);
    if (!dimA.success || !dimB.success) throw new PlatformPivotQueryError("DIMENSION_UNSUPPORTED");
    if (input.auth.workspaceKind !== "personal") throw new PlatformPivotQueryError("SOURCE_UNAVAILABLE");
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
    const cells = new Map<string, { a: ReturnType<typeof axis>; b: ReturnType<typeof axis>; members: Member[] }>();
    const observedAccounts = new Set<string>(); let observedAccountDays = 0, missingComputedAt = 0;
    let earliestComputedAt: string | null = null, latestComputedAt: string | null = null;
    for (const member of snapshot.members) {
      if (!member.observed && (member.computedAt !== null || Object.values(member.metrics).some(value =>
        "availability" in value && value.availability !== "missing"))) return invalid();
      if (member.observed) {
        observedAccountDays++; observedAccounts.add(JSON.stringify([member.media, member.accountId]));
        if (member.computedAt === null) missingComputedAt++;
        else {
          const clock = new Date(member.computedAt).toISOString();
          if (earliestComputedAt === null || clock < earliestComputedAt) earliestComputedAt = clock;
          if (latestComputedAt === null || clock > latestComputedAt) latestComputedAt = clock;
        }
      }
      const a = axis(member, dimA.data), b = axis(member, dimB.data), key = JSON.stringify([a.key, b.key]);
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
        accounts, window: input.window, dimA: dimA.data, dimB: dimB.data,
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
  return new PlatformPivotQuery(new PlatformPivotRepository(pool));
}
