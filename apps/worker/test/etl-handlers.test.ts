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

function hourlyStore() {
  return { upsertHourly: vi.fn().mockResolvedValue(undefined) };
}

function adRow(hh: number, overrides: Record<string, unknown> = {}) {
  return {
    account_id: "a-9",
    ad_id: "ad-1",
    ds: "20260819",
    ad_cost_h: hh * 10,
    ad_exposure_h: hh * 100,
    ad_click_h: hh * 5,
    ad_conversion_h: hh,
    ad_real_conversion_h: hh,
    ad_bid_h: 30,
    ad_budget_h: 500,
    last_sync_time: "2026-08-19 09:58:00",
    ...overrides,
  };
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
          rows: query.resource === "ad_realtime"
            ? [adRow(Number(query.hh))]
            : [{ account_id: "a-9", ds: "20260819" }],
          envelope: {},
        };
      }),
    };
    const runStore = store();
    const downstream = jobs();
    const hourly = hourlyStore();
    const handler = createIncrementalEtlHandler({
      qihang,
      store: runStore.value,
      jobs: downstream,
      hourly,
    });

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
        hh: 8,
      }),
      expect.objectContaining({
        resource: "ad_realtime",
        ds: "2026-08-19",
        accountIds: ["a-9"],
        adIds: ["ad-1"],
        hh: 9,
      }),
    ]);
    expect(runStore.value.finishRun).toHaveBeenCalledWith(91, 3);
    expect(hourly.upsertHourly).toHaveBeenCalledWith([{
      workspaceId,
      adId: "ad-1",
      accountId: "a-9",
      ds: "2026-08-19",
      hh: 9,
      cost: 10,
      exposure: 100,
      click: 5,
      conversion: 1,
      realConversion: 1,
      bid: 30,
      budget: 500,
    }]);
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

    await createIncrementalEtlHandler({
      qihang,
      store: runStore.value,
      jobs: downstream,
      hourly: hourlyStore(),
    })(
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

    await createIncrementalEtlHandler({
      qihang,
      store: runStore.value,
      jobs: downstream,
      hourly: hourlyStore(),
    })(
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

  it("uses an empty baseline for hh=0 and records a safe derivation summary", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => ({
        rows: query.resource === "ad_realtime" ? [adRow(0, { ad_cost_h: 7 })] : [],
        envelope: {},
        observation: observation(query.resource, query.resource === "ad_realtime" ? 1 : 0),
      })),
    };
    const runStore = store();
    const hourly = hourlyStore();

    await createIncrementalEtlHandler({ qihang, store: runStore.value, jobs: jobs(), hourly })(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-19",
        focusAccountIds: ["a-9"],
        hh: 0,
        offlineReconcileDays: 0,
      }),
    );

    expect(qihang.query.mock.calls.map(([query]) => query)).toEqual([
      expect.objectContaining({ resource: "account_realtime" }),
      expect.objectContaining({ resource: "ad_realtime", hh: 0 }),
    ]);
    expect(hourly.upsertHourly).toHaveBeenCalledWith([
      expect.objectContaining({ hh: 0, cost: 7 }),
    ]);
    expect(runStore.value.recordObservation).toHaveBeenCalledWith(91, expect.objectContaining({
      kind: "hourly_derivation",
      issueCount: 0,
      issueFields: [],
    }));
    const serialized = JSON.stringify(vi.mocked(runStore.value.recordObservation).mock.calls);
    expect(serialized).not.toContain("ad-1");
  });

  it("does not enqueue canonical work when hourly persistence fails", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => ({
        rows: query.resource === "ad_realtime" ? [adRow(Number(query.hh))] : [],
        envelope: {},
      })),
    };
    const runStore = store();
    const downstream = jobs();
    const hourly = { upsertHourly: vi.fn().mockRejectedValue(new Error("hourly unavailable")) };

    await expect(createIncrementalEtlHandler({
      qihang,
      store: runStore.value,
      jobs: downstream,
      hourly,
    })(job("etl_incr", {
      workspaceId,
      userId: "u-qihang",
      ds: "2026-08-19",
      focusAccountIds: ["a-9"],
      hh: 9,
      offlineReconcileDays: 0,
    }))).rejects.toThrow("hourly unavailable");

    expect(runStore.records.filter((record) => record.resource === "ad_realtime")).toHaveLength(2);
    expect(runStore.value.failRun).toHaveBeenCalledWith(91, "hourly_upsert", "hourly unavailable");
    expect(downstream.enqueue).not.toHaveBeenCalled();
  });

  it("skips a missing current ad row and exposes only aggregate issue metadata", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => ({
        rows: query.resource === "ad_realtime" && query.hh === 8 ? [adRow(8)] : [],
        envelope: {},
      })),
    };
    const runStore = store();
    const hourly = hourlyStore();

    await createIncrementalEtlHandler({ qihang, store: runStore.value, jobs: jobs(), hourly })(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-19",
        focusAccountIds: ["a-9"],
        hh: 9,
        offlineReconcileDays: 0,
      }),
    );

    expect(hourly.upsertHourly).toHaveBeenCalledWith([]);
    const summary = vi.mocked(runStore.value.recordObservation).mock.calls
      .map((call) => call[1])
      .find((value) => "kind" in value);
    expect(summary).toEqual(expect.objectContaining({
      kind: "hourly_derivation",
      rowCount: 0,
      issueCount: 1,
      issueFields: [],
      availability: "observed_unverified",
    }));
    expect(JSON.stringify(summary)).not.toContain("ad-1");
  });

  it("keeps a single raw ad query when no hourly snapshot is requested", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => ({
        rows: query.resource === "ad_realtime" ? [adRow(9)] : [],
        envelope: {},
      })),
    };
    const hourly = hourlyStore();

    await createIncrementalEtlHandler({ qihang, store: store().value, jobs: jobs(), hourly })(
      job("etl_incr", {
        workspaceId,
        userId: "u-qihang",
        ds: "2026-08-19",
        focusAccountIds: ["a-9"],
        offlineReconcileDays: 0,
      }),
    );

    const adQueries = qihang.query.mock.calls.map(([query]) => query)
      .filter((query) => query.resource === "ad_realtime");
    expect(adQueries).toEqual([expect.not.objectContaining({ hh: expect.anything() })]);
    expect(hourly.upsertHourly).not.toHaveBeenCalled();
  });

  it("fails hourly derivation when Qihang returns an unexpected date", async () => {
    const qihang = {
      query: vi.fn(async (query: QihangQuery): Promise<QihangQueryResult> => ({
        rows: query.resource === "ad_realtime" ? [adRow(Number(query.hh), { ds: "20260818" })] : [],
        envelope: {},
      })),
    };
    const runStore = store();
    const downstream = jobs();
    const hourly = hourlyStore();

    await expect(createIncrementalEtlHandler({
      qihang,
      store: runStore.value,
      jobs: downstream,
      hourly,
    })(job("etl_incr", {
      workspaceId,
      userId: "u-qihang",
      ds: "2026-08-19",
      focusAccountIds: ["a-9"],
      hh: 9,
      offlineReconcileDays: 0,
    }))).rejects.toThrow("outside the requested ds");

    expect(runStore.value.failRun).toHaveBeenCalledWith(
      91,
      "hourly_derive",
      expect.stringContaining("outside the requested ds"),
    );
    expect(hourly.upsertHourly).not.toHaveBeenCalled();
    expect(downstream.enqueue).not.toHaveBeenCalled();
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
