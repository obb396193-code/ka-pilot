import { describe, expect, it } from "vitest";

import { buildGatewaySidecarConfig } from "../../src/agent/gateway/config-builder.js";

describe("model gateway sidecar config", () => {
  it("builds a localhost-only protocol gateway with no credential material", () => {
    const config = buildGatewaySidecarConfig({
      port: 3456,
      providers: [
        {
          id: "idealab-primary",
          protocol: "openai_chat_completions",
          baseUrl: "https://provider.example/v1",
          models: ["model-a"],
          defaultModel: "model-a",
          enabled: true,
          taskKinds: ["chat", "diagnosis"],
          fallbackProviderIds: [],
        },
      ],
      pluginPath: "/private/tmp/ka-credential-injector.mjs",
    });

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3456,
      Providers: [
        {
          name: "idealab-primary",
          type: "openai_chat_completions",
          baseurl: "https://provider.example/v1",
          apikey: "__KA_RUNTIME_CREDENTIAL__",
        },
      ],
      auth: {
        enabled: true,
        mode: "static_api_key",
        required: true,
        staticApiKeys: { keysEnv: "AUTH_STATIC_API_KEYS", keyBearerOnly: true },
      },
      rawTrace: { enabled: false },
      metrics: { enabled: false },
      providerHealthCheck: { enabled: false },
      mcpGateway: { enabled: false },
      transparentToolExecution: { enabled: false },
      agent: {
        mcpServers: [],
        external: { enabled: false },
        eventWebhook: { enabled: false },
      },
    });
    expect(JSON.stringify(config)).not.toContain("gateway-client-key");
    expect(JSON.stringify(config)).not.toContain("envelope-key");
    expect(JSON.stringify(config)).not.toContain("provider-private-key");
  });

  it("rejects non-loopback binding, duplicate providers and inline-secret profile data", () => {
    expect(() =>
      buildGatewaySidecarConfig({ port: 0, providers: [], pluginPath: "relative-plugin.mjs" }),
    ).toThrow();
    const provider = {
      id: "same",
      protocol: "anthropic_messages" as const,
      baseUrl: "https://provider.example",
      models: ["model-a"],
      defaultModel: "model-a",
      enabled: true,
      taskKinds: ["chat" as const],
      fallbackProviderIds: [],
    };
    expect(() =>
      buildGatewaySidecarConfig({
        port: 3456,
        providers: [provider, provider],
        pluginPath: "/private/tmp/plugin.mjs",
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      buildGatewaySidecarConfig({
        port: 3456,
        providers: [{ ...provider, id: "remote-http", baseUrl: "http://provider.example/v1" }],
        pluginPath: "/private/tmp/plugin.mjs",
      }),
    ).toThrow(/invalid/i);
  });
});
