import { describe, expect, it } from "vitest";
import { deliveryOutcomeSchema, nextOutboundDeliveryState, outboundDedupeKey, wasOutboundSentRecently } from "../src/outbound-delivery.js";

const identity = { workspaceId: "11111111-1111-4111-8111-111111111111", kind: "job_failed", target: "user:synthetic",
  businessKey: "job:synthetic", businessDate: "2026-09-13" };
const at = "2026-09-13T08:00:00.000Z";
const attempt = { attempts: 1, consecutiveUnknown: 0, observedAt: at };

describe("P198 deterministic delivery policy (synthetic data)", () => {
  it("uses a stable versioned hash of the five-tuple, not raw concatenation", () => {
    expect(outboundDedupeKey(identity)).toMatch(/^outbound:v1:[a-f0-9]{64}$/);
    expect(outboundDedupeKey({ ...identity })).toBe(outboundDedupeKey(identity));
    expect(outboundDedupeKey({ ...identity, target: "a:b", businessKey: "c" }))
      .not.toBe(outboundDedupeKey({ ...identity, target: "a", businessKey: "b:c" }));
  });
  it.each([
    { workspaceId: "22222222-2222-4222-8222-222222222222" }, { kind: "job_blocked_auth" },
    { target: "user:other" }, { businessKey: "job:other" }, { businessDate: "2026-09-14" },
  ])("isolates every identity component: %j", changed => {
    expect(outboundDedupeKey({ ...identity, ...changed })).not.toBe(outboundDedupeKey(identity));
  });
  it.each([
    { workspaceId: null }, { businessKey: "" }, { businessDate: "2026-02-31" },
    { businessDate: "2026-2-01" }, { target: "x\ny" }, { extra: "secret" }, { kind: " " },
  ])("fails closed on incomplete/invalid identity: %j", changed => {
    expect(() => outboundDedupeKey({ ...identity, ...changed })).toThrow();
  });
  it("accepts real leap dates", () => {
    expect(outboundDedupeKey({ ...identity, businessDate: "2024-02-29" })).toMatch(/^outbound:v1:/);
  });
  it("only acknowledgements become sent; fifth acknowledged attempt is valid", () => {
    expect(nextOutboundDeliveryState({ ...attempt, attempts: 5, consecutiveUnknown: 1 }, { kind: "acknowledged" }))
      .toEqual({ status: "sent", sentAt: at, runAfter: null, failReason: null, consecutiveUnknown: 0 });
  });
  it("retries the first unknown, never marking it sent", () => {
    expect(nextOutboundDeliveryState(attempt, { kind: "unknown" })).toEqual({ status: "queued", sentAt: null,
      runAfter: "2026-09-13T08:01:00.000Z", failReason: "UNKNOWN_OUTCOME", consecutiveUnknown: 1 });
  });
  it("two consecutive unknowns become terminal even before attempt five", () => {
    expect(nextOutboundDeliveryState({ ...attempt, attempts: 2, consecutiveUnknown: 1 }, { kind: "unknown" }))
      .toEqual({ status: "failed", sentAt: null, runAfter: null, failReason: "UNKNOWN_OUTCOME", consecutiveUnknown: 2 });
  });
  it("a known failure resets consecutive unknowns, without resetting total attempts", () => {
    const known = nextOutboundDeliveryState({ ...attempt, attempts: 2, consecutiveUnknown: 1 },
      { kind: "retryable_failure", reason: "REMOTE_UNAVAILABLE" });
    expect(known).toEqual({ status: "queued", sentAt: null, runAfter: "2026-09-13T08:02:00.000Z",
      failReason: "REMOTE_UNAVAILABLE", consecutiveUnknown: 0 });
    expect(nextOutboundDeliveryState({ ...attempt, attempts: 3, consecutiveUnknown: known.consecutiveUnknown },
      { kind: "unknown" }).status).toBe("queued");
  });
  it.each([1, 2, 3, 4])("exponential retry after attempt %i", attempts => {
    expect(nextOutboundDeliveryState({ ...attempt, attempts }, { kind: "retryable_failure", reason: "REMOTE_RATE_LIMITED" }).runAfter)
      .toBe(new Date(Date.parse(at) + 60_000 * 2 ** (attempts - 1)).toISOString());
  });
  it.each([{ kind: "unknown" }, { kind: "retryable_failure", reason: "REMOTE_UNAVAILABLE" }])("caps attempts at five: %j", outcome => {
    expect(nextOutboundDeliveryState({ ...attempt, attempts: 5 }, outcome))
      .toMatchObject({ status: "failed", runAfter: null, sentAt: null, failReason: "ATTEMPTS_EXHAUSTED" });
  });
  it.each(["UNTRUSTED_DESTINATION", "INVALID_TARGET", "UNSUPPORTED_MESSAGE", "REMOTE_REJECTED", "NO_CHANNEL_FOR_WORKSPACE", "NO_DM_BINDING", "UNSUPPORTED_KIND"])("permanent failure never retries: %s", reason => {
    expect(nextOutboundDeliveryState(attempt, { kind: "permanent_failure", reason }))
      .toMatchObject({ status: "failed", sentAt: null, runAfter: null, failReason: reason });
  });
  it.each([
    { attempts: 0 }, { attempts: 6 }, { attempts: 1.5 }, { consecutiveUnknown: 2 },
    { consecutiveUnknown: 1 }, { observedAt: "2026-02-31T00:00:00Z" }, { unexpected: true },
  ])("rejects impossible attempt state: %j", changed => {
    expect(() => nextOutboundDeliveryState({ ...attempt, ...changed }, { kind: "unknown" })).toThrow();
  });
  it("rejects unrecognized or secret-bearing transport output", () => {
    expect(deliveryOutcomeSchema.safeParse({ kind: "acknowledged", raw: "secret" }).success).toBe(false);
    expect(() => nextOutboundDeliveryState(attempt, { kind: "permanent_failure", reason: "https://secret" })).toThrow();
  });
  it("dedupes only sent evidence in the preceding 24h; rejects future/invalid evidence", () => {
    expect(wasOutboundSentRecently(null, at)).toBe(false);
    expect(wasOutboundSentRecently("2026-09-12T08:00:00.000Z", at)).toBe(true);
    expect(wasOutboundSentRecently("2026-09-12T07:59:59.999Z", at)).toBe(false);
    expect(wasOutboundSentRecently(at, at)).toBe(true);
    expect(() => wasOutboundSentRecently("2026-09-13T08:00:00.001Z", at)).toThrow();
    expect(() => wasOutboundSentRecently("invalid", at)).toThrow();
  });
});
