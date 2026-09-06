import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";

const event = { jobId: "00000000-0000-4000-8000-000000000103", jobType: "etl_full", status: "running" };
function fakeChild() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(() => { setTimeout(() => child.emit("close", null, "SIGKILL"), 10); return true; }) });
  return { child, start: () => child as unknown as ChildProcess };
}
afterEach(() => { vi.useRealTimers(); });
describe("worker once process supervisor", () => {
  it("kills at deadline but resolves only after the child actually closes", async () => {
    vi.useFakeTimers(); const c = fakeChild();
    const run = superviseWorkerOnce({ maxMs: 100, startChild: c.start });
    let settled = false; void run.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(100); expect(c.child.kill).toHaveBeenCalledWith("SIGKILL"); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(10); await expect(run).resolves.toBe("budget");
    expect(c.child.listenerCount("message")).toBe(0);
  });
  it("normal exit preserves validated minimal events and does not kill", async () => {
    const c = fakeChild(), output = vi.fn(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, onJobState: output });
    c.child.emit("message", event); c.child.emit("close", 0, null);
    await expect(run).resolves.toBe("completed"); expect(output).toHaveBeenCalledWith(event); expect(c.child.kill).not.toHaveBeenCalled();
  });
  it("rejects private/malformed IPC and suppresses raw errors", async () => {
    vi.useFakeTimers(); const c = fakeChild(), output = vi.fn();
    const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, onJobState: output });
    const checked = expect(run).rejects.toThrow("Worker once failed");
    c.child.emit("message", { ...event, payload: "synthetic-secret" });
    await vi.advanceTimersByTimeAsync(10); await checked; expect(output).not.toHaveBeenCalled();
    expect(c.child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("abort stops the child, while invalid deadline never spawns", async () => {
    vi.useFakeTimers(); const c = fakeChild(), controller = new AbortController();
    const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, signal: controller.signal });
    controller.abort(); await vi.advanceTimersByTimeAsync(10); await expect(run).resolves.toBe("aborted");
    const start = vi.fn(c.start);
    await expect(superviseWorkerOnce({ maxMs: 0, startChild: start })).rejects.toThrow(); expect(start).not.toHaveBeenCalled();
  });
  it("observes real process termination, not just a timed-out promise", async () => {
    let child: ChildProcess | undefined;
    const result = await superviseWorkerOnce({ maxMs: 400, startChild: () => {
      child = fork(new URL("./fixtures/worker-once-process.mjs", import.meta.url), ["hang"], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
      return child;
    } });
    expect(result).toBe("budget"); expect(child?.signalCode).toBe("SIGKILL");
    expect(() => process.kill(child!.pid!, 0)).toThrow();
  });
  it("real child can finish normally with no remaining supervisor timer", async () => {
    const output = vi.fn();
    await expect(superviseWorkerOnce({ maxMs: 3000, onJobState: output, startChild: () => fork(new URL("./fixtures/worker-once-process.mjs", import.meta.url), ["complete"], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] }) })).resolves.toBe("completed");
    expect(output).toHaveBeenCalledWith(event);
  });
});
