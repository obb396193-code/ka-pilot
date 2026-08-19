import { isAbsolute } from "node:path";

import type { ProviderProfile } from "../provider/types.js";

interface GatewayProviderConfig {
  name: string;
  type: ProviderProfile["protocol"];
  apikey: "__KA_RUNTIME_CREDENTIAL__";
  baseurl: string;
  models: string[];
}

export interface GatewaySidecarConfig {
  host: "127.0.0.1";
  port: number;
  Providers: GatewayProviderConfig[];
  defaultTargetProvider: string;
  plugins: Array<{ key: string; enabled: true; modulePath: string }>;
  auth: {
    enabled: true;
    mode: "static_api_key";
    required: true;
    staticApiKeys: {
      keysEnv: "AUTH_STATIC_API_KEYS";
      keyBearerOnly: true;
    };
  };
  rawTrace: { enabled: false };
  metrics: { enabled: false };
  providerHealthCheck: { enabled: false };
  cors: { enabled: false };
  logging: { enabled: true; level: "warn"; accessLog: false };
  idempotency: { enabled: false };
  upstreamRetry: { enabled: false; maxAttempts: 1 };
  upstreamConcurrency: { enabled: false };
  upstreamCircuitBreaker: { enabled: false };
  scheduling: { enabled: false; fallback: { mode: "off"; maxAttempts: 1 } };
  transparentToolExecution: { enabled: false };
  mcpGateway: { enabled: false };
  agent: {
    mcpServers: [];
    external: { enabled: false };
    eventWebhook: { enabled: false };
  };
}

export function buildGatewaySidecarConfig(input: {
  port: number;
  providers: readonly ProviderProfile[];
  pluginPath: string;
}): GatewaySidecarConfig {
  if (!Number.isSafeInteger(input.port) || input.port <= 0 || input.port > 65_535) {
    throw new Error("Gateway sidecar port must be between 1 and 65535");
  }
  if (!isAbsolute(input.pluginPath)) throw new Error("Gateway plugin path must be absolute");
  const providers = input.providers.filter((profile) => profile.enabled);
  assertProviderProfiles(providers);
  const configuredProviders = providers.map((profile): GatewayProviderConfig => ({
    name: profile.id,
    type: profile.protocol,
    apikey: "__KA_RUNTIME_CREDENTIAL__",
    baseurl: profile.baseUrl,
    models: [...profile.models],
  }));
  return {
    host: "127.0.0.1",
    port: input.port,
    Providers: configuredProviders,
    defaultTargetProvider: configuredProviders[0]!.name,
    plugins: [
      {
        key: "ka-credential-injector",
        enabled: true,
        modulePath: input.pluginPath,
      },
    ],
    auth: {
      enabled: true,
      mode: "static_api_key",
      required: true,
      staticApiKeys: {
        keysEnv: "AUTH_STATIC_API_KEYS",
        keyBearerOnly: true,
      },
    },
    rawTrace: { enabled: false },
    metrics: { enabled: false },
    providerHealthCheck: { enabled: false },
    cors: { enabled: false },
    logging: { enabled: true, level: "warn", accessLog: false },
    idempotency: { enabled: false },
    upstreamRetry: { enabled: false, maxAttempts: 1 },
    upstreamConcurrency: { enabled: false },
    upstreamCircuitBreaker: { enabled: false },
    scheduling: { enabled: false, fallback: { mode: "off", maxAttempts: 1 } },
    transparentToolExecution: { enabled: false },
    mcpGateway: { enabled: false },
    agent: {
      mcpServers: [],
      external: { enabled: false },
      eventWebhook: { enabled: false },
    },
  };
}

function assertProviderProfiles(profiles: readonly ProviderProfile[]): void {
  if (profiles.length === 0) throw new Error("Gateway requires at least one enabled provider");
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.id)) throw new Error(`Duplicate gateway provider: ${profile.id}`);
    ids.add(profile.id);
    const url = new URL(profile.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username !== "" ||
      url.password !== "" ||
      profile.models.length === 0 ||
      !profile.models.includes(profile.defaultModel)
    ) {
      throw new Error(`Gateway provider profile is invalid: ${profile.id}`);
    }
    if (Object.keys(profile).some((key) => /(?:api.?key|credential|secret|token)/i.test(key))) {
      throw new Error(`Gateway provider profile contains inline secret material: ${profile.id}`);
    }
  }
}
