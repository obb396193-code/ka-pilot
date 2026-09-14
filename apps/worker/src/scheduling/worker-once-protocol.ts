import { z } from "zod";
import { workerOnceJobTypes } from "./worker-once.js";
import { workerOnceFailureCodeSchema } from "./worker-once-failure.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/**
 * P-198：出站单轮的计数。每条领取到的行最多落进 sent / retried / failed / deduplicated 之一；
 * 中途被打断时领取数可以大于四项之和，反过来不行。
 */
export const outboundPassCountsSchema = z.object({
  claimed: count, sent: count, retried: count, failed: count, deduplicated: count,
}).strict().refine((value) => value.sent + value.retried + value.failed + value.deduplicated <= value.claimed);
export type OutboundPassCounts = z.infer<typeof outboundPassCountsSchema>;

export const workerOnceMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("job_state"), phase: z.enum(["tick", "consumer"]),
    jobId: z.string().uuid(), jobType: z.enum(workerOnceJobTypes),
    status: z.enum(["leased", "running", "done", "queued", "failed", "blocked_auth"]),
  }).strict(),
  z.object({ kind: z.literal("terminal"), status: z.enum(["completed", "blocked_auth"]) }).strict(),
  z.object({ kind: z.literal("failure"), code: workerOnceFailureCodeSchema }).strict(),
  /** P-198：出站 child 在 terminal 之前报一次本轮结果；ETL child 不发这条。 */
  z.object({
    kind: z.literal("outbound_pass"), status: z.enum(["locked", "drained", "batch_limit"]), counts: outboundPassCountsSchema,
  }).strict(),
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
export interface OutboundPass { status: "locked" | "drained" | "batch_limit"; counts: OutboundPassCounts }
export type WorkerOnceOutcome = Omit<WorkerOnceResponse, "status"> & {
  status: WorkerOnceResponse["status"] | "aborted";
  /** 只有出站 child 正常结束时才有；被超时或中止杀掉时不带，计数没回来就不编。 */
  outbound?: OutboundPass;
};

/**
 * `POST /internal/worker/outbound-once` 的成功形。`locked`（这个空间已有一轮在跑）不在这里，回 409；
 * `budget` 时 child 已被杀、计数没回来，只能是 null。
 */
export const outboundOnceResponseSchema = z.object({
  status: z.enum(["drained", "batch_limit", "budget"]),
  outbound: outboundPassCountsSchema.nullable(),
}).strict().refine((value) => (value.status === "budget") === (value.outbound === null));
export type OutboundOnceResponse = z.infer<typeof outboundOnceResponseSchema>;
