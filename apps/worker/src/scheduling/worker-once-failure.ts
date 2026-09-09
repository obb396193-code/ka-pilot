import { z } from "zod";

export const workerOnceFailureCodeSchema = z.enum([
  "INVALID_CONFIG", "SPAWN_FAILED", "CHILD_PROCESS_ERROR", "INVALID_IPC", "UNEXPECTED_IPC_ORDER",
  "TERMINAL_MISMATCH", "INVALID_COUNTS", "CHILD_EXIT_NONZERO", "MISSING_TERMINAL", "TERMINATION_FAILED",
  "BOOTSTRAP_FAILED", "TICK_FAILED", "PREPARE_FAILED", "CONSUMER_FAILED", "CLEANUP_FAILED", "IPC_SEND_FAILED",
  "ABORTED", "BLOCKED_AUTH", "DIAGNOSTIC_FAILED", "UNEXPECTED_FAILURE",
]);
export type WorkerOnceFailureCode = z.infer<typeof workerOnceFailureCodeSchema>;
export class WorkerOnceFailure extends Error {
  readonly code: WorkerOnceFailureCode;
  constructor(code: WorkerOnceFailureCode) {
    const parsed = workerOnceFailureCodeSchema.safeParse(code);
    const safe = parsed.success ? parsed.data : "UNEXPECTED_FAILURE";
    super(`Worker once failed [${safe}]`);
    this.name = "WorkerOnceFailure"; this.code = safe;
  }
}
export function safeWorkerOnceFailure(error: unknown, fallback: WorkerOnceFailureCode = "UNEXPECTED_FAILURE"): WorkerOnceFailure {
  return new WorkerOnceFailure(error instanceof WorkerOnceFailure ? error.code : fallback);
}
export function formatWorkerOnceFailure(error: unknown): string {
  return `${safeWorkerOnceFailure(error).message}\n`;
}
export async function atWorkerOnceStage<T>(code: WorkerOnceFailureCode, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) { throw safeWorkerOnceFailure(error, code); }
}
