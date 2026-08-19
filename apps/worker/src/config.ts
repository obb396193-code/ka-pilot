import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();
const positiveNumber = z.coerce.number().positive().finite();
const enabledFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const taskKindSchema = z.enum(["chat", "diagnosis", "background"]);
const providerProtocolSchema = z.enum(["anthropic_messages", "openai_chat_completions"]);
const httpUrlSchema = z.string().url().refine(isHttpUrl, "Only HTTP(S) URLs are allowed");
const envelopeKeySchema = z
  .string()
  .trim()
  .refine(isCanonical32ByteBase64, "Expected a canonical base64-encoded 32-byte key");

const providerProfileSchema = z
  .object({
    id: z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    protocol: providerProtocolSchema,
    baseUrl: httpUrlSchema,
    models: z.array(z.string().trim().min(1)).min(1),
    defaultModel: z.string().trim().min(1),
    enabled: z.boolean().default(true),
    taskKinds: z.array(taskKindSchema).min(1).default(["chat", "diagnosis", "background"]),
    fallbackProviderIds: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((profile, context) => {
    if (!profile.models.includes(profile.defaultModel)) {
      context.addIssue({
        code: "custom",
        message: "defaultModel must be present in models",
        path: ["defaultModel"],
      });
    }
  });

const providerProfilesSchema = z.array(providerProfileSchema).min(1).superRefine((profiles, context) => {
  const seen = new Set<string>();
  profiles.forEach((profile, index) => {
    if (seen.has(profile.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate provider id: ${profile.id}`,
        path: [index, "id"],
      });
    }
    seen.add(profile.id);
  });
});

const workerConfigSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  QIHANG_BASE_URL: z.string().url().optional(),
  WORKER_POLL_INTERVAL_MS: positiveInteger.default(1_000),
  WORKER_LEASE_SECONDS: positiveInteger.default(60),
  WORKER_SERVICE_QIHANG_USER_ID: z.string().trim().min(1).optional(),
  AGENT_ENABLED: enabledFlag,
  AGENT_MAX_TURNS: positiveInteger.default(8),
  AGENT_MAX_BUDGET_USD: positiveNumber.default(1),
  AGENT_TIMEOUT_MS: positiveInteger.default(120_000),
  MODEL_GATEWAY_BASE_URL: httpUrlSchema.optional(),
  MODEL_GATEWAY_CLIENT_KEY: z.string().min(32).optional(),
  MODEL_GATEWAY_ENVELOPE_KEY_BASE64: envelopeKeySchema.optional(),
  MODEL_PROVIDER_PROFILES_JSON: z.string().trim().min(1).optional(),
});

export type AgentTaskKind = z.infer<typeof taskKindSchema>;
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;
export type ModelProviderProfileConfig = z.infer<typeof providerProfileSchema>;

export interface ModelGatewayConfig {
  baseUrl: string;
  clientKey: string;
  envelopeKey: string;
  providerProfiles: ModelProviderProfileConfig[];
}

export interface AgentRuntimeConfig {
  enabled: boolean;
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutMs: number;
  gateway: ModelGatewayConfig | null;
}

export interface WorkerConfig {
  databaseUrl: string;
  qihangBaseUrl?: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  serviceQihangUserId: string | null;
  agent: AgentRuntimeConfig;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = workerConfigSchema.parse(environment);
  const agent = loadAgentConfig(parsed);
  return {
    databaseUrl: parsed.DATABASE_URL,
    ...(parsed.QIHANG_BASE_URL === undefined
      ? {}
      : { qihangBaseUrl: parsed.QIHANG_BASE_URL }),
    pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
    leaseSeconds: parsed.WORKER_LEASE_SECONDS,
    serviceQihangUserId: parsed.WORKER_SERVICE_QIHANG_USER_ID ?? null,
    agent,
  };
}

function loadAgentConfig(parsed: z.infer<typeof workerConfigSchema>): AgentRuntimeConfig {
  const common = {
    enabled: parsed.AGENT_ENABLED,
    maxTurns: parsed.AGENT_MAX_TURNS,
    maxBudgetUsd: parsed.AGENT_MAX_BUDGET_USD,
    timeoutMs: parsed.AGENT_TIMEOUT_MS,
  };
  if (!parsed.AGENT_ENABLED) {
    return { ...common, gateway: null };
  }

  const gatewayFields = z
    .object({
      baseUrl: httpUrlSchema,
      clientKey: z.string().min(32),
      envelopeKey: envelopeKeySchema,
      providerProfilesJson: z.string().trim().min(1),
    })
    .parse({
      baseUrl: parsed.MODEL_GATEWAY_BASE_URL,
      clientKey: parsed.MODEL_GATEWAY_CLIENT_KEY,
      envelopeKey: parsed.MODEL_GATEWAY_ENVELOPE_KEY_BASE64,
      providerProfilesJson: parsed.MODEL_PROVIDER_PROFILES_JSON,
    });
  return {
    ...common,
    gateway: {
      baseUrl: gatewayFields.baseUrl,
      clientKey: gatewayFields.clientKey,
      envelopeKey: gatewayFields.envelopeKey,
      providerProfiles: parseProviderProfiles(gatewayFields.providerProfilesJson),
    },
  };
}

function parseProviderProfiles(serialized: string): ModelProviderProfileConfig[] {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("MODEL_PROVIDER_PROFILES_JSON must be valid JSON");
  }
  return providerProfilesSchema.parse(value);
}

function isHttpUrl(value: string): boolean {
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}

function isCanonical32ByteBase64(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.byteLength === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}
