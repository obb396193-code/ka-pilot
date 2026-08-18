import { describe, expect, it, vi } from "vitest";

import {
  BlockedAuthError,
  QihangBusinessError,
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
});
