import { describe, expect, it, vi } from "vitest";

import { createFullEtlHandler } from "../src/etl/full-handler.js";
import { createIncrementalEtlHandler } from "../src/etl/incr-handler.js";
import type {
  EtlRunStore,
  RawMetricRecord,
} from "../src/etl/types.js";
import type { QihangQuery, QihangQueryResult } from "../src/qihang/client.js";
import type { QihangObservation } from "../src/qihang/observation.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

function job(jobType: "etl_full" | "etl_incr", payload: Record<string, unknown>) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId,
    jobType,
    payload,
    priority: 5,
    credentialOwnerUserId: ownerUserId,
    status: "leased" as const,
    leaseUntil: null,
    leaseToken: "44444444-4444-4444-8444-444444444444",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date("2026-08-19T00:00:00Z"),
  };
}

function store() {
  const records: RawMetricRecord[] = [];
  const value: EtlRunStore = {
    startRun: vi.fn().mockResolvedValue(91),
    appendRaw: vi.fn(async (rows) => {
      records.push(...rows);
    }),
    recordObservation: vi.fn().mockResolvedValue(undefined),
    finishRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
  };
  return { value, records };
}

function observation(
  resource: QihangQuery["resource"],
  rowCount: number,
): QihangObservation {
  return {
    resource,
    rowCount,
    fingerprint: `${resource}-${rowCount}`.padEnd(64, "0"),
    observedAt: "2026-08-20T07:00:00.000Z",
    lastSyncTime: resource.includes("realtime") ? "2026-08-20 14:58:00" : null,
    availability: rowCount === 0
      ? "not_observed"
      : resource === "account_offline" ? "observed_unverified" : "observed",
  };
}

function jobs() {
  return { enqueue: vi.fn(async (input: { id?: string }) => input.id ?? "generated-job") };
}

