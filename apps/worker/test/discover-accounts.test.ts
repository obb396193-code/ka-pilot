import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { runDiscoverAccounts } from "../src/qihang/discover-accounts.js";

const env = { QIHANG_BASE_URL: "https://qihang.example.test/get_data", WORKER_SERVICE_QIHANG_USER_ID: "synthetic-user" };
const row = (id = "demo-1") => ({ account_id: id, account_name: "示例", task_id: "task-1", biz_name: "CVR" });
const page = (rows: unknown[], totalNum: unknown = rows.length, pageNum = 1) => new Response(JSON.stringify({ successful: true, data: { rows, totalNum, pageNum, pageSize: 50 } }));
const args = ["--media", "KUAISHOU"];
const setup = () => ({ args, env, fetchFn: vi.fn(async () => page([row()])), write: vi.fn() });

describe("read-only explicit account discovery", () => {
  it("uses server identity and emits only five frozen fields after successful paging", async () => {
    const options = setup();
    options.fetchFn.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, i) => ({ ...row(`a-${i}`), secret: "never-output" })), 51));
    options.fetchFn.mockResolvedValueOnce(page([row("last")], 51, 2));
    await runDiscoverAccounts(options);
    expect(options.fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = options.fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new URL(url).searchParams.get("resource")).toBe("account");
    expect(new URL(url).searchParams.get("userId")).toBe("synthetic-user");
    expect(init.method).toBe("GET");
    expect(options.write).toHaveBeenCalledTimes(1);
    const output = options.write.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toHaveLength(51);
    expect(JSON.parse(output)[0]).toEqual({ media: "KUAISHOU", ...row("a-0") });
    expect(output).not.toContain("never-output");
    expect(output).not.toContain("synthetic-user");
  });
  it("permits a proven empty account page, not missing configuration", async () => {
    const options = setup(); options.fetchFn.mockResolvedValue(page([]));
    await runDiscoverAccounts(options);
    expect(options.write).toHaveBeenCalledWith("[]\n");
  });
  it.each([{}, { QIHANG_BASE_URL: env.QIHANG_BASE_URL }, { WORKER_SERVICE_QIHANG_USER_ID: "x" }, { ...env, QIHANG_BASE_URL: "http://remote.test/" }, { ...env, QIHANG_BASE_URL: "https://user:pass@example.test/" }])("rejects absent/unsafe config before networking %j", async (badEnv) => {
    const options = { ...setup(), env: badEnv };
    await expect(runDiscoverAccounts(options)).rejects.toThrow(/^Account discovery failed$/);
    expect(options.fetchFn).not.toHaveBeenCalled(); expect(options.write).not.toHaveBeenCalled();
  });
  it.each([[], ["--media"], ["--media", "kuaishou"], [...args, "--user-id", "other"], [...args, ...args]].map((badArgs) => ({ badArgs })))("rejects browser-like/self-reported selectors $badArgs", async ({ badArgs }) => {
    const options = { ...setup(), args: badArgs };
    await expect(runDiscoverAccounts(options)).rejects.toThrow();
    expect(options.fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    { ...row(), account_id: null }, { ...row(), account_id: 123.5 },
    { ...row(), account_id: Number.MAX_SAFE_INTEGER + 1 }, { ...row(), media: "TENCENT" },
    { ...row(), account_name: {} }, { ...row(), task_id: [] }, { ...row(), biz_name: false },
  ])("fails closed on malformed or crossed media row %j", async (badRow) => {
    const options = setup(); options.fetchFn.mockResolvedValue(page([badRow]));
    await expect(runDiscoverAccounts(options)).rejects.toThrow(/^Account discovery failed$/);
    expect(options.write).not.toHaveBeenCalled();
  });
  it("preserves safe numeric identifiers and unknown text as null", async () => {
    const options = setup(); options.fetchFn.mockResolvedValue(page([{ account_id: 123, task_id: 456 }]));
    await runDiscoverAccounts(options);
    expect(JSON.parse(options.write.mock.calls[0]?.[0] as string)).toEqual([{ media: "KUAISHOU", account_id: "123", account_name: null, task_id: "456", biz_name: null }]);
  });
  it.each([null, "bad", -1, 1.5, 10001])("rejects missing/invalid/overbudget totals %j", async (total) => {
    const options = setup(); options.fetchFn.mockResolvedValue(page([row()], total));
    await expect(runDiscoverAccounts(options)).rejects.toThrow(); expect(options.write).not.toHaveBeenCalled();
  });
  it("rejects omitted rows even if source defaults them to empty", async () => {
    const options = setup(); options.fetchFn.mockResolvedValue(new Response(JSON.stringify({ successful: true, data: { totalNum: 0 } })));
    await expect(runDiscoverAccounts(options)).rejects.toThrow(); expect(options.write).not.toHaveBeenCalled();
  });
  it.each(["short", "changed-total", "duplicate", "wrong-page", "source-error"])("never outputs partial prefix after %s", async (mode) => {
    const options = setup();
    options.fetchFn.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, i) => row(`a-${i}`)), 51));
    options.fetchFn.mockResolvedValueOnce(mode === "source-error" ? new Response("private-upstream", { status: 403 }) : page(mode === "short" ? [] : [row(mode === "duplicate" ? "a-0" : "last")], mode === "changed-total" ? 52 : 51, mode === "wrong-page" ? 1 : 2));
    await expect(runDiscoverAccounts(options)).rejects.toThrow(/^Account discovery failed$/);
    expect(options.write).not.toHaveBeenCalled();
  });
  it("actual CLI without config exits safely without stdout or any DB dependency", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/qihang/discover-accounts.ts", import.meta.url)), ...args], { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Account discovery failed\n");
  });
  it.each([
    { rows: [row()], totalNum: 1, truncated: true },
    { rows: [row()], totalNum: 1, limit_clamped: true },
    { rows: [row()], totalNum: 1, pageSize: 20 },
    { rows: [row()], totalNum: 1, pageNum: "bad" },
    null,
  ])("rejects suspect pagination source %j", async (data) => {
    const options = setup(); options.fetchFn.mockResolvedValue(new Response(JSON.stringify({ successful: true, data })));
    await expect(runDiscoverAccounts(options)).rejects.toThrow(); expect(options.write).not.toHaveBeenCalled();
  });
});
