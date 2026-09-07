import { changeValueSchema } from "@ka/domain";
import { z } from "zod";

// Internal preflight port, NOT a second browser/HTTP contract. Only controlled
// codes cross this boundary; raw CLI output, credentials and messages never do.
const identity = z.string().min(1).max(256);
export const preflightReasonSchema = z.enum([
  "FROM_VALUE_CHANGED", "TARGET_NOT_FOUND", "FIELD_UNSUPPORTED", "PERMISSION_DENIED",
  "INVALID_VALUE", "SOURCE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "UNKNOWN_RESULT",
]);
export const preflightItemSchema = z.object({
  itemId: z.number().int().positive().safe(),
  status: z.enum(["success", "failed", "unknown"]),
  failReason: preflightReasonSchema.nullable(),
}).strict().refine(item => item.status === "success" ? item.failReason === null : item.failReason !== null);
export const preflightProofSchema = z.object({
  workspaceId: z.string().uuid(), media: identity, accountId: identity,
  credentialOwnerUserId: z.string().uuid(), draftHash: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(preflightItemSchema).min(1).max(10_000),
}).strict();
export const preflightDraftItemsSchema = z.array(z.object({
  id: z.number().int().positive().safe(), targetType: z.enum(["account", "campaign", "unit", "creative"]),
  targetId: identity, field: identity, fromValue: changeValueSchema, toValue: changeValueSchema,
  itemStatus: z.literal("pending"), failReason: z.null(),
}).strict()).min(1).max(10_000).refine(items => {
  const ids = new Set(items.map(item => item.id));
  const targets = new Set(items.map(item => JSON.stringify([item.targetType, item.targetId, item.field])));
  return ids.size === items.length && targets.size === items.length;
});

export type DryRunFailureCode = "INVALID_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATE" |
  "FROM_VALUE_CHANGED" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT" | "UPSTREAM_INVALID_RESPONSE" | "INTERNAL_ERROR";
const messages: Record<DryRunFailureCode, string> = {
  INVALID_REQUEST: "Invalid preflight request", FORBIDDEN: "Preflight is outside the approved scope",
  NOT_FOUND: "Changeset was not found", INVALID_STATE: "Preflight requires an unexpired draft",
  FROM_VALUE_CHANGED: "Changeset changed during preflight", SOURCE_UNAVAILABLE: "Preflight source is unavailable",
  UPSTREAM_TIMEOUT: "Preflight source timed out", UPSTREAM_INVALID_RESPONSE: "Preflight evidence could not be verified",
  INTERNAL_ERROR: "Preflight could not be recorded",
};
export class DryRunServiceError extends Error {
  constructor(readonly code: DryRunFailureCode) { super(messages[code]); this.name = "DryRunServiceError"; }
}
