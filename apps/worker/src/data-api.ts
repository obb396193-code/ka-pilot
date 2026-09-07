import {
  AccountListRepository,
  ChangeSetRepository,
  AuthSessionRepository,
  createPool,
  SemanticQueryRepository,
  TaskListRepository,
  WorkItemListRepository,
  WorkItemRepository,
  withSemanticReadSnapshot,
} from "@ka/db";

import { loadDataApiConfig } from "./data/data-api-config.js";
import { AccountListService } from "./accounts/account-list-service.js";
import { createDataApiServer } from "./data/http-server.js";
import { createKaDataClientFromEnv } from "./data/ka-data-client.js";
import { DisabledKaDataSource } from "./data/disabled-ka-data-source.js";
import { PlatformDataSource } from "./data/platform-data-source.js";
import { createPlatformWindowQuery } from "./data/platform-window-query.js";
import { createPlatformDimensionQuery } from "./data/platform-dimension-query.js";
import { createDataQueryRegistry } from "./data/query-registry.js";
import { DataQueryService } from "./data/query-service.js";
import { ReadDetailService } from "./data/read-detail-service.js";
import { TaskListService } from "./tasks/task-list-service.js";
import { InternalTestLoginProvider } from "./auth/internal-test-login-provider.js";
import { SessionAuthService } from "./auth/session-auth-service.js";
import { SessionHttpService } from "./auth/session-http.js";
import { WorkItemListService } from "./work-items/work-item-list-service.js";

async function main(): Promise<void> {
  const config = loadDataApiConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const authRepository = new AuthSessionRepository(pool);
  const sessionAuthService = new SessionAuthService(authRepository);
  const service = new DataQueryService({
    registry: createDataQueryRegistry(),
    kaData: config.kaDataEnabled
      ? createKaDataClientFromEnv(process.env)
      : new DisabledKaDataSource(),
    platform: new PlatformDataSource(new SemanticQueryRepository(pool), (read) =>
      withSemanticReadSnapshot(pool, (connection) => read(new SemanticQueryRepository(connection))), createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool)),
    sourcePolicy: {
      diagnosticEnabled: config.dataDiagnosticEnabled,
      kaDataEnabled: config.kaDataEnabled,
      entitlements: config.dataDiagnosticEntitlements,
    },
    audit: (event) => { process.stdout.write(`${JSON.stringify(event)}\n`); },
  });
  const server = createDataApiServer({
    service,
    detailService: new ReadDetailService({
      workItems: new WorkItemRepository(pool),
      changeSets: new ChangeSetRepository(pool),
    }),
    taskListService: new TaskListService({
      repository: new TaskListRepository(pool),
    }),
    accountListService: new AccountListService({
      repository: new AccountListRepository(pool),
    }),
    workItemListService: new WorkItemListService({
      repository: new WorkItemListRepository(pool),
    }),
    sessionHttpService: new SessionHttpService(
      sessionAuthService,
      new InternalTestLoginProvider(
        config.internalTestAuthEnabled,
        config.internalTestAuthCredentialsJson,
      ),
      { ttlSeconds: config.sessionTtlSeconds },
    ),
    sessionAuthService,
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
