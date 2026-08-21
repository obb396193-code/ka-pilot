import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();
const positiveNumber = z.coerce.number().positive().finite();
const agentTimeout = positiveInteger.max(5 * 60_000, "Agent timeout cannot exceed credential envelope TTL");
const enabledFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const taskKindSchema = z.enum(["chat", "diagnosis", "background"]);
const providerProtocolSchema = z.enum(["anthropic_messages", "openai_chat_completions"]);
const providerUrlSchema = z.string().url().refine(
  isSafeProviderUrl,
  "Provider URLs require HTTPS except for loopback testing",
);
const localGatewayUrlSchema = z.string().url().refine(
  isLoopbackHttpUrl,
  "Model gateway must use localhost HTTP",
);
const envelopeKeySchema = z
  .string()
  .trim()
  .refine(isCanonical32ByteBase64, "Expected a canonical base64-encoded 32-byte key");
const materialHostPatternSchema = z
  .string()
  .regex(/^(?:\*\.)?[a-z0-9.-]+$/)
  .refine((value) => !value.includes(".."), "Invalid material host pattern");
const materialHostListSchema = z
  .string()
  .default("")
  .transform((value) => [...new Set(value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== ""))])
  .pipe(z.array(materialHostPatternSchema));
const materialPoolUrlSchema = z.string().url().refine(
  isCredentialFreeHttpsUrl,
  "Material pool URL must be credential-free HTTPS",
);
const idealabAsrUrlSchema = z.string().url().refine(
  isVerifiedIdeaLabAsrUrl,
  "IdeaLab ASR URL must match the verified credential-free HTTPS endpoint",
);
const apiKeySchema = z.string().trim().min(1).max(4_096).regex(/^[\x21-\x7e]+$/);

const providerProfileSchema = z
  .object({
    id: z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    protocol: providerProtocolSchema,
    baseUrl: providerUrlSchema,
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
  MATERIAL_POOL_BASE_URL: materialPoolUrlSchema.optional(),
  MATERIAL_SOURCE_ALLOWED_HOSTS: materialHostListSchema,
  MATERIAL_SOURCE_MAX_BYTES: positiveInteger.default(500 * 1024 * 1024),
  IDEALAB_ASR_ENABLED: enabledFlag,
  IDEALAB_AK: apiKeySchema.optional(),
  IDEALAB_ASR_ENDPOINT: idealabAsrUrlSchema.default(
    "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions",
  ),
  IDEALAB_ASR_MAX_WAV_BYTES: positiveInteger.default(5 * 1024 * 1024),
  IDEALAB_ASR_MAX_RESPONSE_BYTES: positiveInteger.default(256 * 1024),
  IDEALAB_ASR_MIN_TIMEOUT_MS: positiveInteger.default(30_000),
  IDEALAB_ASR_MAX_TIMEOUT_MS: positiveInteger.default(5 * 60_000),
  IDEALAB_ASR_TIMEOUT_MULTIPLIER: positiveNumber.max(100).default(3),
  AGENT_ENABLED: enabledFlag,
  AGENT_MAX_TURNS: positiveInteger.default(8),
  AGENT_MAX_BUDGET_USD: positiveNumber.default(1),
  AGENT_TIMEOUT_MS: agentTimeout.default(120_000),
  MODEL_GATEWAY_BASE_URL: localGatewayUrlSchema.optional(),
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

export interface IdeaLabAsrConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly maxWavBytes: number;
  readonly maxResponseBytes: number;
  readonly minTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly timeoutMultiplier: number;
}

export interface WorkerConfig {
  databaseUrl: string;
  qihangBaseUrl?: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  serviceQihangUserId: string | null;
  materialSources: {
    poolBaseUrl?: string;
    allowedHosts: string[];
    maxContentBytes: number;
  };
  idealabAsr: IdeaLabAsrConfig | null;
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
    materialSources: {
      ...(parsed.MATERIAL_POOL_BASE_URL === undefined
        ? {}
        : { poolBaseUrl: parsed.MATERIAL_POOL_BASE_URL }),
      allowedHosts: parsed.MATERIAL_SOURCE_ALLOWED_HOSTS,
      maxContentBytes: parsed.MATERIAL_SOURCE_MAX_BYTES,
    },
    idealabAsr: loadIdeaLabAsrConfig(parsed),
    agent,
  };
}

function loadIdeaLabAsrConfig(
  parsed: z.infer<typeof workerConfigSchema>,
): IdeaLabAsrConfig | null {
  if (!parsed.IDEALAB_ASR_ENABLED) return null;
  const values = z.object({
    apiKey: apiKeySchema,
    endpoint: idealabAsrUrlSchema,
    maxWavBytes: positiveInteger,
    maxResponseBytes: positiveInteger,
    minTimeoutMs: positiveInteger,
    maxTimeoutMs: positiveInteger,
    timeoutMultiplier: positiveNumber.max(100),
  }).refine(
    (value) => value.minTimeoutMs <= value.maxTimeoutMs,
    { message: "IdeaLab ASR minimum timeout cannot exceed maximum timeout" },
  ).parse({
    apiKey: parsed.IDEALAB_AK,
    endpoint: parsed.IDEALAB_ASR_ENDPOINT,
    maxWavBytes: parsed.IDEALAB_ASR_MAX_WAV_BYTES,
    maxResponseBytes: parsed.IDEALAB_ASR_MAX_RESPONSE_BYTES,
    minTimeoutMs: parsed.IDEALAB_ASR_MIN_TIMEOUT_MS,
    maxTimeoutMs: parsed.IDEALAB_ASR_MAX_TIMEOUT_MS,
    timeoutMultiplier: parsed.IDEALAB_ASR_TIMEOUT_MULTIPLIER,
  });
  const config = {
    endpoint: values.endpoint,
    maxWavBytes: values.maxWavBytes,
    maxResponseBytes: values.maxResponseBytes,
    minTimeoutMs: values.minTimeoutMs,
    maxTimeoutMs: values.maxTimeoutMs,
    timeoutMultiplier: values.timeoutMultiplier,
  } as IdeaLabAsrConfig;
  Object.defineProperty(config, "apiKey", {
    value: values.apiKey,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(config);
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
      baseUrl: localGatewayUrlSchema,
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

function isSafeProviderUrl(value: string): boolean {
  const url = new URL(value);
  return !url.username && !url.password && (
    url.protocol === "https:" || isLoopbackHttpUrl(value)
  );
}

function isCredentialFreeHttpsUrl(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search;
}

function isVerifiedIdeaLabAsrUrl(value: string): boolean {
  const url = new URL(value);
  return isCredentialFreeHttpsUrl(value) &&
    url.hostname === "idealab.alibaba-inc.com" &&
    url.port === "" &&
    url.pathname === "/api/openai/v1/audio/transcriptions";
}

function isLoopbackHttpUrl(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

function isCanonical32ByteBase64(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.byteLength === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}
