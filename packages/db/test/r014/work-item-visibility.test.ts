import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_READ_STATE } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { MeWorkspaceRepository } from "../../src/r014/me-workspace-repository.js";
import { SearchRepository } from "../../src/r014/search-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * 契约 v1.9.11 工作项可见性三类矩阵（Q-027）。旧 WORK-ITEM-LIST-001「双 null 只凭
 * assignee/creator」与 Q-025 的任务关联口径打架，arch 裁成三类，这里逐类红绿。
 */
describe("v1.9.11 work item visibility matrix (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const me = new MeWorkspaceRepository(pool);
  const search = new SearchRepository(pool);
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let otherUserId = "";
  const TASK = "wim-task";

  const auth = (kind: "personal" | "team", accounts: { media: string; accountId: string }[]): never => ({
    workspaceId, userId, role: "optimizer", workspaceKind: kind,
    scope: kind === "team"
      ? { kind: "team_workspace_readonly" }
      : { kind: "explicit_accounts", accounts: accounts.map((account) => ({ ...account, accessLevel: "read" })) },
  }) as never;

  const titlesFor = async (context: never): Promise<string[]> =>
    (await search.search(context, "WIM")).items.filter((item) => item.type === "work_item")
      .map((item) => item.title).sort();

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`wim-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`wim-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'我','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    otherUserId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'别人','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId]);

    for (const accountId of ["wim-mine", "wim-theirs"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)",
        [workspaceId, accountId]);
    }
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'WIM 任务')",
      [workspaceId, TASK]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU','wim-mine','2026-09-01')",
      [workspaceId, TASK]);

    const rows: [string, string | null, string | null, string | null][] = [
      // 账户型：我授权的 / 没授权的
      ["WIM 账户型-我的", "wim-mine", null, null],
      ["WIM 账户型-别人的", "wim-theirs", null, null],
      // 任务型：任务下有我授权账户 / 派给我 / 与我无关
      ["WIM 任务型-任务授权", null, TASK, otherUserId],
      ["WIM 任务型-派给我", null, "wim-other-task", userId],
      ["WIM 任务型-与我无关", null, "wim-other-task", otherUserId],
      // 纯私人：我的 / 别人的
      ["WIM 私人-我的", null, null, userId],
      ["WIM 私人-别人的", null, null, otherUserId],
    ];
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'wim-other-task','别的任务')",
      [workspaceId]);
    for (const [title, accountId, taskId, assignee] of rows) {
      await pool.query(
        `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id,task_id,assignee)
         VALUES($1,'diagnosis','P1',$2,'open',$3,$4,$5,$6)`,
        [workspaceId, title, accountId === null ? null : "KUAISHOU", accountId, taskId, assignee]);
    }
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','wim-mine','read')",
      [workspaceId, identityId]);
  });

  afterAll(async () => {
    for (const table of ["work_items", "task_accounts", "tasks", "account_access_grants",
      "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("shows an account-type item only when the tuple is in scope", async () => {
    const titles = await titlesFor(auth("personal", [{ media: "KUAISHOU", accountId: "wim-mine" }]));
    expect(titles).toContain("WIM 账户型-我的");
    expect(titles).not.toContain("WIM 账户型-别人的");
  });

  it("shows a task-type item both by task grant and by being assigned to me", async () => {
    const titles = await titlesFor(auth("personal", [{ media: "KUAISHOU", accountId: "wim-mine" }]));
    // 任务下有我授权的账户 → 同任务协作，看得到（哪怕 assignee 是别人）。
    expect(titles).toContain("WIM 任务型-任务授权");
    // 派发本身就是授权动作：派给谁，谁必须看得到，哪怕那个任务我一个户都没有。
    expect(titles).toContain("WIM 任务型-派给我");
    expect(titles).not.toContain("WIM 任务型-与我无关");
  });

  it("shows a purely private item only to its own assignee", async () => {
    const titles = await titlesFor(auth("personal", [{ media: "KUAISHOU", accountId: "wim-mine" }]));
    expect(titles).toContain("WIM 私人-我的");
    // 别人的备忘/提问与授权无关，只归他自己。
    expect(titles).not.toContain("WIM 私人-别人的");
  });

  it("never surfaces a purely private item in a team workspace", async () => {
    const titles = await titlesFor(auth("team", []));
    // 团队空间账户型 + 任务型全量只读；纯私人项不是团队对象，一条都不该出现。
    expect(titles).toContain("WIM 账户型-别人的");
    expect(titles).toContain("WIM 任务型-与我无关");
    expect(titles).not.toContain("WIM 私人-我的");
    expect(titles).not.toContain("WIM 私人-别人的");
  });

  it("counts the same set on the workbench as search returns", async () => {
    const counts = await me.countsParts(auth("personal", [{ media: "KUAISHOU", accountId: "wim-mine" }]), EMPTY_READ_STATE);
    // 账户型 1 + 任务型 2 + 私人 1 = 4；两个入口口径必须一致，否则「计数说有、点进去没有」。
    expect(counts.workItems?.open).toBe(4);
  });
});
