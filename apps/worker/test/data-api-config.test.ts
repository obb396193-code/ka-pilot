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
    });
    expect(config).not.toHaveProperty("platformDatasetVersion");
  });
});
