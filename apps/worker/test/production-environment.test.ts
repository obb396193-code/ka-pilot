import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../src/config.js";
import { loadDataApiConfig } from "../src/data/data-api-config.js";
import { createKaDataClientFromEnv } from "../src/data/ka-data-client.js";

const environment = {
  NODE_ENV: "production", DATABASE_URL: "postgres://fixture",
  DATA_API_INTERNAL_TOKEN: "synthetic-internal-token-with-32-characters",
  KA_DATA_BASE_URL: "https://example.invalid", KA_DATA_READER_TOKEN: "synthetic-reader",
};
const entries = [loadWorkerConfig, loadDataApiConfig, createKaDataClientFromEnv];

describe("production environment gate", () => {
  it.each(entries)("rejects every dev-prefixed variable before configuration use %s", (entry) => {
    for (const patch of [
      { KA_DATA_DEV_ENABLED: "false" }, { KA_DATA_DEV_TOKEN: "synthetic-secret" },
      { KA_DATA_DEV_FUTURE_OPTION: "" }, { KA_DATA_DEV_: undefined },
    ]) {
      expect(() => entry({ ...environment, ...patch })).toThrow("Development data configuration is forbidden in production");
    }
  });
  it.each(entries)("does not reveal the configuration key/value on rejection %s", (entry) => {
    let failure: unknown;
    try { entry({ ...environment, KA_DATA_DEV_SENSITIVE_SUBJECT: "synthetic-secret" }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toMatch(/SENSITIVE_SUBJECT|synthetic-secret/);
  });
  it("preserves disabled defaults when no forbidden variable exists", () => {
    expect(loadDataApiConfig(environment).kaDataEnabled).toBe(false);
    expect(loadWorkerConfig(environment).agent.enabled).toBe(false);
  });
  it.each(["development", "test", undefined])("does not turn a dev variable into enabled production permissions under %s", (NODE_ENV) => {
    const env = { ...environment, NODE_ENV, KA_DATA_DEV_ENABLED: "true" };
    expect(loadDataApiConfig(env).kaDataEnabled).toBe(false);
    expect(loadWorkerConfig(env).agent.enabled).toBe(false);
  });
});
