import {
  GatewayRepository,
  JobRepository,
  createPool,
  runMigrations,
} from "@ka/db";

import { loadGatewayConfig } from "./config.js";
import { connectDingTalkStream, DingTalkSessionReply } from "./dingtalk-adapter.js";
import { createMessageHandler } from "./message-handler.js";
import { ProductApiClient } from "./product-api-client.js";

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main(): Promise<void> {
  const config = loadGatewayConfig(process.env);
  await runMigrations({ databaseUrl: config.databaseUrl });
  const pool = createPool(config.databaseUrl);
  const gateway = new GatewayRepository(pool);
  const commands = new ProductApiClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.apiTimeoutMs,
    ...(config.apiBearerToken === undefined
      ? {}
      : { bearerToken: config.apiBearerToken }),
  });
  const handler = createMessageHandler({
    workspaceId: config.workspaceId,
    inbound: gateway,
    identities: gateway,
    jobs: new JobRepository(pool),
    commands,
    replies: new DingTalkSessionReply(),
  });

  let connection: Awaited<ReturnType<typeof connectDingTalkStream>> | undefined;
  try {
    connection = await connectDingTalkStream({
      clientId: config.dingtalkClientId,
      clientSecret: config.dingtalkClientSecret,
      onMessage: handler,
      onProcessingError: (error) => {
        process.stderr.write(`DingTalk message failed: ${String(error)}\n`);
      },
    });
    await waitForShutdown();
  } finally {
    connection?.disconnect();
    await pool.end();
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(
    `DingTalk gateway failed: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
