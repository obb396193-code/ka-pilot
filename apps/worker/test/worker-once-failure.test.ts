import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";
import { atWorkerOnceStage, formatWorkerOnceFailure, WorkerOnceFailure } from "../src/scheduling/worker-once-failure.js";

function child() {
  const value = Object.assign(new EventEmitter(), { kill: vi.fn(() => { queueMicrotask(() => value.emit("close", null)); return true; }) });
  return { value, startChild: () => value as unknown as ChildProcess };
}
describe("safe phase diagnostics from once supervisor", () => {
  it("classifies spawn failure without copying private error", async () => {
    await expect(superviseWorkerOnce({ maxMs: 1000, startChild: () => { throw new Error("https://private.invalid/token=synthetic-secret"); } })).rejects.toMatchObject({ code: "SPAWN_FAILED", message: "Worker once failed [SPAWN_FAILED]" });
  });
  it.each([
    ["TICK_FAILED", { kind: "failure", code: "TICK_FAILED" }],
    ["INVALID_IPC", { kind: "failure", code: "TICK_FAILED", message: "synthetic-private" }],
    ["INVALID_IPC", { kind: "failure", code: "synthetic-private" }],
  ])("allows only fixed code %s", async (code, message) => {
    const c = child(), promise = superviseWorkerOnce({ maxMs: 1000, startChild: c.startChild });
    c.value.emit("message", message);
    await expect(promise).rejects.toMatchObject({ code, message: `Worker once failed [${code}]` });
  });
  it.each([[0, "MISSING_TERMINAL"], [1, "CHILD_EXIT_NONZERO"]] as const)("classifies exit %s", async (exit, code) => {
    const c = child(), promise = superviseWorkerOnce({ maxMs: 1000, startChild: c.startChild });
    c.value.emit("close", exit);
    await expect(promise).rejects.toMatchObject({ code });
  });
  it("ignores raw child error and does not settle on failed termination before close", async () => {
    const c = child(); c.value.kill.mockImplementation(() => false);
    const promise = superviseWorkerOnce({ maxMs: 1000, startChild: c.startChild });
    let settled = false; const checked = promise.catch(error => { settled = true; return error; });
    c.value.emit("error", new Error("synthetic-private-driver-error"));
    await Promise.resolve(); expect(settled).toBe(false);
    c.value.emit("close", 1);
    expect(await checked).toMatchObject({ code: "TERMINATION_FAILED", message: "Worker once failed [TERMINATION_FAILED]" });
  });
  it("classifies child error separately when kill succeeds", async () => {
    const c = child(), promise = superviseWorkerOnce({ maxMs: 1000, startChild: c.startChild });
    c.value.emit("error", new Error("synthetic-private-driver-error"));
    await expect(promise).rejects.toMatchObject({ code: "CHILD_PROCESS_ERROR" });
  });
  it.each(["TICK_FAILED", "PREPARE_FAILED", "CONSUMER_FAILED", "CLEANUP_FAILED"] as const)("safe wrapper labels %s without preserving private causes", async code => {
    const error = await atWorkerOnceStage(code, async () => { throw new Error("synthetic-private-url"); }).catch(error => error);
    expect(formatWorkerOnceFailure(error)).toBe(`Worker once failed [${code}]\n`);
    expect(error).not.toHaveProperty("cause");
  });
  it("safe formatter never trusts a lookalike error, modified message or invalid runtime code", async () => {
    expect(formatWorkerOnceFailure({ code: "TICK_FAILED", message: "private" })).toBe("Worker once failed [UNEXPECTED_FAILURE]\n");
    const error = new WorkerOnceFailure("TICK_FAILED"); error.message = "private";
    expect(formatWorkerOnceFailure(error)).toBe("Worker once failed [TICK_FAILED]\n");
    expect(formatWorkerOnceFailure(new WorkerOnceFailure("private" as never))).toBe("Worker once failed [UNEXPECTED_FAILURE]\n");
    await expect(atWorkerOnceStage("PREPARE_FAILED", async () => { throw error; })).rejects.toMatchObject({ code: "TICK_FAILED" });
    await expect(atWorkerOnceStage("PREPARE_FAILED", async () => 42)).resolves.toBe(42);
  });
});
