import { z } from "zod";

// Standalone: the Web BFF loads this source directly (no relative .js imports).
const instant = z.string().datetime({ offset: true }).refine(value => {
  const date = value.slice(0, 10), parsed = new Date(`${date}T00:00:00Z`);
  return !date.startsWith("0000-") && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
});
export const workItemIgnoreRequestSchema = z.object({
  mute_days: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
  reason_chip: z.string().max(4096).optional(),
}).strict();
export const workItemIgnoreResultSchema = z.object({
  workItemId: z.string().uuid(), status: z.literal("ignored"), ignoredAt: instant, reasonChip: z.string().max(4096).optional(),
}).strict();
export const workItemIgnoreMuteResultSchema = workItemIgnoreResultSchema.extend({
  mutedUntil: instant, scope: z.literal("notifications_and_p1p2"),
}).strict();
