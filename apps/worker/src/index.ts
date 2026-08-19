import {
  JobRepository,
  OutboundMessageRepository,
  createPool,
  runMigrations,
} from "@ka/db";

import { loadWorkerConfig } from "./config.js";
import { QihangClient } from "./qihang/client.js";
import { createWorkerConsumer } from "./runtime.js";
import { createFailureNotifier } from "./notifications/failure-notifier.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig(process.env);
  await runMigrations({ databaseUrl: config.databaseUrl });
  const pool = createPool(config.databaseUrl);
  const recovery = await new JobRepository(pool).recoverStaleLeases(10 * 60);
  const notifyFailure = createFailureNotifier(new OutboundMessageRepository(pool));
  await Promise.all(
    recovery.failed.map((job) =>
      notifyFailure(job, {
        kind: "failed",
        message: "Lease expired after maximum attempts",
      }),
    ),
  );
  const qihang = new QihangClient({
    ...(config.qihangBaseUrl === undefined ? {} : { baseUrl: config.qihangBaseUrl }),
  });
  const consumer = createWorkerConsumer({
    pool,
    qihang,
    leaseSeconds: config.leaseSeconds,
    serviceQihangUserId: config.serviceQihangUserId,
    onNotificationError: (error) => {
      process.stderr.write(`Worker notification failed: ${String(error)}\n`);
    },
  });
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await consumer.run(controller.signal, config.pollIntervalMs);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await pool.end();
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(`Worker failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
