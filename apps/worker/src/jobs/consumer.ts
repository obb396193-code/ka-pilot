import type { JobRepositoryPort } from "@ka/db";

import { BlockedAuthError } from "../qihang/errors.js";
import { retryDelayMs } from "./retry.js";
import type { JobHandlers } from "./types.js";

export interface JobConsumerOptions {
  leaseSeconds?: number;
  retryBaseMs?: number;
  now?: () => Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

export class JobConsumer {
  private readonly leaseSeconds: number;
  private readonly retryBaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: JobRepositoryPort,
    private readonly handlers: JobHandlers,
    options: JobConsumerOptions = {},
  ) {
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.retryBaseMs = options.retryBaseMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
  }

  async processOnce(): Promise<boolean> {
    const job = await this.repository.leaseNext(this.leaseSeconds);
    if (!job) {
      return false;
    }

    try {
      await this.repository.markRunning(job.id);
      const handler = this.handlers[job.jobType];
      if (!handler) {
        throw new Error(`No handler registered for job type ${job.jobType}`);
      }
      await handler(job);
      await this.repository.markDone(job.id);
    } catch (error) {
      if (error instanceof BlockedAuthError) {
        await this.repository.markBlockedAuth(job.id, errorMessage(error));
        return true;
      }
      const retryAt = new Date(
        this.now().getTime() + retryDelayMs(job.attempts, this.retryBaseMs),
      );
      await this.repository.markFailure(job, errorMessage(error), retryAt);
    }
    return true;
  }

  async run(signal: AbortSignal, pollIntervalMs = 1_000): Promise<void> {
    while (!signal.aborted) {
      const processed = await this.processOnce();
      if (!processed) {
        await waitForAbortOrDelay(signal, pollIntervalMs);
      }
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
