import { LostJobLeaseError, type JobRecord, type JobRepositoryPort } from "@ka/db";

import { BlockedAuthError } from "../qihang/errors.js";
import { retryDelayMs } from "./retry.js";
import type { JobHandlers } from "./types.js";

export interface JobConsumerOptions {
  onJobState?: (event: JobStateEvent) => void;
  leaseSeconds?: number;
  retryBaseMs?: number;
  now?: () => Date;
  onTerminalFailure?: (job: JobRecord, failure: TerminalFailure) => Promise<void>;
  onNotificationError?: (error: unknown) => void;
  heartbeatIntervalMs?: number;
  onCompleted?: (job: JobRecord) => Promise<void>;
}

export interface JobStateEvent {
  jobId: string;
  jobType: string;
  status: "leased" | "running" | "done" | "queued" | "failed" | "blocked_auth";
}

export interface TerminalFailure {
  kind: "failed" | "blocked_auth";
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

export class JobConsumer {
  private readonly leaseSeconds: number;
  private readonly retryBaseMs: number;
  private readonly now: () => Date;
  private readonly onTerminalFailure: JobConsumerOptions["onTerminalFailure"];
  private readonly onNotificationError: JobConsumerOptions["onNotificationError"];
  private readonly heartbeatIntervalMs: number;
  private readonly onCompleted: JobConsumerOptions["onCompleted"];
  private readonly onJobState: JobConsumerOptions["onJobState"];

  constructor(
    private readonly repository: JobRepositoryPort,
    private readonly handlers: JobHandlers,
    options: JobConsumerOptions = {},
  ) {
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.retryBaseMs = options.retryBaseMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
    this.onTerminalFailure = options.onTerminalFailure;
    this.onNotificationError = options.onNotificationError;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Math.max(1_000, Math.floor((this.leaseSeconds * 1_000) / 2));
    this.onCompleted = options.onCompleted;
    this.onJobState = options.onJobState;
  }

  async processOnce(): Promise<boolean> {
    const job = await this.repository.leaseNext(this.leaseSeconds);
    if (!job) {
      return false;
    }
    this.reportState(job, "leased");

    try {
      await this.repository.markRunning(job);
      this.reportState(job, "running");
      const handler = this.handlers[job.jobType];
      if (!handler) {
        throw new Error(`No handler registered for job type ${job.jobType}`);
      }
      await this.runWithHeartbeat(job, handler);
      await this.repository.markDone(job);
      this.reportState(job, "done");
      await this.afterCompleted(job);
    } catch (error) {
      await this.handleProcessingError(job, error);
    }
    return true;
  }

  private async handleProcessingError(job: JobRecord, error: unknown): Promise<void> {
    if (error instanceof LostJobLeaseError) return;
    if (error instanceof BlockedAuthError) {
      await this.markBlockedAuth(job, errorMessage(error));
      return;
    }
    const message = errorMessage(error);
    const retryAt = new Date(
      this.now().getTime() + retryDelayMs(job.attempts, this.retryBaseMs),
    );
    try {
      await this.repository.markFailure(job, message, retryAt);
      this.reportState(job, job.attempts >= job.maxAttempts ? "failed" : "queued");
    } catch (markError) {
      if (markError instanceof LostJobLeaseError) return;
      throw markError;
    }
    if (job.attempts >= job.maxAttempts) {
      await this.notify(job, { kind: "failed", message });
    }
  }

  private async markBlockedAuth(job: JobRecord, message: string): Promise<void> {
    try {
      await this.repository.markBlockedAuth(job, message);
      this.reportState(job, "blocked_auth");
    } catch (markError) {
      if (markError instanceof LostJobLeaseError) return;
      throw markError;
    }
    await this.notify(job, { kind: "blocked_auth", message });
  }

  private async afterCompleted(job: JobRecord): Promise<void> {
    if (!this.onCompleted) {
      return;
    }
    try {
      await this.onCompleted(job);
    } catch (error) {
      this.onNotificationError?.(error);
    }
  }

  private reportState(job: JobRecord, status: JobStateEvent["status"]): void {
    try { this.onJobState?.({ jobId: job.id, jobType: job.jobType, status }); }
    catch { /* Telemetry cannot change the already committed job state. */ }
  }

  private async runWithHeartbeat(
    job: JobRecord,
    handler: JobHandlers[string],
  ): Promise<void> {
    let heartbeatError: unknown;
    let heartbeat = Promise.resolve();
    const timer = setInterval(() => {
      if (heartbeatError !== undefined) {
        return;
      }
      heartbeat = heartbeat
        .then(() => this.repository.extendLease(job, this.leaseSeconds))
        .catch((error: unknown) => {
          heartbeatError = error;
        });
    }, this.heartbeatIntervalMs);
    try {
      await handler(job);
      await heartbeat;
      if (heartbeatError !== undefined) {
        throw heartbeatError;
      }
    } finally {
      clearInterval(timer);
    }
  }

  async run(signal: AbortSignal, pollIntervalMs = 1_000): Promise<void> {
    while (!signal.aborted) {
      const processed = await this.processOnce();
      if (!processed) {
        await waitForAbortOrDelay(signal, pollIntervalMs);
      }
    }
  }

  private async notify(
    job: JobRecord,
    failure: TerminalFailure,
  ): Promise<void> {
    if (!this.onTerminalFailure) {
      return;
    }
    try {
      await this.onTerminalFailure(job, failure);
    } catch (error) {
      this.onNotificationError?.(error);
    }
  }
}

async function waitForAbortOrDelay(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, delayMs);
    signal.addEventListener("abort", done, { once: true });

    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
