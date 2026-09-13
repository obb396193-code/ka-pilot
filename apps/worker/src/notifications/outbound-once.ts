import { deliveryOutcomeSchema, nextOutboundDeliveryState, outboundInstantSchema, wasOutboundSentRecently,
  type OutboundDeliveryState, durableOutboundClaimSchema as claimSchema, outboundMaintenanceLimitSchema } from "@ka/domain";
import { z } from "zod";

const configSchema = z.object({ workspaceId: z.uuid(), configured: z.boolean(), batchSize: z.number().int().min(1).max(100) }).strict();
const dedupeKeySchema = z.string().regex(/^outbound:v1:[a-f0-9]{64}$/);
const sentEvidenceSchema = z.object({ workspaceId: z.uuid(), dedupeKey: dedupeKeySchema, sentAt: outboundInstantSchema }).strict();
export type OutboundClaim = z.infer<typeof claimSchema>;

export interface OutboundOncePorts {
  /** Reuse workerOnceLock with the same workspace. Lock disconnect aborts controller. */
  lock(controller: AbortController): Promise<(() => Promise<void>) | null>;
  store: {
    /** Atomically sets sending/increments attempts and returns a new fencing token. */
    claim(workspaceId: string): Promise<unknown>;
    findRecentSent(claim: OutboundClaim, now: string): Promise<unknown>;
    /** Both updates MUST compare workspace/id/leaseToken/status and reject lost ownership. */
    finish(claim: OutboundClaim, state: OutboundDeliveryState): Promise<void>;
    markDeduplicated(claim: OutboundClaim): Promise<void>;
  };
  transport: { send(claim: OutboundClaim, signal: AbortSignal): Promise<unknown> };
  now(): string;
}
export interface OutboundPassResult {
  status: "not_configured" | "locked" | "drained" | "batch_limit" | "aborted";
  claimed: number; sent: number; retried: number; failed: number; deduplicated: number;
}

/** No production entry until recipient resolution/storage/transport are wired.
 * One bounded pass, no ETL queue consumption, no result payload in diagnostics.
 */
export async function runOutboundOnce(input: unknown, ports: OutboundOncePorts, signal?: AbortSignal): Promise<OutboundPassResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new Error("OUTBOUND_CONFIG_INVALID");
  const config = parsed.data;
  const stats: OutboundPassResult = { status: "drained", claimed: 0, sent: 0, retried: 0, failed: 0, deduplicated: 0 };
  if (!config.configured) return { ...stats, status: "not_configured" };
  if (signal?.aborted) return { ...stats, status: "aborted" };
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let release: (() => Promise<void>) | null = null;
  try {
    release = await ports.lock(controller);
    if (!release) return { ...stats, status: "locked" };
    const seen = new Set<string>();
    for (let index = 0; index < config.batchSize; index++) {
      if (controller.signal.aborted) return { ...stats, status: "aborted" };
      const raw = await ports.store.claim(config.workspaceId);
      if (raw === null) return stats;
      if (outboundMaintenanceLimitSchema.safeParse(raw).success) return { ...stats, status: "batch_limit" };
      const claim = claimSchema.parse(raw);
      if (claim.workspaceId !== config.workspaceId || seen.has(claim.id)) throw new Error("Invalid outbound claim");
      seen.add(claim.id); stats.claimed++;
      if (controller.signal.aborted) return { ...stats, status: "aborted" };
      const now = outboundInstantSchema.parse(ports.now());
      const evidence = await ports.store.findRecentSent(claim, now);
      if (controller.signal.aborted) return { ...stats, status: "aborted" };
      if (evidence !== null) {
        const sent = sentEvidenceSchema.parse(evidence);
        if (sent.workspaceId !== claim.workspaceId || sent.dedupeKey !== claim.dedupeKey) throw new Error("Invalid outbound evidence");
        if (wasOutboundSentRecently(sent.sentAt, now)) {
          await ports.store.markDeduplicated(claim);
          stats.deduplicated++;
          continue;
        }
      }
      const outcome = await send(claim, ports, controller.signal);
      // If lock ownership was lost, even a remote success cannot be committed by
      // this runner. Leave sending for fenced recovery as unknown, not as sent.
      if (controller.signal.aborted) return { ...stats, status: "aborted" };
      const state = nextOutboundDeliveryState({ attempts: claim.attempts,
        consecutiveUnknown: claim.consecutiveUnknown, observedAt: ports.now() }, outcome);
      await ports.store.finish(claim, state);
      if (state.status === "sent") stats.sent++;
      else if (state.status === "queued") stats.retried++;
      else stats.failed++;
    }
    return { ...stats, status: "batch_limit" };
  } catch {
    // Driver, schema, payload and provider exceptions may contain secrets.
    throw new Error("OUTBOUND_PASS_FAILED");
  } finally {
    signal?.removeEventListener("abort", abort);
    if (release) await releaseLock(release);
  }
}

async function releaseLock(release: () => Promise<void>): Promise<void> {
  try { await release(); } catch { throw new Error("OUTBOUND_LOCK_RELEASE_FAILED"); }
}

async function send(claim: OutboundClaim, ports: OutboundOncePorts, signal: AbortSignal) {
  try {
    const outcome = deliveryOutcomeSchema.safeParse(await ports.transport.send(claim, signal));
    // A malformed/empty acknowledgement cannot prove that the remote rejected
    // the send. Treat it exactly like a disconnected request, never as sent.
    return outcome.success ? outcome.data : { kind: "unknown" as const };
  } catch {
    return { kind: "unknown" as const };
  }
}
