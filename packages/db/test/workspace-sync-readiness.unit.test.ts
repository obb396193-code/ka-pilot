import { describe, expect, it, vi } from "vitest";

import {
  loadWorkspaceSyncReadiness,
  loadWorkspaceSyncReadinessBatch,
  type WorkspaceSyncReadinessQueryPort,
} from "../src/workspace-sync-readiness.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const requestingUserId = "22222222-2222-4222-8222-222222222222";
const dates = { dateFrom: "2026-09-09", dateTo: "2026-09-10" };

function clientWith(rows: unknown[]): {
  client: WorkspaceSyncReadinessQueryPort;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows });
  return {
    client: { query } as unknown as WorkspaceSyncReadinessQueryPort,
    query,
  };
}

describe("workspace sync readiness", () => {
  it("passes only trusted normalized tuple scope to the readiness query", async () => {
    const { client, query } = clientWith([{ initial_full_complete: true }]);

    await expect(loadWorkspaceSyncReadiness(client, {
      ...dates,
      workspaceId,
      requestingUserId,
      allowedAccounts: [{ media: " KUAISHOU ", accountId: " account-1 " }],
    })).resolves.toBe(true);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      workspaceId,
      requestingUserId,
      JSON.stringify([{ media: "KUAISHOU", account_id: "account-1" }]),
      dates.dateFrom,
      dates.dateTo,
    ]);
  });

  it.each([
    { workspaceId: "not-a-uuid", requestingUserId, message: "workspaceId must be a UUID" },
    { workspaceId, requestingUserId: "not-a-uuid", message: "requestingUserId must be a UUID" },
  ])("rejects invalid actor keys before querying", async (input) => {
    const { client, query } = clientWith([]);
    await expect(loadWorkspaceSyncReadiness(client, {
      ...dates,
      ...input,
      allowedAccounts: [],
    })).rejects.toThrow(input.message);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects blank or duplicate account tuples", async () => {
    const { client, query } = clientWith([]);
    await expect(loadWorkspaceSyncReadiness(client, {
      ...dates,
      workspaceId,
      requestingUserId,
      allowedAccounts: [{ media: "", accountId: "account-1" }],
    })).rejects.toThrow("requires media and accountId");
    await expect(loadWorkspaceSyncReadiness(client, {
      ...dates,
      workspaceId,
      requestingUserId,
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "account-1" },
        { media: " KUAISHOU ", accountId: " account-1 " },
      ],
    })).rejects.toThrow("contains a duplicate tuple");
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when PostgreSQL does not return a boolean readiness row", async () => {
    const missing = clientWith([]);
    const invalid = clientWith([{ initial_full_complete: "true" }]);
    const input = { ...dates, workspaceId, requestingUserId, allowedAccounts: [] };

    await expect(loadWorkspaceSyncReadiness(missing.client, input)).rejects.toThrow(
      "workspace sync readiness query returned no row",
    );
    await expect(loadWorkspaceSyncReadiness(invalid.client, input)).rejects.toThrow(
      "workspace sync readiness query returned no row",
    );
  });

  it.each([
    { dateFrom: "2026-02-31", dateTo: "2026-03-01" },
    { dateFrom: "2026-09-11", dateTo: "2026-09-10" },
    { dateFrom: "2026-08-01", dateTo: "2026-09-10" },
    { dateFrom: undefined, dateTo: undefined },
  ])("rejects invalid or missing frozen dates before SQL: %j", async (range) => {
    const { client, query } = clientWith([]);
    await expect(loadWorkspaceSyncReadiness(client, {
      workspaceId, requestingUserId, allowedAccounts: [], ...range,
    } as Parameters<typeof loadWorkspaceSyncReadiness>[1])).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("batches frozen windows in one query and checks ordinal completeness", async () => {
    const { client, query } = clientWith([
      { ordinal: 1, initial_full_complete: false }, { ordinal: 0, initial_full_complete: true },
    ]);
    const input = { ...dates, workspaceId, requestingUserId, allowedAccounts: [{ media: "KUAISHOU", accountId: "a" }] };
    await expect(loadWorkspaceSyncReadinessBatch(client, [input, { ...input, dateFrom: dates.dateTo }])).resolves.toEqual([true, false]);
    expect(query).toHaveBeenCalledOnce();
    const duplicate = clientWith([{ ordinal: 0, initial_full_complete: true }, { ordinal: 0, initial_full_complete: false }]);
    await expect(loadWorkspaceSyncReadinessBatch(duplicate.client, [input, input])).rejects.toThrow();
    await expect(loadWorkspaceSyncReadinessBatch(clientWith([]).client, [input])).rejects.toThrow();
  });

  it("requires readable canonical cells rather than a completed job marker", async () => {
    const { client, query } = clientWith([{ initial_full_complete: true }]);
    await loadWorkspaceSyncReadiness(client, { ...dates, workspaceId, requestingUserId, allowedAccounts: [] });
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("account_metrics_daily");
    expect(sql).toContain("generate_series");
    expect(sql).toContain("computed_at IS NOT NULL");
    expect(sql).toContain("batchFailures");
    expect(sql).not.toContain("completed_job");
  });

  it("bounds tuple/job batches, encoded bytes and rejects malformed extra result rows", async () => {
    const { client, query } = clientWith([]);
    const input = { ...dates, workspaceId, requestingUserId, allowedAccounts: [] };
    await expect(loadWorkspaceSyncReadinessBatch(client, [])).resolves.toEqual([]);
    await expect(loadWorkspaceSyncReadinessBatch(client, Array(1001).fill(input))).rejects.toThrow("overflow");
    await expect(loadWorkspaceSyncReadiness(client, { ...input, allowedAccounts: Array(1001).fill({ media: "KUAISHOU", accountId: "a" }) })).rejects.toThrow("overflow");
    const huge = { ...input, allowedAccounts: [{ media: "KUAISHOU", accountId: "a".repeat(16 * 1024 * 1024) }] };
    await expect(loadWorkspaceSyncReadiness(client, huge)).rejects.toThrow("overflow");
    await expect(loadWorkspaceSyncReadinessBatch(client, [huge])).rejects.toThrow("overflow");
    expect(query).not.toHaveBeenCalled();
    await expect(loadWorkspaceSyncReadiness(clientWith([{ initial_full_complete: true }, { initial_full_complete: false }]).client, input)).rejects.toThrow();
    for (const row of [{ ordinal: -1, initial_full_complete: true }, { ordinal: 1, initial_full_complete: true },
      { ordinal: 0.5, initial_full_complete: true }, { ordinal: 0, initial_full_complete: "true" }]) {
      await expect(loadWorkspaceSyncReadinessBatch(clientWith([row]).client, [input])).rejects.toThrow("Invalid readiness batch result");
    }
  });

  it("accepts a leap-day inclusive 31-day window without timezone-derived offsets", async () => {
    const { client, query } = clientWith([{ initial_full_complete: false }]);
    await expect(loadWorkspaceSyncReadiness(client, { workspaceId, requestingUserId, allowedAccounts: [],
      dateFrom: "2024-02-01", dateTo: "2024-03-02" })).resolves.toBe(false);
    expect(query.mock.calls[0]?.[1]?.slice(-2)).toEqual(["2024-02-01", "2024-03-02"]);
  });
});
