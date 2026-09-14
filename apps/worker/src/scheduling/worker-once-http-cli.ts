import { createPool } from "@ka/db";
import { outboundConfigForWorkerHttp, runOutboundOnceProcess } from "../notifications/outbound-process.js";
import { createWorkerOnceHttpServer, parseWorkerOnceHttpConfig } from "./worker-once-http.js";
import { workerOnceLock } from "./worker-once-lock.js";
import { runWorkerOnceProcess } from "./worker-once-process.js";

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Invalid arguments");
  const config = parseWorkerOnceHttpConfig(process.env);
  // P-198：出站可选。没配就不开（路由回 503）；配错或空间与 worker 不同，这里就失败，不带病起服务。
  const outbound = outboundConfigForWorkerHttp(process.env, config.worker.workspaceId);
  const pool = createPool(config.worker.databaseUrl, { max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const controller = new AbortController();
  pool.on("error", () => controller.abort());
  const server = createWorkerOnceHttpServer({ token: config.token, signal: controller.signal,
    run: (signal) => runWorkerOnceProcess(config.worker, signal),
    acquireLock: workerOnceLock(pool, config.worker.workspaceId),
    ...(outbound === null ? {} : { outbound: { run: (signal: AbortSignal) => runOutboundOnceProcess(outbound, signal) } }) });
  const stop = (): void => { controller.abort(); server.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject); server.once("close", resolve);
      server.listen(config.port, config.host, () => { process.stdout.write("Worker HTTP listening\n"); });
    });
  } finally {
    controller.abort(); server.close(); await pool.end();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
await main().catch(() => { process.stderr.write("Worker HTTP failed\n"); process.exitCode = 1; });
