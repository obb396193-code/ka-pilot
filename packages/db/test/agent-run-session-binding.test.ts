import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AgentRepository } from "../src/agent-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname))
  throw new Error("Dedicated local ka_*_test database required");

describe("Agent run/session binding real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new AgentRepository(pool), owned: string[] = [];
  let workspaceId: string, userId: string, otherUserId: string, otherWorkspaceId: string, sessionA: string, sessionB: string;
  const start = () => repository.startRunForUserMessage({ workspaceId, userId, sessionId: sessionA, kind: "chat", content: { type: "text", text: "synthetic A" }, startedAt: new Date("2026-09-08T01:00:00Z") });
  const complete = (runId: string, sessionId = sessionA, patch: object = {}) => repository.completeRun({ workspaceId, userId, runId, sessionId,
    assistantContent: { type: "text", text: "synthetic result" }, summary: "synthetic_completed", finishedAt: new Date("2026-09-08T01:00:05Z"), ...patch });
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  beforeEach(async () => {
    workspaceId = randomUUID(); otherWorkspaceId = randomUUID(); userId = randomUUID(); otherUserId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic run A'),($2,'synthetic run B')", [workspaceId, otherWorkspaceId]); owned.push(workspaceId, otherWorkspaceId);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic A'),($3,$2,'synthetic B')", [userId, workspaceId, otherUserId]);
    sessionA = (await repository.createSession({ workspaceId, userId })).id;
    sessionB = (await repository.createSession({ workspaceId, userId })).id;
  });
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM agent_runs WHERE workspace_id=ANY($1::uuid[])", [owned]);
      // FK cascades remove messages/context for only this test's new sessions.
      await pool.query("DELETE FROM agent_sessions WHERE workspace_id=ANY($1::uuid[])", [owned]);
      await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [owned]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [owned]);
    } finally { await pool.end(); }
  });
  it("persists exact session together with user message and run", async () => {
    const { run } = await start();
    expect((await pool.query("SELECT session_id FROM agent_runs WHERE id=$1", [run.id])).rows).toEqual([{ session_id: sessionA }]);
    expect((await repository.listMessages({ workspaceId, userId, sessionId: sessionA })).map(m => m.role)).toEqual(["user"]);
    expect(await repository.listMessages({ workspaceId, userId, sessionId: sessionB })).toEqual([]);
  });
  it("rejects same-user cross-session completion without any message or state change", async () => {
    const { run } = await start();
    await expect(complete(run.id, sessionB)).rejects.toThrow(/not found/);
    expect((await pool.query("SELECT status FROM agent_runs WHERE id=$1", [run.id])).rows).toEqual([{ status: "running" }]);
    expect(await repository.listMessages({ workspaceId, userId, sessionId: sessionB })).toEqual([]);
    expect((await complete(run.id)).status).toBe("success");
  });
  it("does not silently claim a legacy null-session run", async () => {
    const { run } = await start();
    await pool.query("UPDATE agent_runs SET session_id=NULL WHERE id=$1", [run.id]);
    await expect(complete(run.id)).rejects.toThrow(/not found/);
    expect((await repository.listMessages({ workspaceId, userId, sessionId: sessionA })).map(m => m.role)).toEqual(["user"]);
    expect((await pool.query("SELECT session_id,status FROM agent_runs WHERE id=$1", [run.id])).rows).toEqual([{ session_id: null, status: "running" }]);
  });
  it("concurrent completion only persists one assistant message", async () => {
    const { run } = await start(), outcomes = await Promise.allSettled([complete(run.id), complete(run.id)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await repository.listMessages({ workspaceId, userId, sessionId: sessionA })).map(m => m.role)).toEqual(["user", "assistant"]);
  });
  it("same-workspace other user and cross-workspace cannot finish the run", async () => {
    const { run } = await start();
    const otherSession = (await repository.createSession({ workspaceId, userId: otherUserId })).id;
    await expect(complete(run.id, otherSession, { userId: otherUserId })).rejects.toThrow(/not found/);
    await expect(complete(run.id, sessionA, { workspaceId: otherWorkspaceId })).rejects.toThrow(/not found/);
    expect((await pool.query("SELECT status FROM agent_runs WHERE id=$1", [run.id])).rows).toEqual([{ status: "running" }]);
  });
  it("failure remains possible for owned bound and legacy runs, without a session message", async () => {
    for (const legacy of [false, true]) {
      const { run } = await start();
      if (legacy) await pool.query("UPDATE agent_runs SET session_id=NULL WHERE id=$1", [run.id]);
      expect((await repository.failRun({ workspaceId, userId, runId: run.id, summary: "synthetic_failed", finishedAt: new Date("2026-09-08T01:00:06Z") })).status).toBe("failed");
    }
    expect((await repository.listMessages({ workspaceId, userId, sessionId: sessionA })).map(m => m.role)).toEqual(["user", "user"]);
  });
});
