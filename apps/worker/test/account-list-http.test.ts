import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  AccountListRepositoryContractError,
  type AccountListRepositoryResult,
} from "@ka/db";

import { AccountListService, AccountListSourceError } from "../src/accounts/account-list-service.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService } from "../src/data/query-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";
import { readySource } from "./canonical-query-fixtures.js";
import {
  approvedSessionAuth,
  businessHeaders,
  personalAuth,
} from "./business-auth-fixtures.js";

const internalToken = "fixture-account-list-token-that-is-long-enough";
const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";
const allowedAccounts = [{ media: "KUAISHOU", accountId: "account-1" }];
const auth = personalAuth({ workspaceId, userId, accounts: allowedAccounts });

function authHeaders(token = internalToken): Record<string, string> {
  return businessHeaders(token);
}

function accountResult(): AccountListRepositoryResult {
  return {
    rows: [{
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: "HTTP 账户",
      status: "active",
      lifecycleStage: "stable",
      starred: true,
      tags: ["重点", "测试"],
      owner: null,
      linkedTasks: [],
      metricDate: "2026-08-25",
      cost: 120,
      realConversion: 8,
      assessmentPrice: 38,
      dataAsOf: "2026-08-25T12:00:00.000Z",
      balance: null,
      balanceSyncedAt: null,
      // Synthetic legacy account has no S6 pool/product/action metadata.
      poolStatus: null,
      poolStatusSource: null,
      // v1.5.1 ①（S6）新增的仓储字段
      poolStatus: "in_delivery",
      poolStatusSource: "system",
      productName: null,
      productRef: null,
      lastAction: null,
      nextSuggestion: null,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    coverageComplete: true,
    metricsComplete: true,
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
    repository: { list: async (query) => ({
      rows: [], page: query.page ?? 1, pageSize: query.pageSize ?? 20,
      total: 0, coverageComplete: false, initialFullComplete: false,
    }) },
  });
}

function workItemListService(): WorkItemListService {
  return new WorkItemListService({
    repository: { list: async (query) => ({
      rows: [], page: query.page ?? 1, pageSize: query.pageSize ?? 20,
      total: 0, accountItemCount: 0, dataAsOf: null,
      coverageComplete: true, initialFullComplete: false,
    }) },
  });
}

describe("ACCOUNTS-LIST-001 HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(
    result: AccountListRepositoryResult | Error = accountResult(),
    maxResponseBytes?: number,
  ): Promise<string> {
    const accountListService = new AccountListService({
      repository: { list: async () => {
        if (result instanceof Error) throw result;
        return result;
      } },
      now: () => new Date("2026-08-25T04:00:00.000Z"),
    });
    const server = createDataApiServer({
      service: dataService(),
      detailService: detailService(),
      taskListService: taskListService(),
      accountListService,
      workItemListService: workItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken,
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("serves the read-only account list with one requestId", async () => {
    const baseUrl = await start();
    const response = await fetch(
      `${baseUrl}/api/v1/accounts?page=1&pageSize=20&q=HTTP&media=KUAISHOU&stage=stable&starred=true&tags=重点,测试&status=active`,
      { headers: { ...authHeaders(), "x-request-id": "bff-account-http" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("bff-account-http");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ accountId: "account-1" }] },
      meta: { selectedSource: "qihang", requestId: "bff-account-http" },
    });
  });

  it.each([
    "workspaceId=forged", "accountIds=forged", "dataSource=ka_data", "unknown=x",
    "page=0", "page=1&page=2", "media=TENCENT", "starred=yes", "tags=", "tags=a,a",
  ])("rejects unknown, repeated or invalid query: %s", async (query) => {
    const response = await fetch(`${await start()}/api/v1/accounts?${query}`, { headers: authHeaders() });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("keeps auth fail-closed and all account writes closed", async () => {
    expect((await fetch(`${await start()}/api/v1/accounts`)).status).toBe(401);
    expect((await fetch(`${await start()}/api/v1/accounts`, {
      headers: authHeaders("wrong-account-list-token-that-is-long-enough"),
    })).status).toBe(403);
    const forgedLegacy = await fetch(`${await start()}/api/v1/accounts`, {
      headers: { ...authHeaders(), "x-ka-user-id": "workspace-user" },
    });
    expect(forgedLegacy.status).toBe(200);
    const baseUrl = await start();
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/v1/accounts`, { method, headers: authHeaders() });
      expect(response.status).toBe(405);
    }
  });

  it.each([
    [new AccountListSourceError("UPSTREAM_INVALID_RESPONSE", "bad", false), 502, "UPSTREAM_INVALID_RESPONSE"],
    [new AccountListRepositoryContractError("NaN"), 502, "UPSTREAM_INVALID_RESPONSE"],
    [new AccountListSourceError("SOURCE_UNAVAILABLE", "offline", true), 503, "SOURCE_UNAVAILABLE"],
    [new AccountListSourceError("UPSTREAM_TIMEOUT", "timeout", true), 504, "UPSTREAM_TIMEOUT"],
    [new Error("postgres://secret select raw"), 500, "INTERNAL_ERROR"],
  ] as const)("maps source failures to HTTP %s", async (error, status, code) => {
    const response = await fetch(`${await start(error)}/api/v1/accounts`, {
      headers: { ...authHeaders(), "x-request-id": `account-error-${status}` },
    });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code, requestId: `account-error-${status}` } });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("fails closed when the serialized body is exactly at the configured limit", async () => {
    const service = new AccountListService({
      repository: { list: async () => accountResult() },
      now: () => new Date("2026-08-25T04:00:00.000Z"),
    });
    const expected = await service.execute({}, auth, "account-exact-limit");
    const exactBytes = Buffer.byteLength(JSON.stringify(expected));
    const response = await fetch(`${await start(accountResult(), exactBytes)}/api/v1/accounts`, {
      headers: { ...authHeaders(), "x-request-id": "account-exact-limit" },
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "SOURCE_TRUNCATED" } });
  });
});
