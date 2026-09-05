import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CapabilityRegistry } from "@ka/domain";
import { runMigrations } from "@ka/db";
import { DurableWorkflowRunHandler } from "../../src/workflows/run-handler.js";
import { PostgresWorkflowRunStore } from "../../src/workflows/postgres-run-store.js";
import type { ChangesetActionPort, WorkflowOutputStore } from "../../src/workflows/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>((r) => { resolve=r; }); return {promise,resolve}; }
describe("workflow runner fencing / real PG", () => {
  const pool = new Pool({connectionString:databaseUrl});
  const registry = new CapabilityRegistry([{
    id:"change_bid",version:"1.0.0",kind:"action",mode:"execute",description:"synthetic action",
    inputSchema:z.object({bid:z.number()}).strict(),outputSchema:z.object({changed:z.boolean()}).strict(),
    requiredPermissions:["workflow:run"],supportsSimulation:true,timeoutMs:5000,maxAttempts:1,
    idempotencyScope:"object",requiresConfirmation:true,
  }]);
  beforeAll(async () => { await runMigrations({databaseUrl}); });
  afterAll(async () => { await pool.end(); });
  async function setup() {
    const store = new PostgresWorkflowRunStore(pool,registry);
    const workspaceId = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id",[randomUUID()])).rows[0].id;
    const userId = (await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic') RETURNING id",[workspaceId])).rows[0].id;
    const definition = await store.repository.createDefinition({workspaceId,name:"synthetic",ownerUserId:userId,assetType:"personal"});
    const graph = {version:"b7-internal-v1",nodes:[{id:"change",kind:"action",capability:{id:"change_bid",version:"1.0.0"},
      inputs:{bid:{source:"parameter",name:"bid"}},config:{confirmation:"required"}}],edges:[]};
    const paramsSchema = {version:"b7-params-v1",parameters:[{name:"bid",type:"number",required:true}]};
    const draft = await store.repository.createDraftVersion({workspaceId,definitionId:definition.id,graph,paramsSchema});
    await store.repository.publishValidatedDraft({workspaceId,versionId:draft.id,expectedGraph:graph,expectedParamsSchema:paramsSchema});
    const run = await store.repository.createRun({workspaceId,versionId:draft.id,initiatorUserId:userId,credentialOwnerUserId:userId,params:{bid:2}});
    const command = {workspaceId,runId:run.id,userId,credentialOwnerUserId:userId};
    const preview = vi.fn<ChangesetActionPort["preview"]>(async () => ({kind:"ready",changesetId:randomUUID(),previewHash:"a".repeat(64)}));
    const executeConfirmed = vi.fn<ChangesetActionPort["executeConfirmed"]>(async () => ({kind:"succeeded",output:{changed:true}}));
    const outputMap = new Map<string,unknown>();
    const outputs:WorkflowOutputStore = {
      async putOnce(input) { const ref = `synthetic/${input.idempotencyKey}`; if (!outputMap.has(ref)) outputMap.set(ref,input.value); return {ref}; },
      async get(input) { return outputMap.get(input.ref); },
    };
    const handler = () => new DurableWorkflowRunHandler(registry,store,{invoke:async () => { throw new Error("not a read node"); }},
      {preview,executeConfirmed},{authorize:async () => ({allowed:true})},outputs);
    return {store,command,preview,executeConfirmed,handler};
  }
  it("two runners cannot advance or confirm concurrently and execution is not repeated", async () => {
    const s = await setup(); const entered = deferred<void>(); const resume = deferred<void>();
    s.preview.mockImplementationOnce(async () => { entered.resolve(); await resume.promise; return {kind:"ready",changesetId:randomUUID(),previewHash:"a".repeat(64)}; });
    const first = s.handler().advance(s.command);
    await Promise.race([entered.promise,first]);
    try {
      await expect(s.handler().advance(s.command)).rejects.toThrow("busy");
      await expect(s.handler().confirm({...s.command,nodeId:"change",previewHash:"a".repeat(64)})).rejects.toThrow("busy");
    } finally { resume.resolve(); }
    expect((await first).kind).toBe("waiting_confirmation");
    await s.handler().confirm({...s.command,nodeId:"change",previewHash:"a".repeat(64)});
    expect(await s.handler().advance(s.command)).toEqual({kind:"terminal",runStatus:"succeeded"});
    expect(await s.handler().advance(s.command)).toEqual({kind:"terminal",runStatus:"succeeded"});
    expect(s.preview).toHaveBeenCalledTimes(1); expect(s.executeConfirmed).toHaveBeenCalledTimes(1);
    const rows = (await pool.query("SELECT phase,status FROM workflow_effects WHERE run_id=$1 ORDER BY phase",[s.command.runId])).rows;
    expect(rows).toEqual([{phase:"execute",status:"done"},{phase:"preview",status:"done"}]);
    await expect(s.handler().advance({...s.command,workspaceId:randomUUID()})).rejects.toThrow("access denied");
  });
  it.each(["preview","execute"] as const)("recovers stored %s result after event-write crash without replay", async (phase) => {
    const s = await setup(); const original = s.store.appendEvent.bind(s.store); let fail = true;
    const eventKind = phase === "preview" ? "node_waiting_confirmation" : "node_succeeded";
    if (phase === "execute") {
      await s.handler().advance(s.command);
      await s.handler().confirm({...s.command,nodeId:"change",previewHash:"a".repeat(64)});
    }
    vi.spyOn(s.store,"appendEvent").mockImplementation(async (input) => {
      if (input.event.kind === eventKind && fail) { fail=false; throw new Error("synthetic event write crash"); }
      return original(input);
    });
    await expect(s.handler().advance(s.command)).rejects.toThrow("synthetic event write crash");
    expect((await s.handler().advance(s.command)).kind).toBe(phase === "preview" ? "waiting_confirmation" : "terminal");
    expect(s.preview).toHaveBeenCalledTimes(1); expect(s.executeConfirmed).toHaveBeenCalledTimes(phase === "preview" ? 0 : 1);
  });
  it("expired executor cannot finish pending effect; successor marks unknown without another call", async () => {
    const s = await setup(); const entered = deferred<void>(); const resume = deferred<void>();
    s.preview.mockImplementationOnce(async () => { entered.resolve(); await resume.promise; return {kind:"ready",changesetId:randomUUID(),previewHash:"a".repeat(64)}; });
    const first = s.handler().advance(s.command);
    const firstResult = first.then(() => null, (error: unknown) => error);
    await Promise.race([entered.promise,firstResult.then((error) => { if(error) throw error; })]);
    await pool.query("UPDATE workflow_runs SET executor_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[s.command.runId]);
    try { expect(await s.handler().advance(s.command)).toEqual({kind:"terminal",runStatus:"unknown"}); }
    finally { resume.resolve(); }
    expect(await firstResult).toMatchObject({message:expect.stringContaining("lease")});
    expect(s.preview).toHaveBeenCalledTimes(1); expect(s.executeConfirmed).not.toHaveBeenCalled();
    expect((await pool.query("SELECT status FROM workflow_effects WHERE run_id=$1",[s.command.runId])).rows).toEqual([{status:"pending"}]);
  });
  it("ambiguous preview failure persists only sanitized unknown, never retries the external action", async () => {
    const s = await setup();
    s.preview.mockRejectedValue(new Error("synthetic upstream private body"));
    expect(await s.handler().advance(s.command)).toEqual({kind:"terminal",runStatus:"unknown"});
    expect(await s.handler().advance(s.command)).toEqual({kind:"terminal",runStatus:"unknown"});
    expect(s.preview).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT status,result FROM workflow_effects WHERE run_id=$1",[s.command.runId])).rows)
      .toEqual([{status:"unknown",result:{kind:"unknown"}}]);
  });
});
