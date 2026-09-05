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

function kaSummary(cost = 12) {
  return {
    row_count: 1,
    account_count: 1,
    cost,
    exposure: 100,
    click: 10,
    conversion: 2,
    cash_cost: cost,
  };
}

function kaDaily(accountId: string, overrides: Record<string, unknown> = {}) {
  return {
    media: "KUAISHOU",
    account_id: accountId,
    ds: "20260824",
    cost_yuan: 12,
    cash_yuan: 12,
    show: 100,
    click: 10,
    conv: 2,
    ...overrides,
  };
}

describe("KaDataClient", () => {
  it.each([-1, 3, "2", 1.5])("rejects impossible account-day coverage metadata %s", async (account_day_count) => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal", token: "fixture-token",
      fetchFn: async () => jsonResponse({ backend: "sqlite", rowCount: 1, rows: [{ ...kaSummary(), account_day_count }] }),
    });
    await expect(client.query(createDataQueryRegistry().resolve("account.summary", {
      dateFrom: "2026-08-23", dateTo: "2026-08-24",
    }, "ka_data"), { workspaceId: "w", userId: "u", scopeKind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a" }] }))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it.each([
    ["20260823"],
    ["20260823", "20260823"],
    ["20260822", "20260823"],
  ])("does not claim a complete trend window from %j", async (...dates) => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal", token: "fixture-token",
      fetchFn: async () => jsonResponse({ backend: "sqlite", rowCount: dates.length, rows: dates.map((ds) => ({ ds, ...kaSummary() })) }),
    });
    const request = client.query(createDataQueryRegistry().resolve("account.trend", {
      dateFrom: "2026-08-23", dateTo: "2026-08-24",
    }, "ka_data"), { workspaceId: "w", userId: "u", scopeKind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a" }] });
    if (dates.length === 1) expect((await request).lineage).toMatchObject({ partial: true, truncated: false });
    else await expect(request).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("uses a fixed HTTPS origin/path and never serializes its token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({
      backend: "sqlite",
      rowCount: 1,
      rows: [kaSummary()],
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
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "user-fixture",
      scopeKind: "explicit_accounts",
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
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [],
    });
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get("authorization"))
      .toBe("Bearer server-only-token");
    expect(JSON.stringify(client)).not.toContain("server-only-token");
    const result = await client.query(resolvedSummary(), {
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [],
    });
    expect(result.lineage.datasetVersion).toBeNull();
  });

  it("does not invent dataset freshness metadata absent from the upstream response", async () => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [kaSummary()],
      }),
    });
    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      scopeKind: "explicit_accounts",
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

  it("does not call an empty aggregate complete when an authorized account is missing", async () => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [{ ...kaSummary(0), row_count: 0, account_count: 0 }],
      }),
    });
    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "missing-account" }],
    });
    expect(result.lineage).toMatchObject({
      coverage: {
        complete: false,
        requestedObjects: 1,
        returnedObjects: 0,
        reason: expect.stringMatching(/account scope/i),
      },
      partial: true,
      truncated: false,
    });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("omits trend returnedObjects when daily aggregates cannot prove the cross-day union", async () => {
    const resolved = createDataQueryRegistry().resolve(
      "account.trend",
      { dateFrom: "2026-08-23", dateTo: "2026-08-24" },
      "ka_data",
    );
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 2,
        rows: [
          { ds: "20260823", ...kaSummary(), account_count: 1 },
          { ds: "20260824", ...kaSummary(), account_count: 1 },
        ],
      }),
    });
    const result = await client.query(resolved, {
      workspaceId: "w",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [
        { media: "KUAISHOU", accountId: "a-1" },
        { media: "KUAISHOU", accountId: "a-2" },
      ],
    });
    expect(result.lineage.coverage).toMatchObject({
      complete: false,
      requestedObjects: 2,
    });
    expect(result.lineage.coverage).not.toHaveProperty("returnedObjects");
    expect(result.lineage).toMatchObject({ partial: true, truncated: false });
  });

  it("marks a trend partial when any returned day is missing an authorized account", async () => {
    const resolved = createDataQueryRegistry().resolve(
      "account.trend",
      { dateFrom: "2026-08-23", dateTo: "2026-08-24" },
      "ka_data",
    );
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 2,
        rows: [
          { ds: "20260823", ...kaSummary(), account_count: 2 },
          { ds: "20260824", ...kaSummary(), account_count: 1 },
        ],
      }),
    });
    const result = await client.query(resolved, {
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [
        { media: "KUAISHOU", accountId: "a-1" },
        { media: "KUAISHOU", accountId: "a-2" },
      ],
    });
    expect(result.lineage).toMatchObject({ partial: true, truncated: false, coverage: { complete: false } });
    expect(result.lineage.coverage).not.toHaveProperty("returnedObjects");
    expect(result.wholeResultTotal.availability).toBe("partial");
  });

  it("fails closed when an aggregate claims more objects than the authenticated scope", async () => {
    const client = new KaDataClient({
      baseUrl: "https://ka-data.example.internal",
      token: "fixture-token",
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [{ ...kaSummary(), account_count: 2 }],
      }),
    });
    await expect(client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a-1" }],
    })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("does not use deployment timezone or day-cut fallbacks as source lineage", async () => {
    const client = createKaDataClientFromEnv({
      KA_DATA_BASE_URL: "https://ka-data.example.internal",
      KA_DATA_READER_TOKEN: "server-only-token",
      KA_DATA_TIMEZONE: "Asia/Shanghai",
      KA_DATA_DAY_CUT: "calendar_day",
    }, {
      fetchFn: async () => jsonResponse({
        backend: "sqlite",
        rowCount: 1,
        rows: [kaSummary()],
      }),
    });
    const result = await client.query(resolvedSummary(), {
      workspaceId: "w",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a-1" }],
    });
    expect(result.lineage).toMatchObject({ timezone: null, dayCut: null });
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
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([2_000, 10_000])("marks an exact %i-row boundary as suspected truncation", async (rowCount) => {
    const rows = Array.from({ length: rowCount }, () => kaSummary());
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
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    });

    expect(result.lineage.truncated).toBe(true);
    expect(result.lineage.partial).toBe(true);
    expect(result.rows[0]).toMatchObject({ metrics: {
      cost: { value: null, availability: "error" },
      ratios: { ctr: { value: null, state: "undefined" } },
    } });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("treats an exact body byte limit as suspected truncation", async () => {
    const base = JSON.stringify({
      backend: "sqlite",
      rowCount: 1,
      rows: [{ ...kaSummary(), padding: "" }],
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
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    });
    expect(result.lineage.truncated).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/byte/i);
    expect(result.rows[0]).toMatchObject({ metrics: { cost: { value: null, availability: "error" } } });
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
        scopeKind: "explicit_accounts",
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
        rows: [kaDaily("leading-zero-001")],
      }),
    });

    const result = await client.query(resolved, {
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "leading-zero-001" }],
    });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "missing" });
    expect(result.lineage.coverage.returnedObjects).toBe(1);
  });

  it("injects the authenticated workspace into account rows and overwrites upstream claims", async () => {
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
        rows: [kaDaily("a-1", { workspace_id: "upstream-forged-workspace" })],
      }),
    });

    const result = await client.query(resolved, {
      workspaceId: "00000000-0000-4000-8000-000000000024",
      userId: "u",
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a-1" }],
    });

    expect(result.rows).toEqual([expect.objectContaining({
      workspaceId: "00000000-0000-4000-8000-000000000024",
      media: "KUAISHOU",
      accountId: "a-1",
    })]);
    expect(result.rows[0]).not.toHaveProperty("workspace_id");
    expect(JSON.stringify(result)).not.toContain("upstream-forged-workspace");
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
      scopeKind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "a" }],
    })).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", retryable: true });
  });
});
