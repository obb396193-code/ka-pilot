import type { ChildProcess } from "node:child_process";
import type { JobStateEvent } from "../jobs/consumer.js";
import { workerOnceMessageSchema, type WorkerOnceOutcome } from "./worker-once-protocol.js";

/** A deadline is complete only after the OS closes the child, not when a timer wins. */
export async function superviseWorkerOnce(options: {
  maxMs: number;
  startChild(): ChildProcess;
  onJobState?: (event: JobStateEvent) => void;
  signal?: AbortSignal;
}): Promise<WorkerOnceOutcome> {
  if (!Number.isInteger(options.maxMs) || options.maxMs <= 0 || options.maxMs > 2_147_483_647) throw new Error("Worker once failed");
  const jobs = { leased: 0, done: 0, failed: 0 };
  if (options.signal?.aborted) return { status: "aborted", jobs };
  let child: ChildProcess;
  try { child = options.startChild(); } catch { throw new Error("Worker once failed"); }
  return new Promise((resolve, reject) => {
    let outcome: "budget" | "aborted" | "failed" | undefined;
    let terminal: "completed" | "blocked_auth" | undefined;
    let blocked = false;
    let closed = false;
    const stop = (reason: "budget" | "aborted" | "failed"): void => {
      if (closed || outcome) return;
      outcome = reason;
      // Do not report cancellation until close confirms termination. A failed kill
      // is not proof of termination; still wait for the child lifecycle event.
      try { child.kill("SIGKILL"); } catch { outcome = "failed"; }
    };
    const onAbort = (): void => stop("aborted");
    const onError = (): void => stop("failed");
    const onMessage = (message: unknown): void => {
      if (outcome) return;
      const parsed = workerOnceMessageSchema.safeParse(message);
      if (!parsed.success || terminal) { stop("failed"); return; }
      const value = parsed.data;
      if (value.kind === "terminal") {
        if ((value.status === "blocked_auth") !== blocked) { stop("failed"); return; }
        terminal = value.status;
        return;
      }
      if (value.status === "blocked_auth") blocked = true;
      if (value.phase === "consumer" && (value.status === "leased" || value.status === "done" || value.status === "failed")) {
        jobs[value.status]++;
        if (!Number.isSafeInteger(jobs[value.status]) || jobs.done + jobs.failed > jobs.leased) { stop("failed"); return; }
      }
      try { options.onJobState?.({ jobId: value.jobId, jobType: value.jobType, status: value.status }); }
      catch { /* Telemetry cannot rewrite execution state. */ }
    };
    const timer = setTimeout(() => stop("budget"), options.maxMs);
    const onClose = (code: number | null): void => {
      closed = true;
      clearTimeout(timer);
      child.removeListener("message", onMessage);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      options.signal?.removeEventListener("abort", onAbort);
      if (outcome === "failed" || (!outcome && (code !== 0 || !terminal))) reject(new Error("Worker once failed"));
      else resolve({ status: outcome ?? terminal!, jobs });
    };
    child.on("message", onMessage);
    child.on("error", onError);
    child.once("close", onClose);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
  });
}
