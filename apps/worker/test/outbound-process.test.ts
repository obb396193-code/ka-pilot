import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { outboundConfigForWorkerHttp } from "../src/notifications/outbound-process.js";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";

const counts = { claimed: 3, sent: 1, retried: 1, failed: 0, deduplicated: 1 };
const noJobs = { leased: 0, done: 0, failed: 0 };
function fakeChild() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(() => { setTimeout(() => child.emit("close", null, "SIGKILL"), 10); return true; }) });
  return { child, start: () => child as unknown as ChildProcess };
}
afterEach(() => { vi.useRealTimers(); });

/** P-198：出站 child 在结束前报一次本轮结果，HTTP 入口靠它区分「发完了」与「空间被占着」。 */
describe("P-198 outbound child reports its pass before terminating", () => {
  it("carries the pass result on a completed outcome", async () => {
    const c = fakeChild(), run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    c.child.emit("message", { kind: "outbound_pass", status: "drained", counts });
    c.child.emit("message", { kind: "terminal", status: "completed" }); c.child.emit("close", 0, null);
    await expect(run).resolves.toEqual({ status: "completed", jobs: noJobs, outbound: { status: "drained", counts } });
    expect(c.child.kill).not.toHaveBeenCalled();
  });
  it("drops the counts when the deadline kills the child before it terminates", async () => {
    vi.useFakeTimers(); const c = fakeChild(), run = superviseWorkerOnce({ maxMs: 100, startChild: c.start });
    c.child.emit("message", { kind: "outbound_pass", status: "drained", counts });
    await vi.advanceTimersByTimeAsync(120);
    await expect(run).resolves.toEqual({ status: "budget", jobs: noJobs });
  });
  it.each([
    ["after terminal", [{ kind: "terminal", status: "completed" }, { kind: "outbound_pass", status: "drained", counts }]],
    ["twice", [{ kind: "outbound_pass", status: "drained", counts }, { kind: "outbound_pass", status: "locked", counts }]],
    ["with more outcomes than claims", [{ kind: "outbound_pass", status: "drained", counts: { ...counts, sent: 3 } }]],
    ["with private fields", [{ kind: "outbound_pass", status: "drained", counts, webhook: "https://synthetic.invalid/secret" }]],
    ["with an unknown status", [{ kind: "outbound_pass", status: "sent", counts }]],
  ])("rejects an outbound pass %s", async (_label, messages) => {
    vi.useFakeTimers(); const c = fakeChild(), run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    const checked = expect(run).rejects.toThrow("Worker once failed");
    for (const message of messages) c.child.emit("message", message);
    await vi.advanceTimersByTimeAsync(20); await checked;
    expect(c.child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("P-198 outbound config for the worker HTTP entry", () => {
  const workspaceId = "00000000-0000-4000-8000-000000000201";
  const env = { DATABASE_URL: "postgres://synthetic.invalid/test", KA_WEB_BASE_URL: "https://ka.example.test" };
  it("stays off when outbound is not configured", () => {
    expect(outboundConfigForWorkerHttp(env, workspaceId)).toBeNull();
  });
  it("refuses another workspace or an invalid config at startup, accepts the worker's own", () => {
    expect(() => outboundConfigForWorkerHttp({ ...env, OUTBOUND_WORKSPACE_ID: "00000000-0000-4000-8000-000000000202" }, workspaceId)).toThrow();
    expect(() => outboundConfigForWorkerHttp({ ...env, OUTBOUND_WORKSPACE_ID: "" }, workspaceId)).toThrow();
    expect(() => outboundConfigForWorkerHttp({ ...env, OUTBOUND_WORKSPACE_ID: "not-a-uuid" }, workspaceId)).toThrow();
    expect(outboundConfigForWorkerHttp({ ...env, OUTBOUND_WORKSPACE_ID: workspaceId }, workspaceId)?.workspaceId).toBe(workspaceId);
  });
});
