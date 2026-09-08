import { z } from "zod";
import { approvedAccountAccessSchema } from "./auth-context.js";
import { calendarDateSchema } from "./data-query-base-rows.js";

// Match the existing Registry's two date spellings, then enforce a real calendar
// day. No clock, default media, source choice or implicit account discovery.
const dateInput = z.string().regex(/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/)
  .transform(value => value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value)
  .pipe(calendarDateSchema);
const accountIds = z.array(approvedAccountAccessSchema.shape.accountId).min(1).max(1000)
  .refine(values => new Set(values).size === values.length, "Duplicate requested account");
const media = approvedAccountAccessSchema.shape.media;
const hour = z.number().int().min(0).max(24);

export const accountHourlyParamsSchema = z.object({
  date: dateInput, media, accountIds: accountIds.optional(), hhFrom: hour.optional(), hhTo: hour.optional(),
}).strict().refine(value => value.hhFrom === undefined || value.hhTo === undefined || value.hhFrom <= value.hhTo,
  "Hour range must be ascending");
export const accountGapParamsSchema = z.object({
  date_from: dateInput, date_to: dateInput, media, accountIds: accountIds.optional(),
  groupBy: z.enum(["account", "task", "biz"]),
}).strict().refine(value => value.date_from <= value.date_to, "Date range must be ascending");

/** Syntax only. An accepted accountId is NOT a grant; the Registry/Service must
 * intersect tuples against the live approved session before any source read.
 * This does not advertise an available source or admit a success envelope.
 */
export const operationalQueryRequestSchema = z.discriminatedUnion("queryId", [
  z.object({ queryId: z.literal("account.hourly"), params: accountHourlyParamsSchema }).strict(),
  z.object({ queryId: z.literal("account.gap"), params: accountGapParamsSchema }).strict(),
]);
export type OperationalQueryRequest = z.infer<typeof operationalQueryRequestSchema>;
