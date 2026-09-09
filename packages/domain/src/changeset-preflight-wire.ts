import { z } from "zod";
import type { changeValueSchema as ValueSchema } from "./change-value-schema.js";

const identity = z.string().min(1).max(256);
const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const timestamp = z.string().datetime({ offset: true });
const itemId = z.string().refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"),
  "Expected a positive BIGSERIAL decimal string");
const reason = z.string().min(1).max(4096).nullable();

/** Shared schema factory: runtime dependencies are explicitly supplied so Node's
 * native TypeScript loader and emitted .js consumers use identical validators. */
export function createPreflightPresentationSchemas({ changeValueSchema, sameChangeValue }: {
  changeValueSchema: typeof ValueSchema;
  sameChangeValue: (left: unknown, right: unknown) => boolean;
}) {
  /** Evidence comparison only. This does NOT authorize confirmation/execution or
   * claim the media source was queried; the caller must bind trusted evidence. */
  function classifyPreflightObservation(fromValue: unknown, observed: unknown): "ok" | "changed" | "unknown" {
    const expected = changeValueSchema.parse(fromValue);
    if (observed === null) return "unknown";
    const actual = changeValueSchema.parse(observed);
    return sameChangeValue(expected, actual) ? "ok" : "changed";
  }

  const preflightPresentationItemSchema = z.object({
    itemId, targetType: z.enum(["account", "campaign", "unit", "creative"]), targetId: identity, field: identity,
    fromValue: changeValueSchema, toValue: changeValueSchema, observed: changeValueSchema.nullable(),
    verdict: z.enum(["ok", "changed", "unknown", "blocked"]), reason,
  }).strict().superRefine((item, ctx) => {
    // Nested transport refinements are continuable in Zod. Keep safeParse total
    // even when a malformed ChangeValue has already produced a child issue.
    if (!changeValueSchema.safeParse(item.fromValue).success ||
      (item.observed !== null && !changeValueSchema.safeParse(item.observed).success)) return;
    if (item.verdict === "ok" ? item.reason !== null : item.reason === null)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Reason must agree with verdict" });
    if (item.verdict !== "blocked" && item.verdict !== classifyPreflightObservation(item.fromValue, item.observed))
      ctx.addIssue({ code: "custom", path: ["verdict"], message: "Verdict contradicts observed evidence" });
  });
  const count = z.number().int().min(0).max(10000);
  const preflightPresentationDataSchema = z.object({
    changesetId: z.string().uuid(), executionRunId: z.string().uuid(), status: z.literal("ready"),
    hash: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: timestamp, ttlExpireAt: timestamp,
    items: z.array(preflightPresentationItemSchema).min(1).max(10000),
    summary: z.object({ total: count, ok: count, changed: count, unknown: count, blocked: count }).strict(),
    confirmAllowed: z.boolean(), confirmBlockedReason: reason,
  }).strict().superRefine((data, ctx) => {
    if (Date.parse(data.checkedAt) >= Date.parse(data.ttlExpireAt))
      ctx.addIssue({ code: "custom", path: ["ttlExpireAt"], message: "Preflight completed after draft expiration" });
    const ids = new Set<string>(), targets = new Set<string>();
    const expected = { total: data.items.length, ok: 0, changed: 0, unknown: 0, blocked: 0 };
    for (const [index, item] of data.items.entries()) {
      const target = JSON.stringify([item.targetType, item.targetId, item.field]);
      if (ids.has(item.itemId) || targets.has(target))
        ctx.addIssue({ code: "custom", path: ["items", index], message: "Duplicate preflight item or target field" });
      ids.add(item.itemId); targets.add(target); expected[item.verdict]++;
    }
    for (const key of ["total", "ok", "changed", "unknown", "blocked"] as const) {
      if (data.summary[key] !== expected[key])
        ctx.addIssue({ code: "custom", path: ["summary", key], message: "Summary contradicts item evidence" });
    }
    if (data.confirmAllowed && expected.ok !== expected.total)
      ctx.addIssue({ code: "custom", path: ["confirmAllowed"], message: "Changed, unknown or blocked evidence cannot authorize confirm" });
    if (data.confirmAllowed ? data.confirmBlockedReason !== null : data.confirmBlockedReason === null)
      ctx.addIssue({ code: "custom", path: ["confirmBlockedReason"], message: "Confirmation reason contradicts permission" });
  });

  const preflightPresentationResponseSchema = z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: preflightPresentationDataSchema, meta: z.object({
      requestId, dataAsOf: timestamp.nullable(), businessDate: date,
      workspaceKind: z.literal("personal"), selectedSource: z.literal("platform"),
    }).strict() }).strict(),
    z.object({ ok: z.literal(false), error: z.object({
      code: z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", "FROM_VALUE_CHANGED",
        "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_TIMEOUT", "UPSTREAM_INVALID_RESPONSE", "INTERNAL_ERROR"]),
      message: z.string().min(1).max(4096), retryable: z.boolean(), requestId,
    }).strict() }).strict(),
  ]).superRefine((response, ctx) => {
    if (response.ok && response.meta.dataAsOf !== null && Date.parse(response.meta.dataAsOf) > Date.parse(response.data.checkedAt))
      ctx.addIssue({ code: "custom", path: ["meta", "dataAsOf"], message: "Source timestamp is newer than observation" });
  });

  // Internal persisted evidence, not an alternate HTTP response.
  const preflightObservationSnapshotSchema = z.object({ checkedAt: timestamp, dataAsOf: timestamp.nullable(),
    items: z.array(preflightPresentationItemSchema).min(1).max(10000) }).strict();

  return { classifyPreflightObservation, preflightPresentationItemSchema, preflightPresentationDataSchema,
    preflightPresentationResponseSchema, preflightObservationSnapshotSchema };
}
