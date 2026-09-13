import { createHash } from "node:crypto";
import { z } from "zod";

// Private delivery policy, not a public response or a target resolver. Producers
// must supply the actual business identity/date; message id is not a substitute.
const opaque = z.string().min(1).max(2048).refine(value => value.trim().length > 0 &&
  !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127));
const businessDate = z.iso.date();
export const outboundInstantSchema = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const dedupeIdentitySchema = z.object({
  workspaceId: z.uuid(), kind: opaque, target: opaque, businessKey: opaque, businessDate,
}).strict();

export function outboundDedupeKey(input: unknown): string {
  const key = dedupeIdentitySchema.parse(input);
  const tuple = [key.workspaceId.toLowerCase(), key.kind, key.target, key.businessKey, key.businessDate];
  return `outbound:v1:${createHash("sha256").update(JSON.stringify(tuple)).digest("hex")}`;
}

export const deliveryOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("acknowledged") }).strict(),
  z.object({ kind: z.literal("unknown") }).strict(),
  z.object({ kind: z.literal("retryable_failure"), reason: z.enum(["REMOTE_RATE_LIMITED", "REMOTE_UNAVAILABLE"]) }).strict(),
  z.object({ kind: z.literal("permanent_failure"), reason: z.enum([
    "UNTRUSTED_DESTINATION", "INVALID_TARGET", "UNSUPPORTED_MESSAGE", "REMOTE_REJECTED",
    "NO_CHANNEL_FOR_WORKSPACE", "NO_DM_BINDING", "UNSUPPORTED_KIND",
  ]) }).strict(),
]);
export type OutboundDeliveryOutcome = z.infer<typeof deliveryOutcomeSchema>;

const attemptSchema = z.object({
  // The claim has already incremented attempts. consecutiveUnknown is the
  // number of preceding attempts, not including this in-flight send.
  attempts: z.number().int().min(1).max(5),
  consecutiveUnknown: z.number().int().min(0).max(1),
  observedAt: outboundInstantSchema,
}).strict().refine(value => value.consecutiveUnknown < value.attempts);

export interface OutboundDeliveryState {
  status: "queued" | "sent" | "failed";
  sentAt: string | null;
  runAfter: string | null;
  consecutiveUnknown: number;
  failReason: "UNKNOWN_OUTCOME" | "ATTEMPTS_EXHAUSTED" | "REMOTE_RATE_LIMITED" | "REMOTE_UNAVAILABLE"
    | "UNTRUSTED_DESTINATION" | "INVALID_TARGET" | "UNSUPPORTED_MESSAGE" | "REMOTE_REJECTED"
    | "NO_CHANNEL_FOR_WORKSPACE" | "NO_DM_BINDING" | "UNSUPPORTED_KIND" | null;
}

/** arch v1.9.46: bounded at-least-once attempts, not exactly-once delivery. */
export function nextOutboundDeliveryState(input: unknown, result: unknown): OutboundDeliveryState {
  const attempt = attemptSchema.parse(input);
  const outcome = deliveryOutcomeSchema.parse(result);
  const base: OutboundDeliveryState = { status: "failed", sentAt: null, runAfter: null, consecutiveUnknown: 0, failReason: null };
  if (outcome.kind === "acknowledged") return { ...base, status: "sent", sentAt: attempt.observedAt };
  if (outcome.kind === "permanent_failure") return { ...base, failReason: outcome.reason };
  const consecutiveUnknown = outcome.kind === "unknown" ? attempt.consecutiveUnknown + 1 : 0;
  if (consecutiveUnknown >= 2) return { ...base, consecutiveUnknown, failReason: "UNKNOWN_OUTCOME" };
  if (attempt.attempts >= 5) return { ...base, consecutiveUnknown, failReason: "ATTEMPTS_EXHAUSTED" };
  // Deployment may tick less often; runAfter is earliest eligibility, not an SLA.
  const runAfter = new Date(Date.parse(attempt.observedAt) + 60_000 * 2 ** (attempt.attempts - 1)).toISOString();
  return { ...base, status: "queued", consecutiveUnknown, runAfter,
    failReason: outcome.kind === "unknown" ? "UNKNOWN_OUTCOME" : outcome.reason };
}

/** Call only with a persisted sent_at from a matching workspace/dedupe key. */
export function wasOutboundSentRecently(sentAt: unknown, now: unknown): boolean {
  const observed = Date.parse(outboundInstantSchema.parse(now));
  if (sentAt === null) return false;
  const sent = Date.parse(outboundInstantSchema.parse(sentAt));
  if (sent > observed) throw new Error("Invalid outbound sent evidence");
  return observed - sent <= 86_400_000;
}
