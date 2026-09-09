import { describe, expect, it } from "vitest";
import { workerOnceChildEnvironment } from "../src/scheduling/worker-once-process.js";
describe("HTTP once child's deployment trust configuration", () => {
  it("forwards extra CA without copying trigger, session or shared service identities", () => {
    const result = workerOnceChildEnvironment({ workspaceId: "00000000-0000-4000-8000-000000000001", media: "KUAISHOU", mode: "full", databaseUrl: "postgres://synthetic-only", qihangBaseUrl: "https://synthetic.invalid/get_data", maxMs: 30000, leaseSeconds: 60 }, {
      PATH: "/synthetic/bin", NODE_ENV: "production", NODE_EXTRA_CA_CERTS: "/synthetic/private-ca.pem",
      WORKER_TRIGGER_TOKEN: "synthetic-private", QIHANG_SERVICE_USER_ID: "synthetic-private", COOKIE: "synthetic-private", NODE_TLS_REJECT_UNAUTHORIZED: "0",
    });
    expect(result.NODE_EXTRA_CA_CERTS).toBe("/synthetic/private-ca.pem");
    expect(result.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined(); expect(result.WORKER_TRIGGER_TOKEN).toBeUndefined();
    expect(result.QIHANG_SERVICE_USER_ID).toBeUndefined(); expect(result.COOKIE).toBeUndefined();
  });
});
