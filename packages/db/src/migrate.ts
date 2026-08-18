import path from "node:path";
import { fileURLToPath } from "node:url";

import { runner, type RunnerOption } from "node-pg-migrate";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface MigrationOptions {
  databaseUrl: string;
  direction?: "up" | "down";
  count?: number;
  log?: (message: string) => void;
}

export async function runMigrations(options: MigrationOptions): Promise<unknown[]> {
  const runnerOptions: RunnerOption = {
    databaseUrl: options.databaseUrl,
    dir: path.join(packageRoot, "migrations"),
    direction: options.direction ?? "up",
    migrationsTable: "pgmigrations",
    checkOrder: true,
    singleTransaction: true,
    log: options.log ?? (() => undefined),
    ...(options.count === undefined ? {} : { count: options.count }),
  };
  return runner(runnerOptions);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  await runMigrations({ databaseUrl });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
