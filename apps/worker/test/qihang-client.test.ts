import { describe, expect, it, vi } from "vitest";

import {
  BlockedAuthError,
  QihangBusinessError,
  QihangError,
  QihangResourceLimitError,
  QihangSuspectedTruncationError,
  RetryExhaustedError,
} from "../src/qihang/errors.js";
import { QihangClient } from "../src/qihang/client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("QihangClient", () => {
  it("constructs the account pagination request from explicit job identity", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        successful: true,
        data: { rows: [{ account_id: "a1" }], totalNum: 1, pageNum: 2, pageSize: 50 },
      }),
    );
    const client = new QihangClient({ fetchFn });

    const result = await client.query({
      resource: "account",
      userId: "job-user-123",
      media: "KUAISHOU",
      pageNum: 2,
      pageSize: 50,
      keyword: "美妆",
      bizName: "业务A",
    });

    const calledUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.get("resource")).toBe("account");
    expect(calledUrl.searchParams.get("userId")).toBe("job-user-123");
    expect(calledUrl.searchParams.get("returnTotalNum")).toBe("true");
    expect(calledUrl.searchParams.get("pageNum")).toBe("2");
    expect(calledUrl.searchParams.get("pageSize")).toBe("50");
    expect(result.rows).toEqual([{ account_id: "a1" }]);
    expect(result.pagination?.totalNum).toBe(1);
  });

  // F-OS-005（2026-09-11 内网实测）：resource=account 忽略 accountIds，766 个 id 把请求行撑过网关 8K。
  it("never sends accountIds on the account pagination request, however many are bound", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ successful: true, data: { rows: [], totalNum: 0, pageNum: 1, pageSize: 50 } }),
    );
    const client = new QihangClient({ fetchFn });
    const accountIds = Array.from({ length: 766 }, (_, i) => `18032405${String(i).padStart(3, "0")}`);
    await client.query({ resource: "account", userId: "u1", media: "KUAISHOU", accountIds, pageNum: 1, pageSize: 50 });
    const calledUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.has("accountIds")).toBe(false);
    expect(new TextEncoder().encode(calledUrl.toString()).byteLength).toBeLessThan(8_192);
  });

  it("labels an HTTP 200 text/html gateway page as unexpected_content_type without leaking the body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response("<html><head><script src=\"aplus-core\"></script></head></html>", {
        status: 200,
        headers: { "content-type": "text/html;charset=utf-8" },
      }),
    );
    const client = new QihangClient({ fetchFn, maxRetries: 1, retryBaseMs: 0, sleep: async () => undefined });
    const error = await client
      .query({ resource: "account", userId: "u1", media: "KUAISHOU", pageNum: 1, pageSize: 50 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    const message = (error as Error).message;
    expect(message).toContain('"kind":"unexpected_content_type"');
    expect(message).not.toContain("aplus-core");
  });

  it.each([
    ["account_offline", { beginDate: "20260801", endDate: "20260818" }],
    ["account_realtime", { ds: "20260819" }],
    ["ad_realtime", { ds: "20260819", hh: 10, adIds: ["d1", "d2"] }],
  ] as const)("constructs %s query parameters", async (resource, extra) => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ successful: true, data: [] }),
    );
    const client = new QihangClient({ fetchFn });

    if (resource === "account_offline") {
      await client.query({
        resource,
        userId: "u1",
        media: "KUAISHOU",
        accountIds: ["a1", "a2"],
        ...extra,
      });
    } else if (resource === "account_realtime") {
      await client.query({
        resource,
        userId: "u1",
        media: "KUAISHOU",
        accountIds: ["a1", "a2"],
        ...extra,
      });
    } else {
      await client.query({
        resource,
        userId: "u1",
        media: "KUAISHOU",
        accountIds: ["a1", "a2"],
        ...extra,
      });
    }

    const calledUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.get("resource")).toBe(resource);
    expect(calledUrl.searchParams.get("accountIds")).toBe("a1,a2");
    if (resource === "account_offline") {
      expect(calledUrl.searchParams.get("beginDate")).toBe("20260801");
      expect(calledUrl.searchParams.get("endDate")).toBe("20260818");
    } else {
      expect(calledUrl.searchParams.get("ds")).toBe("20260819");
    }
  });

  it("serializes internal ISO dates to the compact format confirmed by Qihang", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ successful: true, data: [] }),
    );
    const client = new QihangClient({ fetchFn });

    await client.query({
      resource: "account_offline",
      userId: "u1",
      beginDate: "2026-08-18",
      endDate: "2026-08-19",
    });
    await client.query({
      resource: "account_realtime",
      userId: "u1",
      ds: "2026-08-20",
    });

    const offlineUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
    const realtimeUrl = new URL(fetchFn.mock.calls[1]?.[0] as string);
    expect(offlineUrl.searchParams.get("beginDate")).toBe("20260818");
    expect(offlineUrl.searchParams.get("endDate")).toBe("20260819");
    expect(realtimeUrl.searchParams.get("ds")).toBe("20260820");
  });

  it.each([0, 23, 24, "0", "23", "24"])(
    "accepts a confirmed Qihang cumulative hour boundary: %s",
    async (hh) => {
      const fetchFn = vi.fn<typeof fetch>(async () =>
        jsonResponse({ successful: true, data: [] }),
      );
      const client = new QihangClient({ fetchFn });

      await client.query({
        resource: "ad_realtime",
        userId: "u1",
        ds: "20260819",
        accountIds: ["a1"],
        hh,
      });

      const calledUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
      expect(calledUrl.searchParams.get("hh")).toBe(String(hh));
    },
  );

  it.each([-1, 25, 1.5, "-1", "25", "1.5", "", "not-an-hour"])(
    "rejects an unsafe Qihang cumulative hour before sending a request: %s",
    async (hh) => {
      const fetchFn = vi.fn<typeof fetch>();
      const client = new QihangClient({ fetchFn });

      await expect(client.query({
        resource: "ad_realtime",
        userId: "u1",
        ds: "20260819",
        accountIds: ["a1"],
        hh,
      })).rejects.toThrow(/hh.*0.*24/i);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each(["2026/08/20", "2026-02-30"])(
    "rejects malformed or impossible dates before sending a request: %s",
    async (ds) => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new QihangClient({ fetchFn });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds }),
    ).rejects.toBeInstanceOf(QihangError);
    expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("retries gateway failures with exponential backoff", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "bad gateway" }, 502))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ successful: true, data: [] }));
    const sleep = vi.fn(async () => undefined);
    const client = new QihangClient({ fetchFn, sleep, retryBaseMs: 100 });

    await client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("throws after the configured number of retries", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: "timeout" }, 504));
    const client = new QihangClient({
      fetchFn,
      sleep: async () => undefined,
      maxRetries: 2,
    });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403])("blocks auth on HTTP %s without retry", async (status) => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: "denied" }, status));
    const client = new QihangClient({ fetchFn, sleep: async () => undefined });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(BlockedAuthError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not guess that an HTTP 200 business error is an auth failure", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ successful: false, code: "UNKNOWN_CODE", message: "failed" }),
    );
    const client = new QihangClient({ fetchFn });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(QihangBusinessError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized declared response before reading its body", async () => {
    let bodyRead = false;
    const response = new Response("oversized", {
      status: 200,
      headers: { "content-length": "100" },
    });
    Object.defineProperty(response, "body", {
      get() {
        bodyRead = true;
        return null;
      },
    });
    const fetchFn = vi.fn(async () => response);
    const client = new QihangClient({ fetchFn, maxResponseBytes: 10 });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(bodyRead).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized streamed response when content-length is absent", async () => {
    const fetchFn = vi.fn(async () => new Response("x".repeat(40), { status: 200 }));
    const client = new QihangClient({ fetchFn, maxResponseBytes: 10 });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects successful envelopes that exceed the configured row budget", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ successful: true, data: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
    );
    const client = new QihangClient({ fetchFn, maxRows: 2 });

    await expect(
      client.query({ resource: "account_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects excessive account or ad identifiers before sending a request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new QihangClient({ fetchFn, maxIdsPerQuery: 1 });

    await expect(
      client.query({
        resource: "ad_realtime",
        userId: "u1",
        ds: "20260819",
        accountIds: ["a1", "a2"],
        adIds: ["d1", "d2"],
      }),
    ).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects an unfiltered ad realtime query before sending a request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new QihangClient({ fetchFn });

    await expect(
      client.query({ resource: "ad_realtime", userId: "u1", ds: "20260819" }),
    ).rejects.toThrow(/accountIds or adIds/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails closed when a filtered ad response exactly hits the suspected truncation boundary", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        successful: true,
        data: [
          { account_id: "a1", ad_id: "d1" },
          { account_id: "a1", ad_id: "d2" },
        ],
      }),
    );
    const client = new QihangClient({ fetchFn, suspectedAdTruncationRows: 2 });

    await expect(
      client.query({
        resource: "ad_realtime",
        userId: "u1",
        ds: "20260819",
        accountIds: ["a1"],
      }),
    ).rejects.toBeInstanceOf(QihangSuspectedTruncationError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded observation for a non-boundary response", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        successful: true,
        data: [{ account_id: "a1", ad_id: "d1", last_sync_time: "2026-08-20 14:31:00" }],
      }),
    );
    const client = new QihangClient({
      fetchFn,
      suspectedAdTruncationRows: 2,
      now: () => new Date("2026-08-20T06:32:00.000Z"),
    });

    const result = await client.query({
      resource: "ad_realtime",
      userId: "u1",
      ds: "20260820",
      accountIds: ["a1"],
    });

    expect(result.observation).toEqual({
      resource: "ad_realtime",
      rowCount: 1,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      observedAt: "2026-08-20T06:32:00.000Z",
      lastSyncTime: "2026-08-20 14:31:00",
      availability: "observed",
    });
    expect(JSON.stringify(result.observation)).not.toContain("a1");
    expect(JSON.stringify(result.observation)).not.toContain("d1");
  });

  it("rejects an oversized encoded query URL before sending a request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = new QihangClient({ fetchFn, maxQueryUrlBytes: 100 });

    await expect(
      client.query({
        resource: "account_realtime",
        userId: "u1",
        ds: "20260819",
        accountIds: ["x".repeat(200)],
      }),
    ).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    { maxResponseBytes: 0 },
    { maxRows: -1 },
    { maxIdsPerQuery: 1.5 },
    { maxQueryUrlBytes: Number.NaN },
  ])("rejects an invalid resource limit: %o", (options) => {
    expect(() => new QihangClient(options)).toThrow(/positive integer/i);
  });
});
