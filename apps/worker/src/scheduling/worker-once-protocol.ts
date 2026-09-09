import { z } from "zod";
import { workerOnceJobTypes } from "./worker-once.js";
import { workerOnceFailureCodeSchema } from "./worker-once-failure.js";

export const workerOnceMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("job_state"), phase: z.enum(["tick", "consumer"]),
    jobId: z.string().uuid(), jobType: z.enum(workerOnceJobTypes),
    status: z.enum(["leased", "running", "done", "queued", "failed", "blocked_auth"]),
  }).strict(),
  z.object({ kind: z.literal("terminal"), status: z.enum(["completed", "blocked_auth"]) }).strict(),
  z.object({ kind: z.literal("failure"), code: workerOnceFailureCodeSchema }).strict(),
]);

export const workerOnceResponseSchema = z.object({
  status: z.enum(["completed", "budget", "blocked_auth"]),
  jobs: z.object({
    leased: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    done: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    failed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict().refine((jobs) => jobs.done + jobs.failed <= jobs.leased),
}).strict();
export type WorkerOnceResponse = z.infer<typeof workerOnceResponseSchema>;
export type WorkerOnceOutcome = Omit<WorkerOnceResponse, "status"> & { status: WorkerOnceResponse["status"] | "aborted" };
