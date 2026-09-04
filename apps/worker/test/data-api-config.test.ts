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
