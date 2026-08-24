import { Pool, type PoolConfig } from "pg";

export function createPool(databaseUrl: string, overrides: PoolConfig = {}): Pool {
  if (databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...overrides,
  });
}
