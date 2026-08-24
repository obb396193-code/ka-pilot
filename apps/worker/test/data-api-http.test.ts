import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { SourceQueryResult } from "@ka/domain";

import { createDataApiServer } from "../src/data/http-server.js";
import { KaDataClientError } from "../src/data/ka-data-client.js";
import { DataQueryService, type DataSourceQueryPort } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

const internalToken = "fixture-internal-token-that-is-long-enough";
const auth = {
  workspaceId: "workspace-fixture",
  userId: "user-fixture",
  allowedAccounts: [{ media: "KUAISHOU", accountId: "account-1" }],
};

function ready(source: "ka_data" | "canonical", rows: Record<string, unknown>[]): SourceQueryResult {
  return {
    status: "ready",
    rows,
    returnedRowCount: rows.length,
    wholeResultTotal: { value: rows.length, availability: "available" },
    lineage: {
      source,
      datasetVersion: null,
      queryTemplateVersion: "v1",
      metricVersion: "fixture-v1",
      dataAsOf: null,
      timezone: null,
      dayCut: null,
      metadataAvailability: "unknown",
      authority: {
        policyVersion: "2026-08-24",
        useCase: "cross_media_operations",
        role: "default_authoritative",
      },
      objectIdentity: {
        objectType: "account",
        joinKeys: ["workspace_id", "media", "account_id"],
      },
      coverage: { complete: true },
      truncated: false,
      partial: false,
    },
    warnings: [],
  };
}

function authHeaders(token = internalToken): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-ka-workspace-id": auth.workspaceId,
    "x-ka-user-id": auth.userId,
    "x-ka-account-scope": Buffer.from(JSON.stringify(auth.allowedAccounts)).toString("base64url"),
  };
}

describe("data API HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(options: {
    maxResponseBytes?: number;
    kaData?: DataSourceQueryPort;
    platform?: DataSourceQueryPort;
  } = {}) {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: options.kaData ?? { query: async (resolved) => ready(
        "ka_data",
        resolved.outputShape === "account_rows"
          ? [{ media: "KUAISHOU", account_id: "account-1", cost: 10 }]
          : [{ cost: 10 }],
      ) },
      platform: options.platform ?? { query: async (resolved) => ready(
        "canonical",
        resolved.outputShape === "account_rows"
          ? [{ media: "KUAISHOU", accountId: "account-1", cost: 11 }]
          : [{ cost: 11 }],
      ) },
      requestId: () => "http-smoke-request",
    });
    const server = createDataApiServer({
      service,
      internalToken,
      ...options,
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  it.each(["ka_data", "platform", "reconcile"] as const)(
    "serves %s through the real POST /api/v1/data/query route",
    async (dataView) => {
      const baseUrl = await start();
      const response = await fetch(`${baseUrl}/api/v1/data/query`, {
        method: "POST",
        headers: { ...authHeaders(), "x-request-id": `bff-${dataView}-001` },
        body: JSON.stringify({
          queryId: dataView === "reconcile" ? "reconcile.account_daily" : "account.summary",
          params: { date: "2026-08-24" },
          dataView,
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(`bff-${dataView}-001`);
      const payload = await response.json();
      expect(payload).toMatchObject({ ok: true, data: { mode: dataView } });
    },
  );

  it("returns stable 401/403 envelopes before executing a query", async () => {
    const baseUrl = await start();
    const missing = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "bff-unauthorized-001",
      },
      body: "{}",
    });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("x-request-id")).toBe("bff-unauthorized-001");
    expect(await missing.json()).toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required",
        retryable: false,
        requestId: "bff-unauthorized-001",
      },
    });

    const forged = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders("wrong-internal-token-that-is-long-enough"),
      body: "{}",
    });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("serves health, rejects unknown routes, and enforces POST on the query route", async () => {
    const baseUrl = await start();
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const missing = await fetch(`${baseUrl}/not-a-route`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    const wrongMethod = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(wrongMethod.status).toBe(405);
  });

  it("rejects malformed auth scope, invalid JSON, and oversized request bodies", async () => {
    const baseUrl = await start();
    const malformedScope = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-ka-account-scope": "not-json" },
      body: "{}",
    });
    expect(malformedScope.status).toBe(403);

    const invalidJson = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: "{",
    });
    expect(invalidJson.status).toBe(400);

    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", []) },
      platform: { query: async () => ready("canonical", []) },
    });
    const limitedServer = createDataApiServer({
      service,
      internalToken,
      maxRequestBytes: 8,
    });
    servers.push(limitedServer);
    limitedServer.listen(0, "127.0.0.1");
    await once(limitedServer, "listening");
    const limitedAddress = limitedServer.address() as AddressInfo;
    const oversized = await fetch(`http://127.0.0.1:${limitedAddress.port}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ too: "large" }),
    });
    expect(oversized.status).toBe(413);
  });

  it("rejects weak tokens and invalid byte limits at composition time", () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", []) },
      platform: { query: async () => ready("canonical", []) },
    });
    expect(() => createDataApiServer({ service, internalToken: "short" })).toThrow(/32/);
    expect(() => createDataApiServer({
      service,
      internalToken,
      maxRequestBytes: 0,
    })).toThrow(/positive integer/);
  });

  it("returns a redacted timeout envelope over HTTP", async () => {
    const baseUrl = await start({
      kaData: {
        query: async () => {
          throw new KaDataClientError("UPSTREAM_TIMEOUT", "KA Data request timed out", true);
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "bff-timeout-001" },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "ka_data",
      }),
    });
    expect(response.headers.get("x-request-id")).toBe("bff-timeout-001");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_TIMEOUT",
        message: "KA Data request timed out",
        retryable: true,
        requestId: "bff-timeout-001",
      },
    });
  });

  it("safely regenerates an overlong correlation ID and never reflects it", async () => {
    const baseUrl = await start();
    const unsafe = "x".repeat(129);
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": unsafe,
      },
      body: "{}",
    });
    const body = await response.json();
    const responseRequestId = response.headers.get("x-request-id");
    expect(response.status).toBe(401);
    expect(responseRequestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(responseRequestId).not.toBe(unsafe);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED", requestId: responseRequestId },
    });
    expect(JSON.stringify(body)).not.toContain(unsafe);
  });

  it("blocks malicious adapter output at the HTTP boundary", async () => {
    const baseUrl = await start({
      platform: {
        query: async () => ready("canonical", [{
          workspaceId: auth.workspaceId,
          media: "KUAISHOU",
          accountId: "unauthorized-account",
        }]),
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "account.table",
        params: { date: "2026-08-24" },
        dataView: "platform",
      }),
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(JSON.stringify(body)).not.toContain("unauthorized-account");
  });

  it("fails closed with a stable truncated envelope when serialized output exceeds 16MB policy", async () => {
    const baseUrl = await start({ maxResponseBytes: 256 });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "ka_data",
      }),
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRUNCATED", requestId: expect.any(String) },
    });
    expect(JSON.stringify(body)).not.toContain("fixture-internal-token");
  });
});
