import { z } from "zod";

// v1.5 4.3 / 11.7 带外变更：结构同步每轮比对 ad_entities 快照，
// 非本系统变更集产生的差异 → external_changes 一行 + 关联工作项标「已在后台处理」。
export const externalChangeTargetTypeSchema = z.enum(["campaign", "unit", "creative"]);
export const externalChangeFieldSchema = z.enum(["bid", "budget", "status", "schedule"]);
export type ExternalChangeField = z.infer<typeof externalChangeFieldSchema>;

export const externalChangeSchema = z.object({
  id: z.string().min(1),
  media: z.string().min(1),
  accountId: z.string().min(1),
  targetType: externalChangeTargetTypeSchema,
  targetId: z.string().min(1),
  field: externalChangeFieldSchema,
  // typed value，与 changeset_items 同构；未观测到取值就是 null，不编一个。
  fromValue: z.unknown().nullable(),
  toValue: z.unknown().nullable(),
  detectedAt: z.string().datetime({ offset: true }),
  syncRunId: z.string().uuid().nullable(),
  linkedWorkItemId: z.string().uuid().nullable(),
}).strict();
export type ExternalChange = z.infer<typeof externalChangeSchema>;

/** api.md 4.3 点名的四个字段，中文名只此四个，不外扩。 */
const FIELD_LABELS: Record<ExternalChangeField, string> = {
  bid: "出价",
  budget: "日预算",
  status: "状态",
  schedule: "投放时段",
};
const TARGET_LABELS: Record<z.infer<typeof externalChangeTargetTypeSchema>, string> = {
  campaign: "campaign",
  unit: "unit",
  creative: "creative",
};

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return inner === null || inner === undefined ? null : String(inner);
  }
  return null;
}

/**
 * 时间线摘要（fixture 形如「后台手动：campaign 日预算 8000→10000」）。
 * 取不到前后值时只说改了什么，**不编数字**——带外变更的旧值经常观测不到。
 */
export function describeExternalChange(change: ExternalChange): string {
  const parsed = externalChangeSchema.parse(change);
  const what = `${TARGET_LABELS[parsed.targetType]} ${FIELD_LABELS[parsed.field]}`;
  const from = renderValue(parsed.fromValue);
  const to = renderValue(parsed.toValue);
  if (from !== null && to !== null) return `后台手动：${what} ${from}→${to}`;
  if (to !== null) return `后台手动：${what} 改为 ${to}`;
  return `后台手动：${what} 被改动`;
}

export const externalChangeTimelineItemSchema = z.object({
  at: z.string().datetime({ offset: true }),
  kind: z.literal("external_change"),
  actor: z.literal("external"),
  summary: z.string().min(1),
  ref: z.object({ type: z.literal("external_change"), id: z.string().min(1) }).strict(),
  detail: z.object({
    target_type: externalChangeTargetTypeSchema,
    target_id: z.string().min(1),
    field: externalChangeFieldSchema,
  }).strict(),
}).strict();
export type ExternalChangeTimelineItem = z.infer<typeof externalChangeTimelineItemSchema>;

export function toTimelineItem(change: ExternalChange): ExternalChangeTimelineItem {
  const parsed = externalChangeSchema.parse(change);
  return externalChangeTimelineItemSchema.parse({
    at: parsed.detectedAt,
    kind: "external_change",
    actor: "external",
    summary: describeExternalChange(parsed),
    ref: { type: "external_change", id: parsed.id },
    detail: { target_type: parsed.targetType, target_id: parsed.targetId, field: parsed.field },
  });
}
