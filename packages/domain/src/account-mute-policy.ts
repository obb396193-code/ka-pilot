import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { shanghaiTaskBusinessDate } from "./task-list-contract.js";

export const accountMuteDaysSchema = z.union([z.literal(1), z.literal(3), z.literal(7)]);
export const accountMuteRequestSchema = z.object({ days: accountMuteDaysSchema, reason_chip: z.string().max(4096) }).strict();
export const accountMuteResultSchema = z.object({
  mutedUntil: z.string().datetime({ offset: true }), scope: z.literal("notifications_and_p1p2"),
}).strict();

/** DATE storage is deliberate; interpret it at the frozen Shanghai03 day cut,
 * never at PostgreSQL/session-local midnight. The caller supplies a server clock.
 */
export function accountMuteDeadline(rawDays: unknown, now: Date): { storedDate: string; mutedUntil: string; scope: "notifications_and_p1p2" } {
  const days = accountMuteDaysSchema.parse(rawDays), businessDate = shanghaiTaskBusinessDate(now);
  const storedDate = calendarDateSchema.parse(new Date(Date.parse(`${businessDate}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10));
  return { storedDate, mutedUntil: `${storedDate}T03:00:00+08:00`, scope: "notifications_and_p1p2" };
}

/** Pure predicate only; callers must preserve occurrence/explain accounting and
 * suppress both notifications and P1/P2/opportunity creation. P0 always breaks mute.
 */
export function accountMuteIsActive(storedDate: unknown, rawSeverity: unknown, now: Date): boolean {
  const severity = z.enum(["P0", "P1", "P2", "opportunity"]).parse(rawSeverity);
  const date = calendarDateSchema.nullable().parse(storedDate);
  if (!Number.isFinite(now.valueOf())) throw new Error("Invalid mute clock");
  return severity !== "P0" && date !== null && now.valueOf() <= Date.parse(`${date}T03:00:00+08:00`);
}