describe("ETL handlers", () => {
  it("runs account pagination, yesterday offline and a seven-day realtime window", async () => {
    const calls: QihangQuery[] = [];
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        calls.push(query);
        if (query.resource === "account") {
          const pageNum = query.pageNum ?? 1;
          return {
            rows: [{ account_id: pageNum === 1 ? "a-1" : "a-2" }],
            pagination: { totalNum: 2, pageNum, pageSize: 1 },
            envelope: {},
          };
        }
        return {
          rows: [{ account_id: "a-1", ds: "20260818", account_cost: 10 }],
          envelope: {},
        };
      }),
    };
    const runStore = store();
    const downstream = jobs();
    const handler = createFullEtlHandler({ qihang, store: runStore.value, jobs: downstream });

    await handler(
      job("etl_full", {
        workspaceId,
        userId: "u-qihang",
        asOfDate: "2026-08-19",
        pageSize: 1,
        realtimeDays: 7,
      }),
    );

    expect(calls.filter((call) => call.resource === "account")).toHaveLength(2);
    expect(calls).toContainEqual(
      expect.objectContaining({
        resource: "account_offline",
        beginDate: "2026-08-18",
        endDate: "2026-08-18",
        userId: "u-qihang",
      }),
    );
    expect(calls.filter((call) => call.resource === "account_offline")).toHaveLength(1);
    expect(calls.filter((call) => call.resource === "account_realtime")).toHaveLength(7);
    expect(runStore.records.some((row) => row.resource === "account")).toBe(true);
    expect(runStore.records.every((row) => row.workspaceId === workspaceId)).toBe(true);
    expect(runStore.records.every((row) => !("userId" in row.requestParams))).toBe(true);
    expect(runStore.value.startRun).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      "full",
      expect.objectContaining({ workspaceId }),
    );
    expect(runStore.value.finishRun).toHaveBeenCalledWith(91, runStore.records.length);
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "canonical_merge",
      workspaceId,
      credentialOwnerUserId: ownerUserId,
      payload: {
        workspaceId,
        dateFrom: "2026-08-13",
        dateTo: "2026-08-19",
        reportDate: "2026-08-19",
      },
    }));
  });

  it("falls back from an empty D-1 offline partition to the latest produced partition", async () => {
    const calls: QihangQuery[] = [];
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        calls.push(query);
        if (query.resource === "account") {
          return {
            rows: [{ account_id: "a-1" }],
            pagination: { totalNum: 1, pageNum: 1, pageSize: 50 },
            envelope: {},
          };
        }
        if (query.resource === "account_offline") {
          return query.beginDate === "2026-08-18"
            ? { rows: [], envelope: {} }
            : {
                rows: [{ account_id: "a-1", ds: "20260817", cost_api: 10 }],
                envelope: {},
              };
        }
        return { rows: [], envelope: {} };
      }),
    };
    const runStore = store();
    const downstream = jobs();
    const handler = createFullEtlHandler({ qihang, store: runStore.value, jobs: downstream });

    await handler(job("etl_full", {
      workspaceId,
      userId: "u-qihang",
      asOfDate: "2026-08-19",
      realtimeDays: 1,
    }));

    expect(calls.filter((call) => call.resource === "account_offline")).toEqual([
      expect.objectContaining({ beginDate: "2026-08-18", endDate: "2026-08-18" }),
      expect.objectContaining({ beginDate: "2026-08-17", endDate: "2026-08-17" }),
    ]);
    expect(runStore.records).toContainEqual(expect.objectContaining({
      resource: "account_offline",
      ds: "2026-08-17",
      payload: expect.objectContaining({ cost_api: 10 }),
    }));
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "canonical_merge",
      payload: {
        workspaceId,
        dateFrom: "2026-08-17",
        dateTo: "2026-08-19",
        reportDate: "2026-08-19",
      },
    }));
  });

  it("bounds offline partition discovery when the upstream returns no historical rows", async () => {
    const calls: QihangQuery[] = [];
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        calls.push(query);
        return query.resource === "account"
          ? {
              rows: [{ account_id: "a-1" }],
              pagination: { totalNum: 1, pageNum: 1, pageSize: 50 },
              envelope: {},
            }
          : { rows: [], envelope: {} };
      }),
    };
    const downstream = jobs();
    const handler = createFullEtlHandler({ qihang, store: store().value, jobs: downstream });

    await handler(job("etl_full", {
      workspaceId,
      userId: "u-qihang",
      asOfDate: "2026-08-19",
      realtimeDays: 1,
    }));

    expect(calls.filter((call) => call.resource === "account_offline")).toEqual([
      expect.objectContaining({ beginDate: "2026-08-18" }),
      expect.objectContaining({ beginDate: "2026-08-17" }),
      expect.objectContaining({ beginDate: "2026-08-16" }),
    ]);
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ dateFrom: "2026-08-18" }),
    }));
  });

  it("runs current account realtime and focused-account ad realtime", async () => {
    const calls: QihangQuery[] = [];
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        calls.push(query);
        return {
          rows: [{ account_id: "a-9", ad_id: "ad-1", ds: "20260819" }],
          envelope: {},
        };
      }),
    };
    const runStore = store();
    const downstream = jobs();
    const handler = createIncrementalEtlHandler({ qihang, store: runStore.value, jobs: downstream });

    await handler(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-19",
        accountIds: ["a-9"],
        focusAccountIds: ["a-9"],
        adIds: ["ad-1"],
        hh: 9,
        offlineReconcileDays: 0,
      }),
    );

    expect(calls).toEqual([
      expect.objectContaining({
        resource: "account_realtime",
        ds: "2026-08-19",
        accountIds: ["a-9"],
      }),
      expect.objectContaining({
        resource: "ad_realtime",
        ds: "2026-08-19",
        accountIds: ["a-9"],
        adIds: ["ad-1"],
        hh: 9,
      }),
    ]);
    expect(runStore.value.finishRun).toHaveBeenCalledWith(91, 2);
    expect(runStore.value.startRun).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      "incr",
      expect.objectContaining({ workspaceId }),
    );
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "canonical_merge",
      payload: {
        workspaceId,
        dateFrom: "2026-08-19",
        dateTo: "2026-08-19",
        reportDate: "2026-08-19",
      },
    }));
  });

  it("rechecks D-1 offline by default, records an empty observation, and continues realtime", async () => {
    const calls: QihangQuery[] = [];
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        calls.push(query);
        if (query.resource === "account_offline") {
          return { rows: [], envelope: {}, observation: observation(query.resource, 0) };
        }
        return {
          rows: [{ account_id: "a-9", ds: "20260820", account_cost: 12 }],
          envelope: {},
          observation: observation(query.resource, 1),
        };
      }),
    };
    const runStore = store();
    const downstream = jobs();

    await createIncrementalEtlHandler({ qihang, store: runStore.value, jobs: downstream })(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-20",
        accountIds: ["a-9"],
      }),
    );

    expect(calls).toEqual([
      expect.objectContaining({
        resource: "account_offline",
        beginDate: "2026-08-19",
        endDate: "2026-08-19",
      }),
      expect.objectContaining({ resource: "account_realtime", ds: "2026-08-20" }),
    ]);
    expect(runStore.value.recordObservation).toHaveBeenNthCalledWith(1, 91, {
      ...observation("account_offline", 0),
      beginDate: "2026-08-19",
      endDate: "2026-08-19",
    });
    expect(runStore.value.recordObservation).toHaveBeenNthCalledWith(2, 91, {
      ...observation("account_realtime", 1),
      ds: "2026-08-20",
    });
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        workspaceId,
        dateFrom: "2026-08-19",
        dateTo: "2026-08-20",
        reportDate: "2026-08-20",
      },
    }));
  });

  it("persists a newly produced D-1 offline snapshot for canonical revision", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => query.resource === "account_offline"
        ? {
            rows: [{ account_id: "a-9", ds: "20260819", cost_api: 10 }],
            envelope: {},
            observation: observation(query.resource, 1),
          }
        : { rows: [], envelope: {}, observation: observation(query.resource, 0) }),
    };
    const runStore = store();
    const downstream = jobs();

    await createIncrementalEtlHandler({ qihang, store: runStore.value, jobs: downstream })(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-20",
        accountIds: ["a-9"],
      }),
    );

    expect(runStore.records).toContainEqual(expect.objectContaining({
      resource: "account_offline",
      ds: "2026-08-19",
      payload: expect.objectContaining({ cost_api: 10 }),
    }));
    expect(downstream.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ dateFrom: "2026-08-19", dateTo: "2026-08-20" }),
    }));
  });

  it("records the failed ETL step before propagating the error", async () => {
    const qihang = {
      query: vi.fn().mockRejectedValue(new Error("offline unavailable")),
    };
    const runStore = store();
    const downstream = jobs();
    const handler = createFullEtlHandler({ qihang, store: runStore.value, jobs: downstream });
    const failingJob = job("etl_full", {
      workspaceId,
      userId: "u-qihang",
      asOfDate: "2026-08-19",
    });

    await expect(handler(failingJob)).rejects.toThrow("offline unavailable");
    expect(runStore.value.failRun).toHaveBeenCalledWith(
      91,
      "account_page_1",
      "offline unavailable",
    );
    expect(downstream.enqueue).not.toHaveBeenCalled();
  });

  it("fails closed when account pagination metadata disappears on a non-empty page", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => {
        if (query.resource === "account") {
          return {
            rows: [{ account_id: "a-1" }],
            envelope: {},
          };
        }
        return { rows: [], envelope: {} };
      }),
    };
    const runStore = store();
    const downstream = jobs();
    const handler = createFullEtlHandler({ qihang, store: runStore.value, jobs: downstream });

    await expect(handler(job("etl_full", {
      workspaceId,
      userId: "u-qihang",
      asOfDate: "2026-08-19",
    }))).rejects.toThrow("pagination total");
    expect(runStore.value.failRun).toHaveBeenCalledWith(
      91,
      "account_page_1",
      expect.stringContaining("pagination total"),
    );
    expect(downstream.enqueue).not.toHaveBeenCalled();
  });

  it("uses a deterministic downstream id when the source job is retried", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => query.resource === "account"
        ? {
            rows: [{ account_id: "a-1" }],
            pagination: { totalNum: 1, pageNum: 1, pageSize: 50 },
            envelope: {},
          }
        : { rows: [], envelope: {} }),
    };
    const downstream = jobs();
    const payload = {
      workspaceId,
      userId: "u-qihang",
      asOfDate: "2026-08-19",
      realtimeDays: 1,
    };
    await createFullEtlHandler({ qihang, store: store().value, jobs: downstream })(
      job("etl_full", payload),
    );
    await createFullEtlHandler({ qihang, store: store().value, jobs: downstream })(
      job("etl_full", payload),
    );

    expect(downstream.enqueue).toHaveBeenCalledTimes(2);
    expect(downstream.enqueue.mock.calls[0]![0].id).toBe(downstream.enqueue.mock.calls[1]![0].id);
  });
});
