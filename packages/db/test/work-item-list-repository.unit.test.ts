import { describe, expect, it, vi } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";

import {
  WorkItemListRepository,
  WorkItemListRepositoryContractError,
  type WorkItemListRepositoryClient,
} from "../src/work-item-list-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

describe("WorkItemListRepository unit boundary", () => {
  it("keeps count/readiness/page in one RR/RO transaction and maps real lineage", async () => {
    const calls: string[] = [];
    const client: WorkItemListRepositoryClient = {
      query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
        calls.push(sql);
        if (sql.includes("work-item-list-total")) return result([{
          total: "1", account_item_count: "1", data_as_of: new Date("2026-08-25T12:00:00Z"), coverage_complete: true,
        }] as unknown as Row[]);
        if (sql.includes("workspace-sync-initial-full-readiness")) {
          return result([{ initial_full_complete: true }] as unknown as Row[]);
        }
        if (sql.includes("LIMIT $10")) return result([{
          id: "00000000-0000-4000-8000-000000000201", workspace_id: workspaceId,
          type: "diagnosis", status: "open", severity: "P1", title: "异常",
          media: "KUAISHOU", account_id: "account-1", account_name: null,
          task_id: null, task_name: null, assignee: null, assignee_display_name: null,
          creator: userId, sla_due: null, created_at: new Date("2026-08-25T12:00:00Z"), resolved_at: null,
        }] as unknown as Row[]);
        return result([] as Row[]);
      },
      release: vi.fn(),
    };
    const repository = new WorkItemListRepository({ connect: async () => client });
    const output = await repository.list({
      workspaceId, requestingUserId: userId, businessDate: "2026-08-25",
      allowedAccounts: [{ media: "KUAISHOU", accountId: "account-1" }],
      page: 1, pageSize: 20,
    });
    expect(calls).toHaveLength(5);
    expect(calls[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls[4]).toBe("COMMIT");
    expect(output).toMatchObject({
      total: 1, accountItemCount: 1, initialFullComplete: true,
      dataAsOf: "2026-08-25T12:00:00.000Z",
      rows: [{ workItemId: "00000000-0000-4000-8000-000000000201" }],
    });
  });

  it("validates duplicate scope before connect", async () => {
    const connect = vi.fn();
    const repository = new WorkItemListRepository({ connect } as never);
    await expect(repository.list({
      workspaceId, requestingUserId: userId, businessDate: "2026-08-25",
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "same" },
        { media: "KUAISHOU", accountId: "same" },
      ],
    })).rejects.toThrow("duplicate");
    expect(connect).not.toHaveBeenCalled();
  });

  it("classifies a present-invalid count as a repository contract error", async () => {
    const client: WorkItemListRepositoryClient = {
      query: async <Row extends QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
        if (sql.includes("work-item-list-total")) return result([{
          total: "NaN", account_item_count: "0", data_as_of: null, coverage_complete: true,
        }] as unknown as Row[]);
        if (sql.includes("workspace-sync-initial-full-readiness")) {
          return result([{ initial_full_complete: false }] as unknown as Row[]);
        }
        return result([] as Row[]);
      },
      release: vi.fn(),
    };
    const repository = new WorkItemListRepository({ connect: async () => client });
    await expect(repository.list({
      workspaceId, requestingUserId: userId, businessDate: "2026-08-25",
      allowedAccounts: [], page: 1, pageSize: 20,
    })).rejects.toBeInstanceOf(WorkItemListRepositoryContractError);
  });
});
