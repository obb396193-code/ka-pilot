import { describe, expect, it, vi } from "vitest";
import { runOutboundOnce, type OutboundOncePorts } from "../src/notifications/outbound-once.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const at = "2026-09-13T08:00:00.000Z";
function row(id = "33333333-3333-4333-8333-333333333333") {
  return { id, workspaceId, channel: "dingtalk", leaseToken: "44444444-4444-4444-8444-444444444444",
    target: "user:synthetic", kind: "job_failed", payload: { jobId: "synthetic" },
    dedupeKey: `outbound:v1:${"a".repeat(64)}`, attempts: 1, consecutiveUnknown: 0, sentAt: null };
}
function setup() {
  const release = vi.fn(async () => undefined);
  const ports = {
    lock: vi.fn(async (_controller: AbortController) => { void _controller; return release; }),
    store: { claim: vi.fn(async (_workspace: string) => { void _workspace; return null as unknown; }),
      findRecentSent: vi.fn(async (_claim: unknown, _now: string) => { void _claim; void _now; return null as unknown; }),
      finish: vi.fn(async () => undefined), markDeduplicated: vi.fn(async () => undefined) },
    transport: { send: vi.fn(async (_claim: unknown, _signal: AbortSignal) => { void _claim; void _signal; return { kind: "acknowledged" }; }) },
    now: vi.fn(() => at),
  } satisfies OutboundOncePorts;
  const options = { workspaceId, configured: true, batchSize: 2 };
  return { ports, release, options };
}
describe("P198 bounded outbound pass, no real external sends", () => {
  it("missing credentials skips the whole pass without touching DB or locks", async () => {
    const { ports, options } = setup();
    expect(await runOutboundOnce({ ...options, configured: false }, ports)).toEqual({ status: "not_configured", claimed: 0, sent: 0, retried: 0, failed: 0, deduplicated: 0 });
    expect(ports.lock).not.toHaveBeenCalled();
    expect(ports.store.claim).not.toHaveBeenCalled();
  });
  it("does not run a second instance when the shared lock is unavailable", async () => {
    const { ports, options } = setup();
    expect(await runOutboundOnce(options, { ...ports, lock: async () => null })).toMatchObject({ status: "locked", claimed: 0 });
    expect(ports.store.claim).not.toHaveBeenCalled();
  });
  it("claims, dedupes, sends, persists acknowledgement and releases the lock", async () => {
    const { ports, release, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row());
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "drained", claimed: 1, sent: 1 });
    expect(ports.store.claim).toHaveBeenCalledWith(workspaceId);
    expect(ports.store.finish).toHaveBeenCalledWith(row(), expect.objectContaining({ status: "sent", sentAt: at }));
    expect(ports.store.findRecentSent.mock.invocationCallOrder[0]).toBeLessThan(ports.transport.send.mock.invocationCallOrder[0]!);
    expect(ports.store.claim.mock.invocationCallOrder[0]).toBeLessThan(ports.transport.send.mock.invocationCallOrder[0]!);
    expect(release).toHaveBeenCalledOnce();
  });
  it("matching recent sent evidence suppresses delivery without fabricating another sent", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row());
    ports.store.findRecentSent.mockResolvedValue({ workspaceId, dedupeKey: row().dedupeKey, sentAt: at });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ deduplicated: 1, sent: 0 });
    expect(ports.store.markDeduplicated).toHaveBeenCalledWith(row());
    expect(ports.transport.send).not.toHaveBeenCalled();
    expect(ports.store.finish).not.toHaveBeenCalled();
  });
  it("old sent evidence does not suppress this day's eligible delivery", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row());
    ports.store.findRecentSent.mockResolvedValue({ workspaceId, dedupeKey: row().dedupeKey, sentAt: "2026-09-12T07:59:59Z" });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ sent: 1 });
  });
  it.each([
    { workspaceId: otherWorkspaceId }, { dedupeKey: `outbound:v1:${"b".repeat(64)}` }, { sentAt: "2026-09-14T00:00:00Z" },
  ])("rejects inconsistent sent evidence: %j", async changed => {
    const { ports, release, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row());
    ports.store.findRecentSent.mockResolvedValue({ workspaceId, dedupeKey: row().dedupeKey, sentAt: at, ...changed });
    await expect(runOutboundOnce(options, ports)).rejects.toThrow("OUTBOUND_PASS_FAILED");
    expect(ports.transport.send).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([
    { workspaceId: otherWorkspaceId }, { channel: "inbox" }, { attempts: 6 }, { attempts: 0 },
    { consecutiveUnknown: 2 }, { consecutiveUnknown: 1 }, { sentAt: at }, { leaseToken: null }, { dedupeKey: "" },
  ])("rejects unsafe claims before sending: %j", async changed => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce({ ...row(), ...changed });
    await expect(runOutboundOnce(options, ports)).rejects.toThrow("OUTBOUND_PASS_FAILED");
    expect(ports.transport.send).not.toHaveBeenCalled();
  });
  it("is bounded even if the queue never drains", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row()).mockResolvedValueOnce(row("55555555-5555-4555-8555-555555555555"));
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "batch_limit", claimed: 2, sent: 2 });
    expect(ports.store.claim).toHaveBeenCalledTimes(2);
  });
  it("never resends a repeated claim id within one pass", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValue(row());
    await expect(runOutboundOnce(options, ports)).rejects.toThrow("OUTBOUND_PASS_FAILED");
    expect(ports.transport.send).toHaveBeenCalledTimes(1);
  });
  it.each(["throws", "invalid-envelope"])("transport %s is unknown, not sent or a raw error leak", async mode => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce(row());
    if (mode === "throws") ports.transport.send.mockRejectedValue(new Error("https://secret.invalid/token"));
    else ports.transport.send.mockResolvedValue({ kind: "not-valid" });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ retried: 1, sent: 0 });
    expect(ports.store.finish).toHaveBeenCalledWith(row(), expect.objectContaining({ status: "queued", failReason: "UNKNOWN_OUTCOME" }));
    expect(JSON.stringify(ports.store.finish.mock.calls)).not.toContain("secret.invalid");
  });
  it("second unknown result fails, known retry resets the consecutive counter", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce({ ...row(), attempts: 2, consecutiveUnknown: 1 });
    ports.transport.send.mockResolvedValue({ kind: "unknown" });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ failed: 1, sent: 0 });
  });
  it("persistence failure stops the pass rather than claiming or sending more", async () => {
    const { ports, release, options } = setup();
    ports.store.claim.mockResolvedValue(row());
    ports.store.finish.mockRejectedValue(new Error("SQL_SECRET"));
    await expect(runOutboundOnce(options, ports)).rejects.toThrow(/^OUTBOUND_PASS_FAILED$/);
    expect(ports.store.claim).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledOnce();
  });
  it("an already aborted pass touches no DB", async () => {
    const { ports, options } = setup();
    expect(await runOutboundOnce(options, ports, AbortSignal.abort())).toMatchObject({ status: "aborted" });
    expect(ports.lock).not.toHaveBeenCalled();
  });
  it("lock loss during dedupe stops before transport", async () => {
    const { ports, release, options } = setup();
    let lockController: AbortController;
    ports.lock.mockImplementation(async controller => { lockController = controller; return release; });
    ports.store.claim.mockResolvedValueOnce(row());
    ports.store.findRecentSent.mockImplementation(async () => { lockController.abort(); return null; });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "aborted", claimed: 1 });
    expect(ports.transport.send).not.toHaveBeenCalled();
    expect(ports.store.finish).not.toHaveBeenCalled();
  });
  it("abort during send retains sending for fenced unknown recovery, never records sent", async () => {
    const { ports, options } = setup();
    const stop = new AbortController();
    ports.store.claim.mockResolvedValueOnce(row());
    ports.transport.send.mockImplementation(async (_row, signal) => { stop.abort(); expect(signal.aborted).toBe(true); return { kind: "acknowledged" }; });
    expect(await runOutboundOnce(options, ports, stop.signal)).toMatchObject({ status: "aborted", sent: 0 });
    expect(ports.store.finish).not.toHaveBeenCalled();
  });
  it("invalid config fails before lock acquisition", async () => {
    const { ports, options } = setup();
    await expect(runOutboundOnce({ ...options, batchSize: 101 }, ports)).rejects.toThrow(/^OUTBOUND_CONFIG_INVALID$/);
    expect(ports.lock).not.toHaveBeenCalled();
  });
  it("known retryable result schedules another attempt without treating it as unknown", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValueOnce({ ...row(), attempts: 2, consecutiveUnknown: 1 });
    const result = await runOutboundOnce(options, { ...ports, transport: { send: async () => ({ kind: "retryable_failure", reason: "REMOTE_RATE_LIMITED" }) } });
    expect(result).toMatchObject({ retried: 1, failed: 0 });
    expect(ports.store.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ consecutiveUnknown: 0, failReason: "REMOTE_RATE_LIMITED" }));
  });
  it("lock failure is sanitized and no claim is made", async () => {
    const { ports, options } = setup();
    ports.lock.mockRejectedValue(new Error("postgres://private"));
    await expect(runOutboundOnce(options, ports)).rejects.toThrow(/^OUTBOUND_PASS_FAILED$/);
    expect(ports.store.claim).not.toHaveBeenCalled();
  });
  it("lock release failure is observable but sanitized", async () => {
    const { ports, release, options } = setup();
    release.mockRejectedValue(new Error("postgres://private"));
    await expect(runOutboundOnce(options, ports)).rejects.toThrow(/^OUTBOUND_LOCK_RELEASE_FAILED$/);
  });
  it("lock already lost at acquisition prevents claiming", async () => {
    const { ports, release, options } = setup();
    ports.lock.mockImplementation(async controller => { controller.abort(); return release; });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "aborted" });
    expect(ports.store.claim).not.toHaveBeenCalled();
  });
  it("lock loss while claiming leaves the claim to recovery without sending", async () => {
    const { ports, release, options } = setup();
    let lockController: AbortController;
    ports.lock.mockImplementation(async controller => { lockController = controller; return release; });
    ports.store.claim.mockImplementation(async () => { lockController.abort(); return row(); });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "aborted", claimed: 1 });
    expect(ports.transport.send).not.toHaveBeenCalled();
  });
  it("bounded store maintenance is batch_limit, never a falsely drained queue", async () => {
    const { ports, options } = setup();
    ports.store.claim.mockResolvedValue({ maintenanceLimit: true });
    expect(await runOutboundOnce(options, ports)).toMatchObject({ status: "batch_limit", claimed: 0, sent: 0 });
    expect(ports.transport.send).not.toHaveBeenCalled();
  });
});
