import { createPool, SemanticQueryRepository } from "@ka/db";

import { loadDataApiConfig } from "./data/data-api-config.js";
import { createDataApiServer } from "./data/http-server.js";
import { createKaDataClientFromEnv } from "./data/ka-data-client.js";
import { PlatformDataSource } from "./data/platform-data-source.js";
import { createDataQueryRegistry } from "./data/query-registry.js";
import { DataQueryService } from "./data/query-service.js";

async function main(): Promise<void> {
  const config = loadDataApiConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const service = new DataQueryService({
    registry: createDataQueryRegistry(),
    kaData: createKaDataClientFromEnv(process.env),
    platform: new PlatformDataSource(
      new SemanticQueryRepository(pool),
      config.platformDatasetVersion === undefined
        ? {}
        : { datasetVersion: config.platformDatasetVersion },
    ),
  });
  const server = createDataApiServer({
    service,
    internalToken: config.internalToken,
    maxRequestBytes: config.maxRequestBytes,
    maxResponseBytes: config.maxResponseBytes,
  });
  const stop = (): void => {
    server.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
    process.stdout.write(`KA data API listening on ${config.host}:${config.port}\n`);
    await new Promise<void>((resolve) => server.once("close", resolve));
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await pool.end();
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(`Data API failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
