import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { WorkItemListRepositoryResult } from "@ka/db";

import { createDataApiServer } from "../src/data/http-server.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService } from "../src/data/query-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import {
  WorkItemListService,
  WorkItemListSourceError,
} from "../src/work-items/work-item-list-service.js";
import { readySource } from "./canonical-query-fixtures.js";

const internalToken = "fixture-work-item-list-token-that-is-long-enough";
const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";
const allowedAccounts = [{ media: "KUAISHOU", accountId: "account-1" }];

function authHeaders(token = internalToken): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "x-ka-workspace-id": workspaceId,
    "x-ka-user-id": userId,
    "x-ka-account-scope": Buffer.from(JSON.stringify(allowedAccounts)).toString("base64url"),
  };
}

function workItemResult(status = "open"): WorkItemListRepositoryResult {
  return {
    rows: [{
      workItemId: "00000000-0000-4000-8000-000000000201",
      workspaceId,
      type: "diagnosis",
      status,
      severity: "P1",
      title: "HTTP 成本异常",
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: null,
      taskId: null,
      taskName: null,
      assigneeUserId: null,
      assigneeDisplayName: null,
      creatorUserId: userId,
      slaDue: null,
      createdAt: "2026-08-25T12:00:00.000Z",
      resolvedAt: null,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    accountItemCount: 1,
    dataAsOf: "2026-08-25T12:00:00.000Z",
    coverageComplete: true,
    initialFullComplete: true,
  };
}

function dataService(): DataQueryService {
  return new DataQueryService({
    registry: createDataQueryRegistry(),
    kaData: { query: async (resolved) => readySource(resolved.queryId, "ka_data", []) },
    platform: { query: async (resolved) => readySource(resolved.queryId, "canonical", []) },
  });
}

function detailService(): ReadDetailService {
  return new ReadDetailService({
    workItems: { find: async () => null },
    changeSets: { find: async () => null },
  });
}

function taskListService(): TaskListService {
  return new TaskListService({
    repository: {
      list: async (query) => ({
        rows: [], page: query.page ?? 1, pageSize: query.pageSize ?? 20,
        total: 0, coverageComplete: true, initialFullComplete: true,
      }),
    },
  });
}

describe("WORK-ITEM-LIST-001 HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(
    result: WorkItemListRepositoryResult | Error = workItemResult(),
    maxResponseBytes?: number,
  ): Promise<string> {
    const workItemListService = new WorkItemListService({
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
      taskListService: taskListService(),
      workItemListService,
      internalToken,
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("serves the read-only work item list with one requestId", async () => {
    const response = await fetch(
      `${await start()}/api/v1/work-items?page=1&pageSize=20&q=HTTP&status=open&severity=P1&type=diagnosis&taskId=task-1`,
      { headers: { ...authHeaders(), "x-request-id": "bff-work-http" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("bff-work-http");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ workItemId: "00000000-0000-4000-8000-000000000201" }] },
      meta: { selectedSource: "platform", requestId: "bff-work-http" },
    });
  });

  it.each([
    "workspaceId=forged", "accountIds=forged", "dataSource=qihang", "unknown=x",
    "page=0", "page=1&page=2", "status=active", "severity=P3", "type=unknown",
    "assigneeUserId=not-a-uuid", "taskId=",
  ])("rejects unknown, repeated or invalid query: %s", async (query) => {
    const response = await fetch(`${await start()}/api/v1/work-items?${query}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("keeps auth fail-closed and every work-item write closed", async () => {
    expect((await fetch(`${await start()}/api/v1/work-items`)).status).toBe(401);
    expect((await fetch(`${await start()}/api/v1/work-items`, {
      headers: authHeaders("wrong-work-item-token-that-is-long-enough"),
    })).status).toBe(403);
    expect((await fetch(`${await start()}/api/v1/work-items`, {
      headers: { ...authHeaders(), "x-ka-user-id": "workspace-user" },
    })).status).toBe(403);
    const baseUrl = await start();
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/v1/work-items`, { method, headers: authHeaders() });
      expect(response.status).toBe(405);
    }
  });

  it("does not shadow the existing work-item detail route", async () => {
    const response = await fetch(
      `${await start()}/api/v1/work-items/00000000-0000-4000-8000-000000000201`,
      { headers: authHeaders() },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it.each([
    [new WorkItemListSourceError("UPSTREAM_INVALID_RESPONSE", "bad", false), 502, "UPSTREAM_INVALID_RESPONSE"],
    [new WorkItemListSourceError("SOURCE_UNAVAILABLE", "offline", true), 503, "SOURCE_UNAVAILABLE"],
    [new WorkItemListSourceError("UPSTREAM_TIMEOUT", "timeout", true), 504, "UPSTREAM_TIMEOUT"],
    [new Error("postgres://secret select raw"), 500, "INTERNAL_ERROR"],
  ] as const)("maps source failures to stable HTTP errors", async (error, status, code) => {
    const response = await fetch(`${await start(error)}/api/v1/work-items`, {
      headers: { ...authHeaders(), "x-request-id": `work-error-${status}` },
    });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code, requestId: `work-error-${status}` } });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns top-level 502 for invalid rows and exact response byte limit", async () => {
    const invalid = await fetch(`${await start(workItemResult("invented"))}/api/v1/work-items`, {
      headers: authHeaders(),
    });
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toMatchObject({ ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE" } });

    const service = new WorkItemListService({
      repository: { list: async () => workItemResult() },
      now: () => new Date("2026-08-25T04:00:00.000Z"),
    });
    const expected = await service.execute({}, { workspaceId, userId, allowedAccounts }, "work-exact-limit");
    const exactBytes = Buffer.byteLength(JSON.stringify(expected));
    const limited = await fetch(`${await start(workItemResult(), exactBytes)}/api/v1/work-items`, {
      headers: { ...authHeaders(), "x-request-id": "work-exact-limit" },
    });
    expect(limited.status).toBe(502);
    expect(await limited.json()).toMatchObject({ ok: false, error: { code: "SOURCE_TRUNCATED" } });
  });
});
