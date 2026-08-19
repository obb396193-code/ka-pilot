import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "../src/config.js";

describe("worker config", () => {
  it("loads safe defaults without inventing a service identity", () => {
    expect(loadWorkerConfig({ DATABASE_URL: "postgres://local/ka" })).toEqual({
      databaseUrl: "postgres://local/ka",
      pollIntervalMs: 1_000,
      leaseSeconds: 60,
      serviceQihangUserId: null,
    });
  });

  it("rejects a missing database URL", () => {
    expect(() => loadWorkerConfig({})).toThrow();
  });
});
