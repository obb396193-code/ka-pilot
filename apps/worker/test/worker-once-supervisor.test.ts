import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";

const event = { jobId: "00000000-0000-4000-8000-000000000103", jobType: "etl_full", status: "running" };
const message = (status: string, phase = "consumer") => ({ ...event, status, kind: "job_state", phase });
const terminal = (status = "completed") => ({ kind: "terminal", status });
const outcome = (status: string, leased = 0, done = 0, failed = 0) => ({ status, jobs: { leased, done, failed } });
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
    await vi.advanceTimersByTimeAsync(10); await expect(run).resolves.toEqual(outcome("budget"));
    expect(c.child.listenerCount("message")).toBe(0);
  });
  it("normal exit preserves validated minimal events and does not kill", async () => {
    const c = fakeChild(), output = vi.fn(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, onJobState: output });
    c.child.emit("message", message("leased")); c.child.emit("message", message("running"));
    c.child.emit("message", message("done")); c.child.emit("message", terminal()); c.child.emit("close", 0, null);
    await expect(run).resolves.toEqual(outcome("completed", 1, 1)); expect(output).toHaveBeenCalledWith(event); expect(c.child.kill).not.toHaveBeenCalled();
  });
  it("rejects private/malformed IPC and suppresses raw errors", async () => {
    vi.useFakeTimers(); const c = fakeChild(), output = vi.fn();
    const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, onJobState: output });
    const checked = expect(run).rejects.toThrow("Worker once failed");
    c.child.emit("message", { ...message("running"), payload: "synthetic-secret" });
    await vi.advanceTimersByTimeAsync(10); await checked; expect(output).not.toHaveBeenCalled();
    expect(c.child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("abort stops the child, while invalid deadline never spawns", async () => {
    vi.useFakeTimers(); const c = fakeChild(), controller = new AbortController();
    const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start, signal: controller.signal });
    controller.abort(); await vi.advanceTimersByTimeAsync(10); await expect(run).resolves.toEqual(outcome("aborted"));
    const start = vi.fn(c.start);
    await expect(superviseWorkerOnce({ maxMs: 0, startChild: start })).rejects.toThrow(); expect(start).not.toHaveBeenCalled();
  });
  it("observes real process termination, not just a timed-out promise", async () => {
    let child: ChildProcess | undefined;
    const result = await superviseWorkerOnce({ maxMs: 400, startChild: () => {
      child = fork(new URL("./fixtures/worker-once-process.mjs", import.meta.url), ["hang"], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
      return child;
    } });
    expect(result).toEqual(outcome("budget", 1)); expect(child?.signalCode).toBe("SIGKILL");
    expect(() => process.kill(child!.pid!, 0)).toThrow();
  });
  it("real child can finish normally with no remaining supervisor timer", async () => {
    const output = vi.fn();
    await expect(superviseWorkerOnce({ maxMs: 3000, onJobState: output, startChild: () => fork(new URL("./fixtures/worker-once-process.mjs", import.meta.url), ["complete"], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] }) })).resolves.toEqual(outcome("completed", 1, 1));
    expect(output).toHaveBeenCalledWith(event);
  });
  it("does not count replayed tick state and returns blocked_auth independently of failed jobs", async () => {
    const c = fakeChild(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    c.child.emit("message", message("done", "tick")); c.child.emit("message", message("blocked_auth", "tick"));
    c.child.emit("message", terminal("blocked_auth")); c.child.emit("close", 0);
    await expect(run).resolves.toEqual(outcome("blocked_auth"));
  });
  it("counts lease attempts and committed final failures, not queued retries", async () => {
    const c = fakeChild(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    for (const status of ["leased", "running", "queued", "leased", "running", "failed"]) c.child.emit("message", message(status));
    c.child.emit("message", terminal()); c.child.emit("close", 0);
    await expect(run).resolves.toEqual(outcome("completed", 2, 0, 1));
  });
  it("fails closed on exit without terminal even if the exit code is zero", async () => {
    const c = fakeChild(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    c.child.emit("close", 0); await expect(run).rejects.toThrow("Worker once failed");
  });
  it.each(["double terminal", "late event", "impossible counts", "wrong blocked terminal"])("rejects %s", async (mode) => {
    vi.useFakeTimers(); const c = fakeChild(); const run = superviseWorkerOnce({ maxMs: 1000, startChild: c.start });
    const checked = expect(run).rejects.toThrow("Worker once failed");
    if (mode === "impossible counts") c.child.emit("message", message("done"));
    else if (mode === "wrong blocked terminal") {
      c.child.emit("message", message("blocked_auth", "tick")); c.child.emit("message", terminal());
    } else {
      c.child.emit("message", terminal()); c.child.emit("message", mode === "late event" ? message("leased") : terminal());
    }
    await vi.advanceTimersByTimeAsync(10); await checked;
  });
});
