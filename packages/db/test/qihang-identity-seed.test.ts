import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { QihangIdentitySeedRepository } from "../src/qihang-identity-seed-repository.js";
import { runQihangIdentitySeedCommand } from "../src/seed-qihang-identity.js";

describe("Qihang identity explicit binding / real PG", () => {
  const workspaceId = randomUUID(), other = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  let pool: Pool, databaseUrl: string, repository: QihangIdentitySeedRepository;
  const input = () => ({ workspace_id: workspaceId, user_id: userId, qihang_user_id: "synthetic-qihang-one" });
  beforeAll(async () => {
    databaseUrl = process.env.TEST_DATABASE_URL ?? "";
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl }); repository = new QihangIdentitySeedRepository(pool);
    for (const id of [workspaceId, other]) await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic binding')", [id]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic actor')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic binding identity')", [identityId, `bind-${identityId}`]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
  });
  beforeEach(async () => { await pool.query("UPDATE users SET qihang_user_id=NULL WHERE workspace_id=$1 AND id=$2", [workspaceId, userId]); });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["workspace_memberships", "users", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, other]]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("binds exactly the one column, is idempotent, and needs force to replace", async () => {
    const before = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
    expect(await repository.bind(input())).toEqual({ workspaceId, userId, status: "bound" });
    const after = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
    expect(after).toEqual({ ...before, qihang_user_id: input().qihang_user_id });
    expect(await repository.bind(input())).toEqual({ workspaceId, userId, status: "unchanged" });
    const replacement = { ...input(), qihang_user_id: "synthetic-qihang-two" };
    await expect(repository.bind(replacement)).rejects.toMatchObject({ code: "REQUIRES_FORCE" });
    expect(await repository.bind(replacement, true)).toEqual({ workspaceId, userId, status: "replaced" });
    expect((await pool.query("SELECT role FROM workspace_memberships WHERE workspace_id=$1", [workspaceId])).rows).toEqual([{ role: "optimizer" }]);
    expect((await pool.query("SELECT count(*)::int n FROM auth_sessions WHERE active_workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("resolves identity only inside the supplied workspace", async () => {
    expect(await repository.bind({ workspace_id: workspaceId, identity_id: identityId, qihang_user_id: "synthetic-qihang" })).toEqual({ workspaceId, userId, status: "bound" });
    await expect(repository.bind({ ...input(), workspace_id: other })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.bind({ workspace_id: other, identity_id: identityId, qihang_user_id: "synthetic-qihang" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.bind({ ...input(), user_id: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["users", "workspaces", "auth_identities", "workspace_memberships"] as const)("inactive %s cannot bind", async table => {
    const predicate = table === "workspace_memberships" ? "workspace_id=$1" : "id=$1";
    const id = table === "users" ? userId : table === "auth_identities" ? identityId : workspaceId;
    await pool.query(`UPDATE ${table} SET is_active=false WHERE ${predicate}`, [id]);
    try { await expect(repository.bind(input(), true)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await pool.query(`UPDATE ${table} SET is_active=true WHERE ${predicate}`, [id]); }
  });
  it("team cannot acquire an implicit personal credential", async () => {
    await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [workspaceId]);
    try { await expect(repository.bind(input(), true)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await pool.query("UPDATE workspaces SET kind='personal' WHERE id=$1", [workspaceId]); }
  });
  it("concurrent different values never overwrite without explicit force", async () => {
    const outcomes = await Promise.allSettled([repository.bind(input()), repository.bind({ ...input(), qihang_user_id: "synthetic-competing" })]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(value => value.status === "rejected")).toMatchObject([{ reason: { code: "REQUIRES_FORCE" } }]);
    const current = (await pool.query("SELECT qihang_user_id FROM users WHERE id=$1", [userId])).rows[0].qihang_user_id;
    expect([input().qihang_user_id, "synthetic-competing"]).toContain(current);
  });
  it("actual CLI binds, rejects replacement without force, and never prints the private identity", async () => {
    const run = (args: string[]) => new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/seed-qihang-identity.ts", ...args], {
        cwd: new URL("../", import.meta.url), env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl }, stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "", err = "";
      child.stdout.on("data", (chunk: Buffer) => { out += chunk; }); child.stderr.on("data", (chunk: Buffer) => { err += chunk; });
      child.once("error", reject); child.once("close", code => resolve({ code, out, err }));
    });
    const success = await run([JSON.stringify(input())]);
    expect(success.code).toBe(0); expect(JSON.parse(success.out)).toEqual({ workspaceId, userId, status: "bound" });
    expect(success.err).toBe("");
    const failed = await run([JSON.stringify({ ...input(), qihang_user_id: "synthetic-private-replacement" })]);
    expect(failed).toEqual({ code: 1, out: "", err: "Qihang identity seed failed: REQUIRES_FORCE\n" });
    const replaced = await run(["--force", JSON.stringify({ ...input(), qihang_user_id: "synthetic-private-replacement" })]);
    expect(replaced.code).toBe(0); expect(JSON.parse(replaced.out).status).toBe("replaced");
    expect(JSON.stringify([success, failed, replaced])).not.toMatch(/synthetic-qihang|synthetic-private-replacement/);
  }, 20000);
  it("command default composition uses and closes the real pool", async () => {
    let output = "";
    await runQihangIdentitySeedCommand({ args: [JSON.stringify(input())], env: { DATABASE_URL: databaseUrl }, write: value => { output += value; } });
    expect(JSON.parse(output)).toEqual({ workspaceId, userId, status: "bound" });
    expect(output).not.toContain(input().qihang_user_id);
  });
});
