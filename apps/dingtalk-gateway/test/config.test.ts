import { describe, expect, it } from "vitest";

import { loadGatewayConfig } from "../src/config.js";

const environment = {
  DATABASE_URL: "postgres://local/ka",
  DINGTALK_CLIENT_ID: "client-id",
  DINGTALK_CLIENT_SECRET: "runtime-secret",
  GATEWAY_INBOX_KEY_HEX: "11".repeat(32),
  KA_WORKSPACE_ID: "11111111-1111-4111-8111-111111111111",
  KA_API_BASE_URL: "http://ka-api.internal",
};

describe("gateway config", () => {
  it("requires runtime-injected credentials and loads safe defaults", () => {
    expect(loadGatewayConfig(environment)).toEqual({
      databaseUrl: "postgres://local/ka",
      dingtalkClientId: "client-id",
      dingtalkClientSecret: "runtime-secret",
      workspaceId: environment.KA_WORKSPACE_ID,
      apiBaseUrl: "http://ka-api.internal",
      apiTimeoutMs: 15_000,
      inboxKeyHex: "11".repeat(32),
    });
  });

  it("does not mistake a secret reference for the actual runtime secret", () => {
    expect(() =>
      loadGatewayConfig({ ...environment, DINGTALK_CLIENT_SECRET: undefined }),
    ).toThrow();
  });
});
