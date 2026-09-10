import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { WorkItemCommandRepository } from "../src/work-item-command-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit synthetic TEST_DATABASE_URL required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(database.pathname)) throw new Error("Dedicated local test database required");

describe("authorized local work-item actions (synthetic PG)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const repo = new WorkItemCommandRepository(pool);
  const workspaces: string[] = [], identities: string[] = [];
  let auth: ApprovedWorkspaceAuthContext, id: string, identityId: string;
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  beforeEach(async () => {
    const workspaceId = randomUUID(), userId = randomUUID(); identityId = randomUUID(); id = randomUUID();
    workspaces.push(workspaceId); identities.push(identityId);
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic-command','personal')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','optimizer')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identityId]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId,userId,identityId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','same')", [workspaceId,identityId]);
    await pool.query("INSERT INTO work_items(id,workspace_id,type,title,media,account_id) VALUES($1,$2,'diagnosis','synthetic','KUAISHOU','same')", [id,workspaceId]);
    auth = { workspaceId,userId,role:"optimizer",workspaceKind:"personal",scope:{kind:"explicit_accounts",accounts:[{media:"KUAISHOU",accountId:"same",accessLevel:"read"}]}};
  });
  afterAll(async () => {
    try {
      for (const table of ["audit_log", "work_items", "account_access_grants", "workspace_memberships", "accounts", "users"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])",[workspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])",[identities]);
    } finally { await pool.end(); }
  });
  const command = () => ({workItemId:id, action:"start_processing"});
  it("shared SQL scope does not materialize denied same-ID media metadata before rejecting", async () => {
    await pool.query("UPDATE work_items SET media='TENCENT' WHERE id=$1", [id]);
    const observed: unknown[] = [];
    const guarded = new WorkItemCommandRepository({ connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(connection, prop) {
        if (prop === "query") return async (sql: string, values?: unknown[]) => {
          const result = await connection.query(sql, values);
          if (sql.includes("FROM work_items")) observed.push(...result.rows);
          return result;
        };
        const value = Reflect.get(connection, prop); return typeof value === "function" ? value.bind(connection) : value;
      } });
    } });
    await expect(guarded.apply(auth, command())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(observed.some(row => (row as { media?: string }).media === "TENCENT")).toBe(false);
  });
  const status = async () => (await pool.query("SELECT status FROM work_items WHERE id=$1",[id])).rows[0].status;
  it("processes then rejects with persisted reason and two atomic audit records", async () => {
    expect(await repo.apply(auth,command())).toMatchObject({workItemId:id,status:"processing"});
    expect(await repo.apply(auth,{workItemId:id,action:"reject",reason:"synthetic reason"})).toMatchObject({status:"rejected"});
    expect((await pool.query("SELECT reject_reason,resolved_at IS NOT NULL AS resolved FROM work_items WHERE id=$1",[id])).rows[0])
      .toEqual({reject_reason:"synthetic reason",resolved:true});
    const logs = await pool.query("SELECT user_id,action,detail FROM audit_log WHERE workspace_id=$1 ORDER BY id",[auth.workspaceId]);
    expect(logs.rows).toHaveLength(2);
    expect(logs.rows[0]).toEqual({user_id:auth.userId,action:"work_item.start_processing",detail:{from:"open",to:"processing"}});
  });
  it("plain ignore does not mute account or create jobs", async () => {
    expect(await repo.apply(auth,{workItemId:id,action:"ignore",reason:"synthetic"})).toMatchObject({status:"ignored"});
    expect((await pool.query("SELECT count(*)::int AS n FROM account_mutes WHERE workspace_id=$1",[auth.workspaceId])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1",[auth.workspaceId])).rows[0].n).toBe(0);
  });
  it.each(["grant", "member", "identity", "user", "workspace"])("rejects stale context after revoking %s",async target => {
    if(target==="grant") await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1",[auth.workspaceId]);
    else if(target==="identity") await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1",[identityId]);
    else if(target==="workspace") await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1",[auth.workspaceId]);
    else await pool.query(`UPDATE ${target==="member"?"workspace_memberships":"users"} SET is_active=false WHERE workspace_id=$1`,[auth.workspaceId]);
    await expect(repo.apply(auth,command())).rejects.toMatchObject({code:"FORBIDDEN"}); expect(await status()).toBe("open");
  });
  it("denies same account ID across media and cross-workspace lookups",async () => {
    await pool.query("UPDATE work_items SET media='TENCENT' WHERE id=$1",[id]);
    await expect(repo.apply(auth,command())).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(repo.apply({...auth,workspaceId:randomUUID()},command())).rejects.toMatchObject({code:"NOT_FOUND"});
    expect(await status()).toBe("open");
  });
  it("does not extrapolate read-only personal no-account visibility to writes",async () => {
    await pool.query("UPDATE work_items SET media=NULL,account_id=NULL,assignee=$2 WHERE id=$1",[id,auth.userId]);
    await expect(repo.apply(auth,command())).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("rejects team, empty scope and browser identity before connecting",async () => {
    const blocked = new WorkItemCommandRepository({connect:()=>{throw new Error("must not connect");}} as never);
    for(const denied of [{...auth,workspaceKind:"team",scope:{kind:"team_workspace_readonly"}}, {...auth,scope:{kind:"explicit_accounts",accounts:[]}}, {...auth,credential:"injected"}])
      await expect(blocked.apply(denied,command())).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(blocked.apply(auth,{...command(),media:"TENCENT"})).rejects.toMatchObject({code:"INVALID_INPUT"});
  });
  it("serializes duplicate processing without duplicate audits",async () => {
    const outcomes=await Promise.allSettled([repo.apply(auth,command()),repo.apply(auth,command())]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(outcomes.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"INVALID_STATE"}});
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE workspace_id=$1",[auth.workspaceId])).rows[0].n).toBe(1);
  });
  it("rolls back the real state update when audit insertion fails and hides database text", async () => {
    const real = await pool.connect();
    const broken = new WorkItemCommandRepository({ connect: async () => new Proxy(real, {
      get(target, key) {
        if (key === "query") return (sql: string, params?: unknown[]) => {
          if (sql.includes("authorized-work-item-audit")) throw new Error("private SQL upstream body");
          return target.query(sql, params);
        };
        if (key === "release") return target.release.bind(target);
        return Reflect.get(target, key);
      },
    }) } as never);
    await expect(broken.apply(auth, command())).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "Work item command source_unavailable" });
    expect(await status()).toBe("open");
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE workspace_id=$1",[auth.workspaceId])).rows[0].n).toBe(0);
  });
});
