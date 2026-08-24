import { describe, expect, it, vi } from "vitest";

import { createDataQueryRegistry } from "../src/data/query-registry.js";
import {
  KaDataClient,
  KaDataClientError,
  createKaDataClientFromEnv,
} from "../src/data/ka-data-client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function resolvedSummary() {
  return createDataQueryRegistry().resolve(
    "account.summary",
    { date: "2026-08-24" },
    "ka_data",
  );
}

describe("KaDataClient", () => {
  it("uses a fixed HTTPS origin/path and never serializes its token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({
      backend: "sqlite",
      rowCount: 1,
      rows: [{ cost: 12 }],
      truncated: false,
      limit_clamped: false,
    }));
    const token = "fixture-secret-token";
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token,
      fetchFn,
    });

    await client.query(resolvedSummary(), {
      workspaceId: "workspace-fixture",
      userId: "user-fixture",
      accounts: [{ media: "KUAISHOU", accountId: "fixture-account" }],
    });

    const [input, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(input)).toBe("https://ka-data.example.internal/api/query");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.stringify(client)).not.toContain(token);
  });

  it("creates the production reader only from server-side environment secrets", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({
      backend: "sqlite",
      rowCount: 0,
      rows: [],
      truncated: false,
      limit_clamped: false,
    }));
    const client = createKaDataClientFromEnv({
      KA_DATA_BASE_URL: "https://ka-data.example.internal",
      KA_DATA_READER_TOKEN: "server-only-token",
      KA_DATA_DATASET_VERSION: "fixture-version",
    }, { fetchFn });

    await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [],
    });
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get("authorization"))
      .toBe("Bearer server-only-token");
    expect(JSON.stringify(client)).not.toContain("server-only-token");
  });

  it("does not invent dataset freshness metadata absent from the upstream response", async () => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [{ cost: 12 }],
      }),
    });
    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    });
    expect(result.lineage).toMatchObject({
      datasetVersion: null,
      dataAsOf: null,
      timezone: null,
      dayCut: null,
      metadataAvailability: "unknown",
    });
  });

  it("rejects any production access mode other than the frozen shared reader mode", () => {
    expect(() => createKaDataClientFromEnv({
      KA_DATA_BASE_URL: "https://ka-data.example.internal",
      KA_DATA_READER_TOKEN: "server-only-token",
      KA_DATA_ACCESS_MODE: "editor",
    })).toThrow(/access_mode/i);
  });

  it.each([
    "http://ka-data.example.internal",
    "https://user:pass@ka-data.example.internal",
    "https://ka-data.example.internal/not-the-origin",
  ])("rejects an unsafe base URL: %s", (baseUrl) => {
    expect(() => new KaDataClient({ baseUrl, token: "fixture-token" })).toThrow(/base URL/i);
  });

  it("rejects redirects without following them", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/query" },
    }));
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn,
    });

    await expect(client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([2_000, 10_000])("marks an exact %i-row boundary as suspected truncation", async (rowCount) => {
    const rows = Array.from({ length: rowCount }, (_, index) => ({ index }));
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount,
        rows,
        truncated: false,
        limit_clamped: false,
      }),
    });

    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    });

    expect(result.lineage.truncated).toBe(true);
    expect(result.lineage.partial).toBe(true);
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("treats an exact body byte limit as suspected truncation", async () => {
    const base = JSON.stringify({
      backend: "sqlite",
      rowCount: 1,
      rows: [{ padding: "" }],
      truncated: false,
      limit_clamped: false,
    });
    const byteLimit = 512;
    const marker = '"}],"truncated"';
    const padding = "x".repeat(byteLimit - new TextEncoder().encode(base).byteLength);
    const body = base.replace(marker, `${padding}"}],"truncated"`);
    expect(new TextEncoder().encode(body).byteLength).toBe(byteLimit);
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      maxResponseBytes: byteLimit,
      fetchFn: async () => new Response(body, {
        headers: { "content-type": "application/json" },
      }),
    });

    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    });
    expect(result.lineage.truncated).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/byte/i);
  });

  it("returns stable redacted errors for non-JSON and upstream failures", async () => {
    const secretBody = "upstream leaked internal details";
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => new Response(secretBody, { status: 500 }),
    });

    let thrown: unknown;
    try {
      await client.query(resolvedSummary(), {
        workspaceId: "w",
        userId: "u",
        accounts: [{ media: "KUAISHOU", accountId: "a" }],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KaDataClientError);
    expect(thrown).toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(String(thrown)).not.toContain(secretBody);
  });

  it("does not claim a whole total for paginated account.table responses", async () => {
    const resolved = createDataQueryRegistry().resolve(
      "account.table",
      { date: "2026-08-24", page: 1, pageSize: 50 },
      "ka_data",
    );
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [{ media: "KUAISHOU", account_id: "leading-zero-001" }],
      }),
    });

    const result = await client.query(resolved, {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "leading-zero-001" }],
    });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "missing" });
    expect(result.lineage.coverage.returnedObjects).toBe(1);
  });

  it("times out with a stable retryable error", async () => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      timeoutMs: 5,
      fetchFn: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });

    await expect(client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    })).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", retryable: true });
  });
});
