import { describe, expect, it, vi } from "vitest";
import { QihangClient } from "../src/qihang/client.js";
import { BlockedAuthError, QihangBusinessError, QihangResourceLimitError, RetryExhaustedError } from "../src/qihang/errors.js";
import { protocolDiagnostic } from "../src/qihang/protocol-diagnostic.js";

const query = { resource: "account_realtime" as const, userId: "synthetic-private-identity", media: "KUAISHOU", ds: "20260909", accountIds: ["synthetic-private-account"] };
const ok = () => new Response(JSON.stringify({ successful: true, data: [] }));
describe("Qihang transient protocol errors", () => {
  it.each(["<html>Bad Gateway</html>", JSON.stringify({ data: [] }), JSON.stringify({ successful: true, data: { wrong: "shape" } })])(
    "retries malformed 200 response before succeeding", async body => {
      const fetchFn = vi.fn().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(ok());
      const sleep = vi.fn(async (ms: number) => { void ms; });
      const client = new QihangClient({ fetchFn, sleep, retryBaseMs: 10 });
      await expect(client.query(query)).resolves.toMatchObject({ rows: [] });
      expect(fetchFn).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledWith(10);
    },
  );
  it("exhausts four attempts with safe resource/date/batch evidence in top-level message", async () => {
    const sensitive = '<html>token=synthetic-secret userId=synthetic-private-identity https://private.example/?password=synthetic-password</html>';
    const fetchFn = vi.fn(async () => new Response(sensitive));
    const sleep = vi.fn(async (ms: number) => { void ms; });
    const error = await new QihangClient({ fetchFn, sleep, retryBaseMs: 10 }).query(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryExhaustedError);
    expect(fetchFn).toHaveBeenCalledTimes(4); expect(sleep.mock.calls).toEqual([[10], [20], [40]]);
    const message = (error as Error).message;
    expect(message).toContain("account_realtime"); expect(message).toContain("20260909");
    expect(message).toContain('"accountCount":1'); expect(message).toContain('"kind":"invalid_json"');
    expect(message).toMatch(/"bodySha256":"[0-9a-f]{64}"/);
    expect(message).not.toMatch(/synthetic-private|synthetic-secret|synthetic-password|private\.example|<html>|userId|password/);
    expect(message.length).toBeLessThan(2000);
  });
  it.each([401, 403])("does not retry auth HTTP %s despite malformed body", async status => {
    const fetchFn = vi.fn(async () => new Response("private", { status }));
    await expect(new QihangClient({ fetchFn }).query(query)).rejects.toBeInstanceOf(BlockedAuthError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("does not retry an explicit business denial or oversize response", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ successful: false, code: "DENIED", message: "not permitted" })));
    await expect(new QihangClient({ fetchFn }).query(query)).rejects.toBeInstanceOf(QihangBusinessError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const huge = vi.fn(async () => new Response("x".repeat(100)));
    await expect(new QihangClient({ fetchFn: huge, maxResponseBytes: 50 }).query(query)).rejects.toBeInstanceOf(QihangResourceLimitError);
    expect(huge).toHaveBeenCalledTimes(1);
  });
  it("diagnostic projects only bounded dates/hours/counts, never arbitrary query strings", () => {
    const cases = [
      { resource: "account" as const, userId: query.userId, keyword: "private-keyword", bizName: "private-business", pageNum: 2, pageSize: 50 },
      { resource: "account_offline" as const, userId: query.userId, beginDate: "2026-09-01", endDate: "20260909" },
      { ...query, media: "secret-media\npassword=private", ds: "private-date" },
      { resource: "ad_realtime" as const, userId: query.userId, ds: "20260909", hh: "24", adIds: ["private-ad"] },
      { resource: "ad_realtime" as const, userId: query.userId, ds: "20260909", hh: "bad-hour" },
    ];
    const parsed = cases.map(q => JSON.parse(protocolDiagnostic(q, "invalid_envelope", "private-body")));
    expect(parsed[0]).toMatchObject({ media: "KUAISHOU", pageNum: 2, pageSize: 50, accountCount: 0 });
    expect(parsed[1]).toMatchObject({ beginDate: "2026-09-01", endDate: "20260909" });
    expect(parsed[2]).toMatchObject({ media: "unreported" }); expect(parsed[2]).not.toHaveProperty("ds");
    expect(parsed[3]).toMatchObject({ hh: 24, adCount: 1 }); expect(parsed[4]).not.toHaveProperty("hh");
    expect(JSON.stringify(parsed)).not.toMatch(/private|userId|password|keyword|bizName/);
  });
});
