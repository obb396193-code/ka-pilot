import { z } from "zod";
import { parsedSegmentsSchema, resolveAccountDimensions, type ParsedSegment } from "./r014/account-name-parse-contract.js";
import { approvedAccountAccessSchema } from "./auth-context.js";

export const namedDimensionTypeSchema = z.enum(["optimizer", "goal", "placement"]);
export const namingRuleMappingSchema = z.object({ key: z.string().min(1).max(64),
  mapsTo: z.string().min(1).max(64).nullable(), pending: z.boolean(),
}).strict();
export const namingRuleMappingsSchema = namingRuleMappingSchema.array().max(50)
  .refine(rows => new Set(rows.map(row => row.key)).size === rows.length, "Duplicate naming rule key");
const tupleSchema = approvedAccountAccessSchema.pick({ media: true, accountId: true }).strict();
export const namedEvidenceScopeSchema = z.object({ workspaceId: z.string().uuid(), accounts: tupleSchema.array().max(1000) }).strict()
  .refine(value => new Set(value.accounts.map(row => JSON.stringify([row.media, row.accountId]))).size === value.accounts.length);
export const accountDimensionRuleSchema = tupleSchema.extend({ workspaceId: z.string().uuid(),
  ruleVersion: z.number().int().positive().nullable(), mappings: namingRuleMappingsSchema.nullable() }).strict();
export type AccountDimensionRuleValue = z.infer<typeof accountDimensionRuleSchema>;
const inputSchema = z.object({
  segments: parsedSegmentsSchema, override: z.record(z.string().min(1).max(64), z.string().min(1).max(512)),
  nameMatches: z.boolean(), ruleMappings: namingRuleMappingsSchema.nullable(),
}).strict();
const sourceSchema = z.enum(["manual", "nickname", "platform", "qihang"]);
export const dimensionSourceSummarySchema = z.object({
  source: sourceSchema.or(z.literal("mixed")).nullable(),
  sources: z.object({ manual: z.number().int().positive().max(1000).optional(),
    nickname: z.number().int().positive().max(1000).optional(), platform: z.number().int().positive().max(1000).optional(),
    qihang: z.number().int().positive().max(1000).optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const entries = Object.entries(value.sources);
  if ((value.source === null && entries.length !== 0) || (value.source !== null && entries.length === 0) ||
    (value.source !== null && value.source !== "mixed" && (entries.length !== 1 || entries[0]![0] !== value.source)) ||
    entries.some(([, count]) => count === undefined) ||
    entries.reduce((sum, [, count]) => sum + (count ?? 0), 0) > 1000) ctx.addIssue({ code: "custom", message: "Inconsistent dimension source counts" });
});

/** Exact historical rule mappings only; never reparse with a newer naming rule.
 * Uses the existing shared priority resolver after applying persisted overrides.
 * No platform evidence is currently supplied by the canonical account table.
 */
export function resolveNamedDimensions(raw: unknown) {
  const input = inputSchema.parse(raw);
  if (Object.keys(input.segments).length > 50 || Object.keys(input.override).length > 50) throw new Error("Naming evidence exceeds bound");
  const rules = new Map(input.ruleMappings?.map(row => [row.key, row]) ?? []);
  const segments: Record<string, ParsedSegment> = Object.create(null) as Record<string, ParsedSegment>;
  const used = new Set<string>(), overridden: string[] = [];
  for (const name of new Set([...Object.keys(input.segments), ...Object.keys(input.override)])) {
    const original = input.segments[name], rule = rules.get(name), manual = Object.hasOwn(input.override, name);
    if (original && original.key !== name) throw new Error("Naming evidence key mismatch");
    if (rule?.pending) continue;
    if (original && rule && original.mapsTo !== rule.mapsTo) throw new Error("Naming evidence rule mismatch");
    const mapsTo = original?.mapsTo ?? rule?.mapsTo ?? null;
    if (mapsTo === null || !namedDimensionTypeSchema.safeParse(mapsTo).success) continue;
    if (used.has(mapsTo)) throw new Error("Ambiguous naming dimension");
    used.add(mapsTo);
    if (!manual && (!input.nameMatches || !original)) continue;
    const value = manual ? input.override[name]! : original!.value;
    segments[name] = { key: name, value, mapsTo, taskIds: original?.taskIds ?? [] };
    if (manual) overridden.push(name);
  }
  const resolved = resolveAccountDimensions({ segments, overriddenKeys: overridden, platform: {} });
  return { optimizer: resolved.optimizer, goal: resolved.goal, placement: resolved.placement };
}

/**
 * v1.9.42（Q-041 ⑪）：按**任意清洗段**取值 —— `segment:<key>` 问的是「这一段写了什么」，
 * 不是「这一段落到哪个维度」，所以不经过 `mapsTo`，待确认段照样看得见。
 *
 * 规矩与命名维度**必须一致**，否则同一个账户会出现「按优化师分组认为它没标注、
 * 按段分组却有值」这种没人会报错的分歧：
 * - 人工覆盖优先，并标 `manual`；
 * - 昵称对不上了（`nameMatches` 为假）就不信解析出来的值 —— 昵称改过，段值多半已经过期；
 * - 空串按没填算。
 *
 * 收在这里一处：`account-labels`（透视用）与 `platform-dimension-query`（维度用）共用它，
 * 各写一份的话两处的分组结果迟早对不上。
 */
export function resolveSegmentDimension(
  raw: unknown, key: string,
): { value: string | null; source: z.infer<typeof sourceSchema> | null } {
  const input = inputSchema.omit({ ruleMappings: true }).parse({
    segments: (raw as { segments?: unknown } | null)?.segments ?? {},
    override: (raw as { override?: unknown } | null)?.override ?? {},
    nameMatches: (raw as { nameMatches?: unknown } | null)?.nameMatches ?? false,
  });
  const manual = Object.hasOwn(input.override, key) ? input.override[key] : undefined;
  if (manual !== undefined) return { value: manual === "" ? null : manual, source: "manual" };
  const segment = input.segments[key];
  if (!input.nameMatches || segment === undefined) return { value: null, source: null };
  return { value: segment.value === "" ? null : segment.value, source: "nickname" };
}

/** Members are distinct accounts, not account-days; caller enforces that identity. */
export function summarizeDimensionSources(raw: readonly unknown[]): z.infer<typeof dimensionSourceSummarySchema> {
  const values = z.array(sourceSchema.nullable()).max(1000).parse(raw);
  const sources: Partial<Record<z.infer<typeof sourceSchema>, number>> = {};
  for (const source of values) if (source !== null) sources[source] = (sources[source] ?? 0) + 1;
  const kinds = new Set(values);
  return dimensionSourceSummarySchema.parse({ source: kinds.size > 1 ? "mixed" : values[0] ?? null, sources });
}
