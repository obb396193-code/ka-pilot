import { z } from "zod";
import { assertProductionEnvironment } from "../production-environment.js";

const configSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  DATA_API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  DATA_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3_101),
  DATA_API_INTERNAL_TOKEN: z.string().min(32),
  DATA_API_MAX_REQUEST_BYTES: z.coerce.number().int().positive().default(1024 * 1024),
  DATA_API_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(16 * 1024 * 1024),
  /**
   * v1.9.42（Q-041 ⑨）：canonical 数据的业务时区，**只能配置、不能推断**。
   * 从服务器本地时区猜会把「这份数按哪天切的」说错一整天，而页面上看不出来；
   * 没配就继续发 `null`（血缘如实说「不知道」），这是安全的默认。
   * 值按 IANA 名（如 `Asia/Shanghai`）校验形状，不去解析它的含义。
   */
  DATA_SOURCE_TIMEZONE: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/, "Invalid IANA timezone").optional(),
  KA_DATA_ENABLED: z.enum(["true", "false"]).default("false"),
  DATA_DIAGNOSTIC_ENABLED: z.enum(["true", "false"]).default("false"),
  DATA_DIAGNOSTIC_ENTITLEMENTS_JSON: z.string().min(1).optional(),
  INTERNAL_TEST_AUTH_ENABLED: z.enum(["true", "false"]).default("false"),
  INTERNAL_TEST_AUTH_CREDENTIALS_JSON: z.string().min(1).optional(),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).default(8 * 60 * 60),
});

const diagnosticEntitlementsSchema = z.array(z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()).max(1_000).superRefine((entitlements, context) => {
  const seen = new Set<string>();
  for (const entitlement of entitlements) {
    const key = `${entitlement.workspaceId}\u0000${entitlement.userId}`;
    if (seen.has(key)) {
      context.addIssue({ code: "custom", message: "duplicate diagnostic entitlement" });
      return;
    }
    seen.add(key);
  }
});

export interface DataDiagnosticEntitlement {
  workspaceId: string;
  userId: string;
}

export interface DataApiConfig {
  databaseUrl: string;
  host: string;
  port: number;
  internalToken: string;
  maxRequestBytes: number;
  maxResponseBytes: number;
  /** canonical 数据的业务时区；没配置就是 null（血缘如实说「不知道」），绝不猜。 */
  sourceTimezone: string | null;
  kaDataEnabled: boolean;
  dataDiagnosticEnabled: boolean;
  dataDiagnosticEntitlements: readonly DataDiagnosticEntitlement[];
  internalTestAuthEnabled: boolean;
  internalTestAuthCredentialsJson: string | undefined;
  sessionTtlSeconds: number;
}

export function loadDataApiConfig(environment: NodeJS.ProcessEnv): DataApiConfig {
  assertProductionEnvironment(environment);
  const parsed = configSchema.parse(environment);
  const dataDiagnosticEnabled = parsed.DATA_DIAGNOSTIC_ENABLED === "true";
  if (dataDiagnosticEnabled && parsed.DATA_DIAGNOSTIC_ENTITLEMENTS_JSON === undefined) {
    throw new Error("DATA_DIAGNOSTIC_ENTITLEMENTS_JSON is required when diagnostics are enabled");
  }
  const dataDiagnosticEntitlements = parsed.DATA_DIAGNOSTIC_ENTITLEMENTS_JSON === undefined
    ? []
    : diagnosticEntitlementsSchema.parse(
        JSON.parse(parsed.DATA_DIAGNOSTIC_ENTITLEMENTS_JSON) as unknown,
      );
  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.DATA_API_HOST,
    port: parsed.DATA_API_PORT,
    internalToken: parsed.DATA_API_INTERNAL_TOKEN,
    maxRequestBytes: parsed.DATA_API_MAX_REQUEST_BYTES,
    maxResponseBytes: parsed.DATA_API_MAX_RESPONSE_BYTES,
    sourceTimezone: parsed.DATA_SOURCE_TIMEZONE ?? null,
    kaDataEnabled: parsed.KA_DATA_ENABLED === "true",
    dataDiagnosticEnabled,
    dataDiagnosticEntitlements,
    internalTestAuthEnabled: parsed.INTERNAL_TEST_AUTH_ENABLED === "true",
    internalTestAuthCredentialsJson: parsed.INTERNAL_TEST_AUTH_CREDENTIALS_JSON,
    sessionTtlSeconds: parsed.AUTH_SESSION_TTL_SECONDS,
  };
}
