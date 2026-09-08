import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const adminCalendarItemSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), eventDate: date,
  eventType: z.enum(["holiday", "promo", "coefficient_change", "metric_change"]),
  label: z.string().min(1).max(512), affectsBaseline: z.boolean(), thresholdProfile: z.string().min(1).max(256).nullable(),
}).strict();
export const adminCalendarDataSchema = z.object({ items: z.array(adminCalendarItemSchema).max(10000) }).strict().superRefine(({ items }, ctx) => {
  const seen = new Set<number>();
  for (const [index, row] of items.entries()) {
    const previous = items[index - 1];
    if (seen.has(row.id) || (previous && (previous.eventDate < row.eventDate || (previous.eventDate === row.eventDate && previous.id <= row.id))))
      ctx.addIssue({ code: "custom", path: ["items", index], message: "Duplicate or out-of-order calendar entry" });
    seen.add(row.id);
  }
});
export const adminCalendarResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: adminCalendarDataSchema, meta: z.object({
    requestId, dataAsOf: z.string().datetime({ offset: true }).nullable(), businessDate: date,
    workspaceKind: z.enum(["personal", "team"]), selectedSource: z.literal("platform"),
  }).strict() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({
    code: z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR"]),
    message: z.string().min(1).max(512), requestId, retryable: z.boolean(),
  }).strict() }).strict(),
]);
export type AdminCalendarData = z.infer<typeof adminCalendarDataSchema>;
export type AdminCalendarResponse = z.infer<typeof adminCalendarResponseSchema>;
