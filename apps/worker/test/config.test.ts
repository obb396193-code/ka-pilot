import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "../src/config.js";

describe("worker config", () => {
  it("loads safe defaults without inventing a service identity", () => {
    expect(loadWorkerConfig({ DATABASE_URL: "postgres://local/ka" })).toEqual({
      databaseUrl: "postgres://local/ka",
      pollIntervalMs: 1_000,
      leaseSeconds: 60,
      serviceQihangUserId: null,
      materialSources: {
        allowedHosts: [],
        maxContentBytes: 524_288_000,
      },
      idealabAsr: null,
      agent: {
        enabled: false,
        maxTurns: 8,
        maxBudgetUsd: 1,
        timeoutMs: 120_000,
        gateway: null,
      },
    });
  });

  it("loads an explicitly enabled IdeaLab ASR profile without serializing its API key", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      IDEALAB_ASR_ENABLED: "true",
      IDEALAB_AK: "a".repeat(32),
      IDEALAB_ASR_MAX_WAV_BYTES: "1048576",
      IDEALAB_ASR_MAX_RESPONSE_BYTES: "32768",
      IDEALAB_ASR_MIN_TIMEOUT_MS: "30000",
      IDEALAB_ASR_MAX_TIMEOUT_MS: "180000",
      IDEALAB_ASR_TIMEOUT_MULTIPLIER: "2.5",
    });

    expect(config.idealabAsr).toMatchObject({
      endpoint: "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions",
      maxWavBytes: 1_048_576,
      maxResponseBytes: 32_768,
      minTimeoutMs: 30_000,
      maxTimeoutMs: 180_000,
      timeoutMultiplier: 2.5,
    });
    expect(config.idealabAsr?.apiKey).toBe("a".repeat(32));
    expect(JSON.stringify(config)).not.toContain("a".repeat(32));
  });

  it.each([
    { label: "a missing API key", override: {} },
    { label: "an HTTP endpoint", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_ENDPOINT: "http://idealab.invalid/asr" } },
    { label: "another HTTPS host", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_ENDPOINT: "https://example.com/api/openai/v1/audio/transcriptions" } },
    { label: "another IdeaLab path", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_ENDPOINT: "https://idealab.alibaba-inc.com/not-asr" } },
    { label: "a query-bearing endpoint", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_ENDPOINT: "https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions?redirect=1" } },
    { label: "credentials in endpoint", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_ENDPOINT: "https://user:pass@idealab.invalid/asr" } },
    { label: "a zero WAV budget", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_MAX_WAV_BYTES: "0" } },
    { label: "a reversed timeout range", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_MIN_TIMEOUT_MS: "60000", IDEALAB_ASR_MAX_TIMEOUT_MS: "30000" } },
    { label: "an unbounded multiplier", override: { IDEALAB_AK: "a".repeat(32), IDEALAB_ASR_TIMEOUT_MULTIPLIER: "101" } },
  ])("rejects $label when IdeaLab ASR is enabled", ({ override }) => {
    expect(() => loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      IDEALAB_ASR_ENABLED: "true",
      ...override,
    })).toThrow();
  });

  it("ignores a stray IdeaLab key while ASR is disabled", () => {
    expect(loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      IDEALAB_AK: "must-not-enable-the-provider",
    }).idealabAsr).toBeNull();
  });

  it("rejects a missing database URL", () => {
    expect(() => loadWorkerConfig({})).toThrow();
  });

  it("loads an explicit material host allowlist and byte budget", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      MATERIAL_SOURCE_ALLOWED_HOSTS: "cdn.example.com, *.example.org,cdn.example.com",
      MATERIAL_SOURCE_MAX_BYTES: "1048576",
      MATERIAL_POOL_BASE_URL: "https://materials.example.internal/list",
    });

    expect(config.materialSources).toEqual({
      allowedHosts: ["cdn.example.com", "*.example.org"],
      maxContentBytes: 1_048_576,
      poolBaseUrl: "https://materials.example.internal/list",
    });
  });

  it.each([
    { MATERIAL_SOURCE_ALLOWED_HOSTS: "https://cdn.example.com" },
    { MATERIAL_SOURCE_ALLOWED_HOSTS: "*" },
    { MATERIAL_SOURCE_MAX_BYTES: "0" },
    { MATERIAL_POOL_BASE_URL: "http://materials.example.internal/list" },
  ])("rejects unsafe material source configuration: %s", (override) => {
    expect(() => loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      ...override,
    })).toThrow();
  });

  it("requires a complete gateway configuration when Agent is enabled", () => {
    expect(() =>
      loadWorkerConfig({ DATABASE_URL: "postgres://local/ka", AGENT_ENABLED: "true" }),
    ).toThrow();
  });

  it("loads validated provider profiles without provider secrets", () => {
    const envelopeKey = Buffer.alloc(32, 7).toString("base64");
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      AGENT_ENABLED: "true",
      AGENT_MAX_TURNS: "5",
      AGENT_MAX_BUDGET_USD: "0.75",
      AGENT_TIMEOUT_MS: "45000",
      MODEL_GATEWAY_BASE_URL: "http://127.0.0.1:3456",
      MODEL_GATEWAY_CLIENT_KEY: "g".repeat(32),
      MODEL_GATEWAY_ENVELOPE_KEY_BASE64: envelopeKey,
      MODEL_PROVIDER_PROFILES_JSON: JSON.stringify([
        {
          id: "idealab-primary",
          protocol: "openai_chat_completions",
          baseUrl: "https://example.invalid/v1",
          models: ["qwen-max", "qwen-plus"],
          defaultModel: "qwen-max",
          taskKinds: ["chat", "diagnosis"],
          fallbackProviderIds: ["anthropic-secondary"],
        },
      ]),
    });

    expect(config.agent).toEqual({
      enabled: true,
      maxTurns: 5,
      maxBudgetUsd: 0.75,
      timeoutMs: 45_000,
      gateway: {
        baseUrl: "http://127.0.0.1:3456",
        clientKey: "g".repeat(32),
        envelopeKey,
        providerProfiles: [
          {
            id: "idealab-primary",
            protocol: "openai_chat_completions",
            baseUrl: "https://example.invalid/v1",
            models: ["qwen-max", "qwen-plus"],
            defaultModel: "qwen-max",
            enabled: true,
            taskKinds: ["chat", "diagnosis"],
            fallbackProviderIds: ["anthropic-secondary"],
          },
        ],
      },
    });
  });

  it.each([
    {
      label: "a duplicate provider id",
      profiles: [
        providerProfile("duplicate"),
        providerProfile("duplicate", { defaultModel: "model-b", models: ["model-b"] }),
      ],
    },
    {
      label: "an empty model list",
      profiles: [providerProfile("empty", { defaultModel: "model-a", models: [] })],
    },
    {
      label: "a non-http provider URL",
      profiles: [providerProfile("file-url", { baseUrl: "file:///tmp/provider" })],
    },
    {
      label: "an insecure remote provider URL",
      profiles: [providerProfile("remote-http", { baseUrl: "http://provider.example/v1" })],
    },
    {
      label: "an inline API key",
      profiles: [providerProfile("secret", { apiKey: "must-not-be-here" })],
    },
  ])("rejects $label", ({ profiles }) => {
    expect(() => loadEnabledConfig(profiles)).toThrow();
  });

  it("rejects a non-loopback model gateway", () => {
    expect(() => loadWorkerConfig({
      DATABASE_URL: "postgres://local/ka",
      AGENT_ENABLED: "true",
      MODEL_GATEWAY_BASE_URL: "https://gateway.example",
      MODEL_GATEWAY_CLIENT_KEY: "g".repeat(32),
      MODEL_GATEWAY_ENVELOPE_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
      MODEL_PROVIDER_PROFILES_JSON: JSON.stringify([providerProfile("provider")]),
    })).toThrow(/localhost/i);
  });

  it("rejects an Agent timeout longer than the credential envelope lifetime", () => {
    expect(() => loadEnabledConfig([providerProfile("provider")], {
      AGENT_TIMEOUT_MS: "300001",
    })).toThrow(/credential envelope TTL/i);
  });

  it("parses the string false as disabled", () => {
    expect(
      loadWorkerConfig({ DATABASE_URL: "postgres://local/ka", AGENT_ENABLED: "false" }).agent,
    ).toEqual({
      enabled: false,
      maxTurns: 8,
      maxBudgetUsd: 1,
      timeoutMs: 120_000,
      gateway: null,
    });
  });
});

function providerProfile(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    protocol: "anthropic_messages",
    baseUrl: "https://example.invalid",
    models: ["model-a"],
    defaultModel: "model-a",
    ...overrides,
  };
}

function loadEnabledConfig(
  profiles: Record<string, unknown>[],
  overrides: NodeJS.ProcessEnv = {},
) {
  return loadWorkerConfig({
    DATABASE_URL: "postgres://local/ka",
    AGENT_ENABLED: "true",
    MODEL_GATEWAY_BASE_URL: "http://127.0.0.1:3456",
    MODEL_GATEWAY_CLIENT_KEY: "g".repeat(32),
    MODEL_GATEWAY_ENVELOPE_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
    MODEL_PROVIDER_PROFILES_JSON: JSON.stringify(profiles),
    ...overrides,
  });
}
