import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { WorkItemRepository } from "../src/work-item-repository.js";
import { workItemScopeClause } from "../src/r014/workspace-authority.js";
import { runMigrations } from "../src/migrate.js";

describe("work item session read authority / synthetic PG", { timeout: 30_000 }, () => {
  const ws = randomUUID(), foreign = randomUUID(), user = randomUUID(), other = randomUUID();
  const auth: ApprovedWorkspaceAuthContext = { workspaceId: ws, userId: user, role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
  const team: ApprovedWorkspaceAuthContext = { workspaceId: ws, userId: user, role: "viewer", workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
  let pool: Pool, repo: WorkItemRepository;
  const ids: Record<string, string> = {}, statements: string[] = [];
  let weaken = false;
  let corrupt: "authorization_id" | "allowed_type" | "proof" | "content_id" | null = null;
  let removeLink = false;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl: url.toString() });
    pool = new Pool({ connectionString: url.toString(), max: 3 });
    for (const workspace of [ws, foreign]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'P194 synthetic')", [workspace]);
      for (const media of ["KUAISHOU", "TENCENT"]) await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [workspace, media]);
    }
    for (const actor of [user, other]) await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic')", [actor, ws]);
    await pool.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES
      ($1,'linked','KUAISHOU','same','2026-09-01'),($1,'denied','TENCENT','same','2026-09-01'),($2,'foreign-link','KUAISHOU','same','2026-09-01')`, [ws, foreign]);
    const rows = [
      ["account", ws, "KUAISHOU", "same", null, other, other],
      ["denied-account", ws, "TENCENT", "same", null, user, user],
      ["task", ws, null, null, "linked", other, other],
      ["denied-task", ws, null, null, "denied", other, other],
      ["unassigned-denied", ws, null, null, "denied", null, null],
      ["unassigned-private", ws, null, null, null, null, null],
      ["foreign-link", ws, null, null, "foreign-link", other, other],
      ["assigned-task", ws, null, null, "denied", user, other],
      ["created-task", ws, null, null, "denied", other, user],
      ["private", ws, null, null, null, user, user],
      ["other-private", ws, null, null, null, other, other],
      ["foreign", foreign, "KUAISHOU", "same", null, null, null],
    ];
    for (const [name, workspace, media, account, task, assignee, creator] of rows) {
      const id = randomUUID(); ids[name!] = id;
      await pool.query(`INSERT INTO work_items(id,workspace_id,type,media,account_id,task_id,assignee,creator,title,status,evidence_snapshot,diagnosis)
        VALUES($1,$2,'self',$3,$4,$5,$6,$7,'synthetic private evidence','open','{"proof":1}','{"diagnosis":1}')`,
      [id, workspace, media, account, task, assignee, creator]);
    }
    const monitored = { query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(target, key) {
        if (key === "query") return async (sql: string, values: unknown[]) => {
          statements.push(sql);
          const clause = workItemScopeClause("$3", "$4", "work_items", "$5");
          if (weaken) sql = sql.replaceAll(clause, "($3::text IS NOT NULL AND $4::jsonb IS NOT NULL AND $5::uuid IS NOT NULL)");
          const result = await target.query(sql, values);
          if (sql.includes("work-item-detail-authorization") && result.rows[0]) {
            if (corrupt === "authorization_id") result.rows[0].workspace_id = foreign;
            if (corrupt === "allowed_type") result.rows[0].allowed = "true";
            if (corrupt === "proof") result.rows[0].task_scope_account = { media: "KUAISHOU", accountId: null };
            if (removeLink) {
              removeLink = false;
              await pool.query("DELETE FROM task_accounts WHERE workspace_id=$1 AND task_id='linked'", [ws]);
            }
          }
          if (sql.includes("work-item-detail-content") && corrupt === "content_id" && result.rows[0]) result.rows[0].id = ids.foreign;
          return result;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
    } } as unknown as Pool;
    repo = new WorkItemRepository(monitored);
  });
  afterAll(async () => {
    if (!pool) return;
    try { for (const table of ["work_items", "task_accounts", "accounts", "users", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, foreign]]);
    } } finally { await pool.end(); }
  });
  const read = (name: string, context: unknown = auth) => repo.findForRead(ws, ids[name]!, context);
  const noBody = () => expect(statements.some(sql => /\b(evidence_snapshot|diagnosis)\b/.test(sql))).toBe(false);
  it.each(["account", "task", "assigned-task", "created-task", "private"])("personal permits %s", async name => {
    statements.length = 0;
    const result = await read(name);
    expect(result).toMatchObject({ record: { id: ids[name], workspaceId: ws, evidenceSnapshot: { proof: 1 } } });
    expect(result?.taskScopeAccount).toEqual(name === "task" ? { media: "KUAISHOU", accountId: "same" } : null);
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.filter(sql => sql.includes(workItemScopeClause("$3", "$4", "work_items", "$5")))).toHaveLength(2);
    expect(statements.at(-1)).toBe("COMMIT");
  });
  it.each(["denied-account", "denied-task", "foreign-link", "other-private", "unassigned-denied", "unassigned-private"])("personal denies %s before body read", async name => {
    statements.length = 0;
    await expect(read(name)).rejects.toThrow("outside"); noBody();
  });
  it("empty grants keep only self task/private paths", async () => {
    const empty = { ...auth, scope: { kind: "explicit_accounts", accounts: [] } };
    for (const name of ["assigned-task", "created-task", "private"]) expect(await read(name, empty)).not.toBeNull();
    for (const name of ["account", "task"]) await expect(read(name, empty)).rejects.toThrow("outside");
  });
  it("team sees account/task, but never any private row", async () => {
    for (const name of ["account", "denied-account", "task", "denied-task", "foreign-link"]) expect(await read(name, team)).toMatchObject({ record: { id: ids[name] }, taskScopeAccount: null });
    for (const name of ["private", "other-private"]) { statements.length = 0; await expect(read(name, team)).rejects.toThrow("outside"); noBody(); }
  });
  it("foreign row and nonexistent identity remain404 without loading body", async () => {
    for (const id of [ids.foreign!, randomUUID()]) { statements.length = 0; expect(await repo.findForRead(ws, id, auth)).toBeNull(); noBody(); }
  });
  it("invalid auth/workspace/id rejects before any DB connection", async () => {
    const connect = vi.fn(), isolated = new WorkItemRepository({ connect } as unknown as Pool);
    for (const context of [undefined, null, { ...auth, workspaceId: foreign }]) await expect(isolated.findForRead(ws, ids.account!, context)).rejects.toThrow();
    await expect(isolated.findForRead(ws, "not-uuid", auth)).rejects.toThrow(); expect(connect).not.toHaveBeenCalled();
  });
  it("removing shared predicate is a real negative control; internal job find remains separate", async () => {
    weaken = true;
    try {
      expect(await read("denied-account")).toMatchObject({ record: { media: "TENCENT" } });
      expect(await read("private", team)).toMatchObject({ record: { id: ids.private } });
    }
    finally { weaken = false; }
    expect(await repo.find(ws, ids["denied-account"]!)).toMatchObject({ media: "TENCENT" });
  });
  it.each(["authorization_id", "allowed_type", "proof", "content_id"] as const)("rejects corrupted %s", async mode => {
    statements.length = 0; corrupt = mode;
    try {
      await expect(read("task")).rejects.toThrow("Invalid work item");
      if (mode !== "content_id") noBody();
      expect(statements.at(-1)).toBe("ROLLBACK");
    } finally { corrupt = null; }
  });
  it("holds preflight/proof/body in one snapshot while another transaction removes the link", async () => {
    removeLink = true;
    try {
      expect(await read("task")).toMatchObject({ record: { id: ids.task }, taskScopeAccount: { media: "KUAISHOU", accountId: "same" } });
      await expect(read("task")).rejects.toThrow("outside");
    } finally {
      removeLink = false;
      await pool.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
        VALUES($1,'linked','KUAISHOU','same','2026-09-01') ON CONFLICT DO NOTHING`, [ws]);
    }
  });
});
