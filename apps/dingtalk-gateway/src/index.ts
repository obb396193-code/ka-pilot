import {
  GatewayRepository,
  createPool,
} from "@ka/db";

import { loadGatewayConfig } from "./config.js";
import { connectDingTalkStream, DingTalkSessionReply } from "./dingtalk-adapter.js";
import { createMessageHandler } from "./message-handler.js";
import { ProductApiClient } from "./product-api-client.js";
import { InboxCodec } from "./inbox-codec.js";
import { createInboxReceiver, createInboxWorker } from "./inbox-worker.js";

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
  // Migrations run separately in the deployment maintenance step, never on reconnect/startup.
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
    identities: gateway,
    commands,
  });
  const inbox = { workspaceId: config.workspaceId, inbound: gateway, codec: new InboxCodec(config.inboxKeyHex) };
  const worker = createInboxWorker({ ...inbox, processMessage: handler, replies: new DingTalkSessionReply() });
  const controller = new AbortController();
  let processing: Promise<void> | undefined;

  let connection: Awaited<ReturnType<typeof connectDingTalkStream>> | undefined;
  try {
    connection = await connectDingTalkStream({
      clientId: config.dingtalkClientId,
      clientSecret: config.dingtalkClientSecret,
      onMessage: createInboxReceiver(inbox),
      onProcessingError: () => {
        process.stderr.write("DingTalk receive/ACK not confirmed\n");
      },
    });
    processing = worker.run(controller.signal, () => {
      process.stderr.write("DingTalk inbox polling failed\n");
    });
    await waitForShutdown();
  } finally {
    connection?.disconnect();
    controller.abort();
    await processing;
    await pool.end();
  }
}

await main().catch(() => {
  process.stderr.write("DingTalk gateway failed; check deployment configuration/connectivity\n");
  process.exitCode = 1;
});
