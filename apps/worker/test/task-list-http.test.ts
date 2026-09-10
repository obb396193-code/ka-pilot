import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { TaskListRepositoryResult } from "@ka/db";

import { createDataApiServer } from "../src/data/http-server.js";
import { AccountListService } from "../src/accounts/account-list-service.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import {
  TaskListService,
  TaskListSourceError,
} from "../src/tasks/task-list-service.js";
import { readySource } from "./canonical-query-fixtures.js";
import {
  approvedSessionAuth,
  businessHeaders,
  personalAuth,
} from "./business-auth-fixtures.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";

const internalToken = "fixture-task-list-token-that-is-long-enough";
const workspaceId = "00000000-0000-4000-8000-000000000024";
const allowedAccounts = [{ media: "KUAISHOU", accountId: "account-1" }];
const auth = personalAuth({
  workspaceId,
  userId: "00000000-0000-4000-8000-000000000001",
  accounts: allowedAccounts,
});

function authHeaders(token = internalToken): Record<string, string> {
  return businessHeaders(token);
}

function taskResult(status = "active"): TaskListRepositoryResult {
  return {
    rows: [{
      workspaceId,
      taskId: "task-http-1",
      taskName: "HTTP 任务",
      bizName: "业务甲",
      status,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      targetVolume: 1_000,
      budget: 10_000,
      owner: null,
      assessmentPrice: { value: 38, effectiveDate: "2026-08-01" },
      linkedAccountCount: 1,
      totalLinkedAccountCount: 1,
      completedVolume: 420,
      spent: 4_000,
      recentDailyVolumes: [20, 22, 24],
      workItemSummary: {
        openCount: 0,
        highestSeverity: null,
        counts: { P0: 0, P1: 0, P2: 0, opportunity: 0 },
      },
      latestMetricDate: "2026-08-25",
      dataAsOf: "2026-08-25T12:00:00.000Z",
      // v1.5.1 ②（S6）新增的仓储字段
      stage: "delivering",
      stageSource: "system",
      stageChangedAt: null,
      sopRunId: null,
      readinessFacts: {
        accountCount: 1, rechargedCount: 0, builtCount: 0,
        unfundedAccounts: ["account-1"], unbuiltAccounts: ["account-1"],
      },
      readinessOverrides: [],
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    coverageComplete: true,
    initialFullComplete: true,
  };
}

function dataService(): DataQueryService {
  return new DataQueryService({
    registry: createDataQueryRegistry(),
    kaData: {
      query: async (resolved) => readySource(resolved.queryId, "ka_data", []),
    },
    platform: {
      query: async (resolved) => readySource(resolved.queryId, "canonical", []),
    },
  });
}

function detailService(): ReadDetailService {
  return new ReadDetailService({
    workItems: { findForRead: async () => null },
    changeSets: { find: async () => null },
  });
}

function accountListService(): AccountListService {
  return new AccountListService({
    repository: {
      list: async (query) => ({
        rows: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        coverageComplete: false,
        metricsComplete: true,
        initialFullComplete: false,
      }),
    },
  });
}

function workItemListService(): WorkItemListService {
  return new WorkItemListService({
    repository: {
      list: async (query) => ({
        rows: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        accountItemCount: 0,
        dataAsOf: null,
        coverageComplete: true,
        initialFullComplete: false,
      }),
    },
  });
}

describe("TASK-LIST-001 HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(
    result: TaskListRepositoryResult | Error = taskResult(),
    maxResponseBytes?: number,
  ): Promise<string> {
    const taskListService = new TaskListService({
      repository: {
        list: async () => {
          if (result instanceof Error) throw result;
          return result;
        },
      },
      now: () => new Date("2026-08-25T04:00:00.000Z"),
    });
    const server = createDataApiServer({
      service: dataService(),
      detailService: detailService(),
      taskListService,
      accountListService: accountListService(),
      workItemListService: workItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken,
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  it("serves the read-only task list with qihang metadata and one requestId", async () => {
    const baseUrl = await start();
    const response = await fetch(
      `${baseUrl}/api/v1/tasks?page=1&pageSize=20&q=HTTP&status=active&hasOpenWorkItems=false`,
      { headers: { ...authHeaders(), "x-request-id": "bff-task-http-001" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("bff-task-http-001");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ taskId: "task-http-1" }] },
      meta: {
        selectedSource: "qihang",
        businessDate: "2026-08-25",
        requestId: "bff-task-http-001",
      },
    });
  });

  it.each([
    "workspaceId=forged",
    "userId=forged",
    "accountIds=forged",
    "dataSource=ka_data",
    "unknown=value",
    "page=abc",
    "page=1&page=2",
    "periodFrom=2026-02-31",
    "periodFrom=2026-09-01&periodTo=2026-08-01",
  ])("rejects unknown or invalid browser query: %s", async (query) => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/v1/tasks?${query}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("keeps auth fail-closed and every task write route closed", async () => {
    const baseUrl = await start();
    const unauthenticated = await fetch(`${baseUrl}/api/v1/tasks`);
    expect(unauthenticated.status).toBe(401);

    const forbidden = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: authHeaders("wrong-task-list-token-that-is-long-enough"),
    });
    expect(forbidden.status).toBe(403);

    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method,
        headers: authHeaders(),
      });
      expect(response.status).toBe(405);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    }
  });

  it.each([
    [new TaskListSourceError("UPSTREAM_INVALID_RESPONSE", "bad body", false), 502, "UPSTREAM_INVALID_RESPONSE"],
    [new TaskListSourceError("SOURCE_UNAVAILABLE", "offline", true), 503, "SOURCE_UNAVAILABLE"],
    [new TaskListSourceError("UPSTREAM_TIMEOUT", "timeout", true), 504, "UPSTREAM_TIMEOUT"],
    [new Error("postgres://secret select raw"), 500, "INTERNAL_ERROR"],
  ] as const)("maps a source failure to HTTP %s", async (error, status, code) => {
    const baseUrl = await start(error);
    const response = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: { ...authHeaders(), "x-request-id": `task-error-${status}` },
    });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code, requestId: `task-error-${status}` },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("select");
  });

  it("returns top-level 502 for an invalid task status", async () => {
    const baseUrl = await start(taskResult("paused"));
    const response = await fetch(`${baseUrl}/api/v1/tasks`, { headers: authHeaders() });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_INVALID_RESPONSE" },
    });
  });

  it("applies the shared response byte limit to task lists", async () => {
    const baseUrl = await start(taskResult(), 256);
    const response = await fetch(`${baseUrl}/api/v1/tasks`, { headers: authHeaders() });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRUNCATED" },
    });
  });
});
