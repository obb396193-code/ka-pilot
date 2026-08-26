import { describe, expect, it, vi } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";

import {
  AccountListRepository,
  type AccountListRepositoryClient,
  type AccountListRepositoryPool,
} from "../src/account-list-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";

function result<Row extends QueryResultRow>(rows: Row[]) {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

function queryInput() {
  return {
    workspaceId,
    requestingUserId: userId,
    businessDate: "2026-08-25",
    allowedAccounts: [
      { media: "KUAISHOU", accountId: "account-1" },
      { media: "TENCENT", accountId: "account-1" },
    ],
    page: 1,
    pageSize: 20,
  };
}

describe("AccountListRepository unit boundary", () => {
  it("uses one RR/RO transaction, media-specific scope and strict row mapping", async () => {
    const calls: { sql: string; values?: unknown[] }[] = [];
    const client: AccountListRepositoryClient = {
      query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
        calls.push(values === undefined ? { sql } : { sql, values });
        if (sql.includes("account-list-total")) {
          return result([{ total: "1", coverage_complete: true, metrics_complete: true }] as unknown as Row[]) as QueryResult<Row>;
        }
        if (sql.includes("workspace-sync-initial-full-readiness")) {
          return result([{ initial_full_complete: true }] as unknown as Row[]) as QueryResult<Row>;
        }
        if (sql.includes("LIMIT $11")) {
          return result([{
            workspace_id: workspaceId,
            media: "KUAISHOU",
            account_id: "account-1",
            account_name: null,
            status: "active",
            lifecycle_stage: "stable",
            is_starred: false,
            tags: ["重点"],
            owner_user_id: null,
            owner_display_name: null,
            linked_tasks: [{ taskId: "task-1", taskName: null }],
            metric_date: "2026-08-25",
            cost: "10.5",
            real_conversion: "2",
            assessment_price_snapshot: null,
            data_as_of: new Date("2026-08-25T12:00:00Z"),
            balance: null,
            balance_synced_at: null,
          }] as unknown as Row[]) as QueryResult<Row>;
        }
        return result([] as Row[]) as QueryResult<Row>;
      },
      release: vi.fn(),
    };
    const repository = new AccountListRepository({ connect: async () => client });
    const output = await repository.list(queryInput());

    expect(calls.map((call) => call.sql.trim().split("\n")[0]!.trimEnd())).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "WITH",
      "/* workspace-sync-initial-full-readiness */",
      "WITH",
      "COMMIT",
    ]);
    const scope = JSON.parse(calls[1]!.values?.[2] as string) as unknown[];
    expect(scope).toEqual([{ media: "KUAISHOU", account_id: "account-1" }]);
    expect(output).toMatchObject({
      total: 1,
      initialFullComplete: true,
      rows: [{ accountId: "account-1", cost: 10.5, realConversion: 2 }],
    });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back malformed source rows and validates scope before connect", async () => {
    const sqlCalls: string[] = [];
    const client: AccountListRepositoryClient = {
      query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
        sqlCalls.push(sql);
        if (sql.includes("account-list-total")) {
          return result([{ total: 1, coverage_complete: true, metrics_complete: true }] as unknown as Row[]) as QueryResult<Row>;
        }
        if (sql.includes("workspace-sync-initial-full-readiness")) {
          return result([{ initial_full_complete: true }] as unknown as Row[]) as QueryResult<Row>;
        }
        if (sql.includes("LIMIT $11")) {
          return result([{ tags: [], linked_tasks: "not-an-array" }] as unknown as Row[]) as QueryResult<Row>;
        }
        return result([] as Row[]) as QueryResult<Row>;
      },
      release: vi.fn(),
    };
    const connect = vi.fn(async () => client);
    const repository = new AccountListRepository({ connect } as AccountListRepositoryPool);
    await expect(repository.list(queryInput())).rejects.toThrow("linkedTasks");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();

    const unopened = vi.fn(async () => client);
    const validatingRepository = new AccountListRepository({ connect: unopened });
    await expect(validatingRepository.list({
      ...queryInput(),
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "same" },
        { media: "KUAISHOU", accountId: "same" },
      ],
    })).rejects.toThrow("duplicate");
    expect(unopened).not.toHaveBeenCalled();
  });
});
