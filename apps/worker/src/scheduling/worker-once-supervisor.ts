import type { ChildProcess } from "node:child_process";
import { z } from "zod";
import type { JobStateEvent } from "../jobs/consumer.js";
import { workerOnceJobTypes } from "./worker-once.js";

const eventSchema = z.object({
  jobId: z.string().uuid(), jobType: z.enum(workerOnceJobTypes),
  status: z.enum(["leased", "running", "done", "queued", "failed", "blocked_auth"]),
}).strict();

/** A deadline is complete only after the OS closes the child, not when a timer wins. */
export async function superviseWorkerOnce(options: {
  maxMs: number;
  startChild(): ChildProcess;
  onJobState?: (event: JobStateEvent) => void;
  signal?: AbortSignal;
}): Promise<"completed" | "budget" | "aborted"> {
  if (!Number.isInteger(options.maxMs) || options.maxMs <= 0 || options.maxMs > 2_147_483_647) throw new Error("Worker once failed");
  if (options.signal?.aborted) return "aborted";
  let child: ChildProcess;
  try { child = options.startChild(); } catch { throw new Error("Worker once failed"); }
  return new Promise((resolve, reject) => {
    let outcome: "budget" | "aborted" | "failed" | undefined;
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
      const parsed = eventSchema.safeParse(message);
      if (!parsed.success) { stop("failed"); return; }
      try { options.onJobState?.(parsed.data); } catch { /* Telemetry cannot rewrite execution state. */ }
    };
    const timer = setTimeout(() => stop("budget"), options.maxMs);
    const onClose = (code: number | null): void => {
      closed = true;
      clearTimeout(timer);
      child.removeListener("message", onMessage);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      options.signal?.removeEventListener("abort", onAbort);
      if (outcome === "failed" || (!outcome && code !== 0)) reject(new Error("Worker once failed"));
      else resolve(outcome ?? "completed");
    };
    child.on("message", onMessage);
    child.on("error", onError);
    child.once("close", onClose);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
  });
}
