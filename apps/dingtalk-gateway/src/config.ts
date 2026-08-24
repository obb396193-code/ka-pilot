import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  DINGTALK_CLIENT_ID: z.string().trim().min(1),
  DINGTALK_CLIENT_SECRET: z.string().trim().min(1),
  KA_WORKSPACE_ID: z.string().uuid(),
  KA_API_BASE_URL: z.string().url(),
  KA_API_BEARER_TOKEN: z.string().trim().min(1).optional(),
  GATEWAY_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export interface GatewayConfig {
  databaseUrl: string;
  dingtalkClientId: string;
  dingtalkClientSecret: string;
  workspaceId: string;
  apiBaseUrl: string;
  apiBearerToken?: string;
  apiTimeoutMs: number;
}

export function loadGatewayConfig(environment: NodeJS.ProcessEnv): GatewayConfig {
  const parsed = configSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL,
    dingtalkClientId: parsed.DINGTALK_CLIENT_ID,
    dingtalkClientSecret: parsed.DINGTALK_CLIENT_SECRET,
    workspaceId: parsed.KA_WORKSPACE_ID,
    apiBaseUrl: parsed.KA_API_BASE_URL,
    ...(parsed.KA_API_BEARER_TOKEN === undefined
      ? {}
      : { apiBearerToken: parsed.KA_API_BEARER_TOKEN }),
    apiTimeoutMs: parsed.GATEWAY_API_TIMEOUT_MS,
  };
}
