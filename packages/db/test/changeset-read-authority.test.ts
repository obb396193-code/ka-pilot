import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { ChangeSetRepository, ChangeSetAuthorizationError } from "../src/changeset-repository.js";
import { accountScopeClause } from "../src/r014/workspace-authority.js";

describe("changeset session read authority / synthetic PG", { timeout: 30_000 }, () => {
  const workspaceId = randomUUID(), foreign = randomUUID(), userId = randomUUID(), foreignUser = randomUUID();
  const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
  let pool: Pool, repository: ChangeSetRepository;
  let ownId: string, deniedId: string, foreignId: string;
  const statements: string[] = [];
  let weaken = false, removed = 0;
  let corrupt: "authorization_identity" | "authorization_type" | "content_identity" | null = null;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    pool = new Pool({ connectionString: url.toString(), max: 3 });
    repository = new ChangeSetRepository(pool);
    for (const [ws, actor] of [[workspaceId, userId], [foreign, foreignUser]]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic P183')", [ws]);
      await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic P183')", [actor, ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
    }
    const create = async (ws: string, actor: string, media: string) => repository.create({ workspaceId: ws, initiator: actor,
      credentialOwnerUserId: actor, media, accountId: "same", title: "synthetic private detail", reasonCode: "synthetic",
      ttlExpireAt: new Date("2026-10-01T00:00:00Z"), simulation: { privateEvidence: "synthetic only" },
      items: [{ targetType: "unit", targetId: "synthetic-unit", field: "bid", fromValue: { type: "number", value: 2 }, toValue: { type: "number", value: 1 } }] });
    ownId = (await create(workspaceId, userId, "KUAISHOU")).id;
    deniedId = (await create(workspaceId, userId, "TENCENT")).id;
    foreignId = (await create(foreign, foreignUser, "KUAISHOU")).id;
    const monitored = { connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(target, key) {
        if (key === "query") return async (sql: string, values: unknown[]) => {
          statements.push(sql);
          const clause = accountScopeClause("$3", "$4", "changesets.media", "changesets.account_id");
          if (weaken && sql.includes(clause)) { removed++; sql = sql.replaceAll(clause, "($3::text IS NOT NULL AND $4::jsonb IS NOT NULL)"); }
          const result = await target.query(sql, values);
          if (sql.includes("changeset-detail-authorization") && result.rows[0]) {
            if (corrupt === "authorization_identity") result.rows[0].workspace_id = foreign;
            if (corrupt === "authorization_type") result.rows[0].allowed = "true";
          }
          if (corrupt === "content_identity" && sql.includes("changeset-detail-content") && result.rows[0]) result.rows[0].id = foreignId;
          return result;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
    }, query: pool.query.bind(pool) } as unknown as Pool;
    repository = new ChangeSetRepository(monitored);
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      for (const table of ["changeset_items", "changesets", "accounts", "users", "workspaces"]) await pool.query(
        `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreign]]);
    } finally { await pool.end(); }
  });
  const containsBodyRead = () => statements.some(sql => /\b(simulation|changeset_items)\b/.test(sql));
  it("reads approved tuple in RR/RO using the shared clause, not just service filtering", async () => {
    statements.length = 0;
    expect(await repository.find(workspaceId, ownId, auth)).toMatchObject({ id: ownId, media: "KUAISHOU", items: [{ targetId: "synthetic-unit" }] });
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.join("\n")).toContain(accountScopeClause("$3", "$4", "changesets.media", "changesets.account_id"));
    expect(statements.at(-1)).toBe("COMMIT");
  });
  it("denied same-ID media and empty grants never load private header or items", async () => {
    for (const [id, context] of [[deniedId, auth], [ownId, { ...auth, scope: { kind: "explicit_accounts", accounts: [] } }]] as const) {
      statements.length = 0;
      await expect(repository.find(workspaceId, id, context)).rejects.toBeInstanceOf(ChangeSetAuthorizationError);
      expect(containsBodyRead()).toBe(false);
      expect(statements.at(-1)).toBe("ROLLBACK");
    }
  });
  it("foreign workspace and missing ID remain not found without reading content", async () => {
    for (const id of [foreignId, randomUUID()]) {
      statements.length = 0;
      expect(await repository.find(workspaceId, id, auth)).toBeNull();
      expect(containsBodyRead()).toBe(false);
    }
  });
  it("invalid/team/mismatched session context rejects before connection acquisition", async () => {
    const connect = vi.fn();
    const repo = new ChangeSetRepository({ connect } as unknown as Pool);
    for (const context of [undefined, null, { ...auth, workspaceId: foreign }, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }]) {
      await expect(repo.find(workspaceId, ownId, context)).rejects.toBeInstanceOf(ChangeSetAuthorizationError);
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it("removing the shared predicate admits the denied media as a real PG negative control", async () => {
    weaken = true; removed = 0;
    try { expect(await repository.find(workspaceId, deniedId, auth)).toMatchObject({ id: deniedId, media: "TENCENT" }); }
    finally { weaken = false; }
    expect(removed).toBe(2);
  });
  it("two-argument internal lookup remains separate from the mandatory session port", async () => {
    expect(await repository.find(workspaceId, deniedId)).toMatchObject({ id: deniedId });
  });
  it.each(["authorization_identity", "authorization_type", "content_identity"] as const)("rejects malformed %s before item loading", async mode => {
    corrupt = mode; statements.length = 0;
    try { await expect(repository.find(workspaceId, ownId, auth)).rejects.toThrow("Invalid changeset detail"); }
    finally { corrupt = null; }
    expect(statements.some(sql => sql.includes("FROM changeset_items"))).toBe(false);
    expect(statements.at(-1)).toBe("ROLLBACK");
  });
});
