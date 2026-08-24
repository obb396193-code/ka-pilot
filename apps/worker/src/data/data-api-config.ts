import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  DATA_API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  DATA_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3_101),
  DATA_API_INTERNAL_TOKEN: z.string().min(32),
  DATA_API_MAX_REQUEST_BYTES: z.coerce.number().int().positive().default(1024 * 1024),
  DATA_API_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(16 * 1024 * 1024),
});

export interface DataApiConfig {
  databaseUrl: string;
  host: string;
  port: number;
  internalToken: string;
  maxRequestBytes: number;
  maxResponseBytes: number;
}

export function loadDataApiConfig(environment: NodeJS.ProcessEnv): DataApiConfig {
  const parsed = configSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.DATA_API_HOST,
    port: parsed.DATA_API_PORT,
    internalToken: parsed.DATA_API_INTERNAL_TOKEN,
    maxRequestBytes: parsed.DATA_API_MAX_REQUEST_BYTES,
    maxResponseBytes: parsed.DATA_API_MAX_RESPONSE_BYTES,
  };
}
