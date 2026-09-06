import { describe, expect, it, vi } from "vitest";
import { parseWorkerOnceConfig, runWorkerOnceIteration } from "../src/scheduling/worker-once.js";

const workspaceId = "00000000-0000-4000-8000-000000000101";
const userId = "00000000-0000-4000-8000-000000000102";
const jobId = "00000000-0000-4000-8000-000000000103";
const env = { DATABASE_URL: "postgres://synthetic.invalid/test", QIHANG_BASE_URL: "https://synthetic.invalid/get_data", WORKER_ONCE_WORKSPACE_ID: workspaceId, WORKER_ONCE_MEDIA: "KUAISHOU" };
const request = { workspaceId, media: "KUAISHOU", mode: "auto" as const, triggeredAt: "2026-09-06T06:00:00Z" };
const result = () => ({ workspaceId, media: "KUAISHOU", businessDate: "2026-09-06", mode: "auto", jobs: [{ jobId, userId, jobType: "etl_full", idempotent: false, status: "queued" }] });
function ports(value: unknown = result()) {
  return { tick: { execute: vi.fn(async () => value) }, prepare: vi.fn(async () => undefined), consumer: { processOnce: vi.fn(async () => false) }, onJobState: vi.fn() };
}

describe("worker once server config", () => {
  it("requires an explicit workspace/media/source and defaults only cadence-independent controls", () => {
    expect(parseWorkerOnceConfig(env)).toEqual({ workspaceId, media: "KUAISHOU", mode: "auto", databaseUrl: env.DATABASE_URL, qihangBaseUrl: env.QIHANG_BASE_URL, maxMs: 600_000, leaseSeconds: 60 });
  });
  it.each(["DATABASE_URL", "QIHANG_BASE_URL", "WORKER_ONCE_WORKSPACE_ID", "WORKER_ONCE_MEDIA"])("missing %s never falls back to owner/service identity", (key) => {
    const missing: Record<string, string> = { ...env }; delete missing[key];
    expect(() => parseWorkerOnceConfig(missing)).toThrow();
  });
  it.each(["0", "-1", "NaN", "2147483648"])("rejects invalid deadline %s", (value) => {
    expect(() => parseWorkerOnceConfig({ ...env, WORKER_ONCE_MAX_MS: value })).toThrow();
  });
  it("production guard runs before any config/DB access", () => {
    expect(() => parseWorkerOnceConfig({ NODE_ENV: "production", KA_DATA_DEV_TEST: "" })).toThrow("forbidden in production");
    expect(() => parseWorkerOnceConfig({ ...env, QIHANG_BASE_URL: "https://user:secret@synthetic.invalid/get_data" })).toThrow();
    expect(() => parseWorkerOnceConfig({ ...env, WORKER_ONCE_MEDIA: "bad'" })).toThrow();
  });
});
describe("single tick then bounded-by-supervisor consumption", () => {
  it("ticks before preparation and consumes until no eligible job remains", async () => {
    const p = ports(); p.consumer.processOnce.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    expect(await runWorkerOnceIteration(request, p)).toEqual({ status: "drained", attemptedJobs: 2 });
    expect(p.tick.execute).toHaveBeenCalledWith(request); expect(p.prepare).toHaveBeenCalledTimes(1);
    expect(p.prepare.mock.invocationCallOrder[0]).toBeGreaterThan(p.tick.execute.mock.invocationCallOrder[0]!);
    expect(p.consumer.processOnce.mock.invocationCallOrder[0]).toBeGreaterThan(p.prepare.mock.invocationCallOrder[0]!);
    expect(p.onJobState).toHaveBeenCalledWith({ jobId, jobType: "etl_full", status: "queued" });
    expect(JSON.stringify(p.onJobState.mock.calls)).not.toContain(userId);
  });
  it("blocked auth and no candidate do not touch recovery/partitions or consume old jobs", async () => {
    for (const jobs of [[], [{ ...result().jobs[0], status: "blocked_auth", reason: "ACCOUNT_SCOPE_MISSING" }]]) {
      const p = ports({ ...result(), jobs }); const out = await runWorkerOnceIteration(request, p);
      expect(out.status).toBe(jobs.length ? "blocked_auth" : "empty");
      expect(p.prepare).not.toHaveBeenCalled(); expect(p.consumer.processOnce).not.toHaveBeenCalled();
    }
  });
  it("rejects a substituted workspace/media/mode or malformed tick result before consuming", async () => {
    for (const override of [{ workspaceId: userId }, { media: "TENCENT" }, { mode: "full" }, { secret: "synthetic" }]) {
      const p = ports({ ...result(), ...override });
      await expect(runWorkerOnceIteration(request, p)).rejects.toThrow();
      expect(p.prepare).not.toHaveBeenCalled(); expect(p.onJobState).not.toHaveBeenCalled();
    }
  });
  it("preparation/consumer errors propagate and telemetry cannot change the result", async () => {
    const p = ports(); p.onJobState.mockImplementation(() => { throw new Error("logger disconnected"); });
    expect((await runWorkerOnceIteration(request, p)).status).toBe("drained");
    const failed = ports(); failed.prepare.mockRejectedValueOnce(new Error("prepare failed"));
    await expect(runWorkerOnceIteration(request, failed)).rejects.toThrow("prepare failed");
    expect(failed.consumer.processOnce).not.toHaveBeenCalled();
    const failedConsumer = ports(); failedConsumer.consumer.processOnce.mockRejectedValueOnce(new Error("consume failed"));
    await expect(runWorkerOnceIteration(request, failedConsumer)).rejects.toThrow("consume failed");
  });
});
