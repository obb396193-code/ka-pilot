import { describe, expect, it } from "vitest";

import { loadDataApiConfig } from "../src/data/data-api-config.js";

describe("data API config", () => {
  it("requires a server-only internal token and accepts unknown dataset version", () => {
    expect(() => loadDataApiConfig({ DATABASE_URL: "postgres://fixture" })).toThrow();
    const config = loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      PLATFORM_DATASET_VERSION: "",
    });
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3101,
      maxResponseBytes: 16 * 1024 * 1024,
      kaDataEnabled: false,
      dataDiagnosticEnabled: false,
      dataDiagnosticEntitlements: [],
      internalTestAuthEnabled: false,
      sessionTtlSeconds: 8 * 60 * 60,
    });
    expect(config).not.toHaveProperty("platformDatasetVersion");
  });

  it("only enables internal test auth explicitly and bounds session ttl", () => {
    const enabled = loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      INTERNAL_TEST_AUTH_ENABLED: "true",
      INTERNAL_TEST_AUTH_CREDENTIALS_JSON: "[]",
      AUTH_SESSION_TTL_SECONDS: "3600",
    });
    expect(enabled).toMatchObject({
      internalTestAuthEnabled: true,
      internalTestAuthCredentialsJson: "[]",
      sessionTtlSeconds: 3_600,
    });
    expect(() => loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      INTERNAL_TEST_AUTH_ENABLED: "yes",
    })).toThrow();
    expect(() => loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      AUTH_SESSION_TTL_SECONDS: "59",
    })).toThrow();
  });

  it("enables KA Data only through server configuration", () => {
    const enabled = loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      KA_DATA_ENABLED: "true",
    });
    expect(enabled.kaDataEnabled).toBe(true);
    expect(() => loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      KA_DATA_ENABLED: "1",
    })).toThrow();
  });

  it("requires an explicit strict server-side entitlement list for diagnostics", () => {
    const workspaceId = "00000000-0000-4000-8000-000000000024";
    const userId = "00000000-0000-4000-8000-000000000001";
    expect(() => loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      DATA_DIAGNOSTIC_ENABLED: "true",
    })).toThrow("DATA_DIAGNOSTIC_ENTITLEMENTS_JSON");

    const enabled = loadDataApiConfig({
      DATABASE_URL: "postgres://fixture",
      DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
      DATA_DIAGNOSTIC_ENABLED: "true",
      DATA_DIAGNOSTIC_ENTITLEMENTS_JSON: JSON.stringify([{ workspaceId, userId }]),
    });
    expect(enabled).toMatchObject({
      dataDiagnosticEnabled: true,
      dataDiagnosticEntitlements: [{ workspaceId, userId }],
    });

    for (const invalid of [
      "not-json",
      JSON.stringify([{ workspaceId: "not-a-uuid", userId }]),
      JSON.stringify([{ workspaceId, userId }, { workspaceId, userId }]),
    ]) {
      expect(() => loadDataApiConfig({
        DATABASE_URL: "postgres://fixture",
        DATA_API_INTERNAL_TOKEN: "fixture-token-with-at-least-32-characters",
        DATA_DIAGNOSTIC_ENABLED: "true",
        DATA_DIAGNOSTIC_ENTITLEMENTS_JSON: invalid,
      })).toThrow();
    }
  });
});

/**
 * v1.9.42（Q-041 ⑨）：canonical 数据的业务时区**只能配置、不能推断**。
 * 从服务器本地时区猜一个出来，会把「这份数按哪天切的」说错一整天，而页面上完全看不出来。
 */
describe("v1.9.42 controlled source timezone", () => {
  const base = {
    DATABASE_URL: "postgres://ka:ka@127.0.0.1:5432/ka",
    DATA_API_INTERNAL_TOKEN: "x".repeat(32),
  };
  it("defaults to null rather than to the server's own timezone", () => {
    expect(loadDataApiConfig({ ...base } as NodeJS.ProcessEnv).sourceTimezone).toBeNull();
  });
  it("passes a configured IANA zone through verbatim", () => {
    expect(loadDataApiConfig({ ...base, DATA_SOURCE_TIMEZONE: "Asia/Shanghai" } as NodeJS.ProcessEnv).sourceTimezone)
      .toBe("Asia/Shanghai");
  });
  it.each(["Shanghai", "not a zone", "Asia/Shanghai; DROP", "  ", "UTC+8"])(
    "refuses %s at startup instead of shipping a meaningless zone", (value) => {
      // 配错了要在起服务时就炸，而不是让每条响应都带一个没人看得懂的时区。
      expect(() => loadDataApiConfig({ ...base, DATA_SOURCE_TIMEZONE: value } as NodeJS.ProcessEnv)).toThrow();
    });
});
