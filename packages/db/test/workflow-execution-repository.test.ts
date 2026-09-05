import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WorkflowRepository } from "../src/workflow-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
describe("workflow executor and effects / PG", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new WorkflowRepository(pool);
  let scope: {workspaceId:string;runId:string};
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    const workspaceId = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [randomUUID()])).rows[0].id;
    const runId = (await pool.query("INSERT INTO workflow_runs(workspace_id,version_id,status) VALUES($1,$2,'queued') RETURNING id", [workspaceId,randomUUID()])).rows[0].id;
    scope = { workspaceId, runId };
  });
  it("grants only one concurrent claimant, rotates expired tokens, fences every mutation", async () => {
    const claims = await Promise.all([repository.claimExecutor({...scope,leaseMs:60000}), repository.claimExecutor({...scope,leaseMs:60000})]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = { ...scope, executorToken: claims.find(Boolean)! };
    await pool.query("UPDATE workflow_runs SET executor_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[scope.runId]);
    const token = await repository.claimExecutor({...scope,leaseMs:60000});
    expect(token).not.toBe(old.executorToken);
    await expect(repository.renewExecutor({...old,leaseMs:60000})).rejects.toThrow(/lease/i);
    await expect(repository.appendEvent({...old,dedupeKey:'run_started',event:{kind:'run_started',at:new Date().toISOString()}})).rejects.toThrow(/lease/i);
    await expect(repository.compareAndSetRunStatus({...old,expected:'queued',next:'running'})).rejects.toThrow(/lease/i);
    await expect(repository.reserveEffect({...old,nodeId:'node',attempt:1,phase:'preview',effectKey:'key'})).rejects.toThrow(/lease/i);
    expect(await repository.releaseExecutor(old)).toBe(false);
    expect(await repository.releaseExecutor({...scope,executorToken:token!})).toBe(true);
    expect(await repository.claimExecutor({...scope,workspaceId:randomUUID(),leaseMs:60000})).toBeNull();
  });
  it("persists pending before dispatch and replays terminal result without reinsertion", async () => {
    const executorToken = (await repository.claimExecutor({...scope,leaseMs:60000}))!;
    const effect = {...scope,executorToken,nodeId:'node',attempt:1,phase:'execute' as const,effectKey:'key'};
    expect(await repository.reserveEffect(effect)).toMatchObject({ acquired:true,status:'pending',result:null });
    expect(await repository.reserveEffect(effect)).toMatchObject({ acquired:false,status:'pending',result:null });
    await repository.finishEffect({...effect,status:'done',result:{kind:'succeeded',output:{ok:true}}});
    expect(await repository.reserveEffect(effect)).toMatchObject({acquired:false,status:'done',result:{kind:'succeeded',output:{ok:true}}});
    await expect(repository.reserveEffect({...effect,effectKey:'different'})).rejects.toThrow(/conflict/i);
    await expect(repository.finishEffect({...effect,status:'done',result:{different:true}})).rejects.toThrow(/conflict/i);
    expect((await pool.query("SELECT id FROM workflow_effects WHERE run_id=$1",[scope.runId])).rowCount).toBe(1);
  });
  it("requires an unexpired token even without a successor, and never revives it by renewal", async () => {
    const executorToken = (await repository.claimExecutor({...scope,leaseMs:60000}))!;
    const effect = {...scope,executorToken,nodeId:'node',attempt:1,phase:'execute' as const,effectKey:'key'};
    await repository.reserveEffect(effect);
    await repository.renewExecutor({...scope,executorToken,leaseMs:60000});
    await pool.query("UPDATE workflow_runs SET executor_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[scope.runId]);
    await expect(repository.finishEffect({...effect,status:'done',result:{ok:true}})).rejects.toThrow(/lease/i);
    await expect(repository.renewExecutor({...scope,executorToken,leaseMs:60000})).rejects.toThrow(/lease/i);
    await expect(repository.appendEvent({...scope,executorToken:undefined as unknown as string,dedupeKey:'run_started',event:{kind:'run_started',at:new Date().toISOString()}})).rejects.toThrow(/lease/i);
    expect((await pool.query("SELECT status FROM workflow_effects WHERE run_id=$1",[scope.runId])).rows).toEqual([{status:'pending'}]);
  });
});
