import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { TaskRepository } from "../src/task-repository.js";

describe("task assignment DB conflict translation", () => {
  it.each([
    ["23P01", "task_accounts_account_validity_excl", true],
    ["23P01", "unrelated_constraint", false],
    ["23503", "task_accounts_account_fk", false],
  ])("maps only its own exclusion (%s/%s)", async (code, constraint, mapped) => {
    const failure = Object.assign(new Error("private database details"), { code, constraint });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO task_accounts")) throw failure;
      return { rows: [], rowCount: sql.includes("SELECT 1 FROM task_accounts") ? 0 : 1 };
    });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    const promise = new TaskRepository(pool).assignAccount({ workspaceId: "ws", taskId: "task", media: "KUAISHOU",
      accountId: "account", validFrom: "2026-08-01", validTo: null });
    if (mapped) {
      await expect(promise).rejects.toMatchObject({ code: "TASK_ACCOUNT_OVERLAP", statusCode: 409 });
    } else {
      await expect(promise).rejects.toBe(failure);
    }
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
