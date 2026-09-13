import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboundDeliveryRepository, runMigrations } from "@ka/db";
import { runOutboundOnce } from "../src/notifications/outbound-once.js";
import { workerOnceLock } from "../src/scheduling/worker-once-lock.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const target = new URL(databaseUrl);
if (!["localhost","127.0.0.1"].includes(target.hostname) || target.port!=="55432" || !/^\/ka_[a-z0-9_]+_test$/.test(target.pathname)) throw new Error("Isolated local test database required");
describe("P198 actual store + once lock / synthetic PG, no external sends", () => {
  const pool = new Pool({connectionString:databaseUrl,max:5}), ws=randomUUID(), other=randomUUID(), job=randomUUID();
  const store=new OutboundDeliveryRepository(pool), options={workspaceId:ws,configured:true,batchSize:20};
  const cleanup=async()=>{await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])",[[ws,other]]);};
  beforeAll(async()=>{await runMigrations({databaseUrl});}); beforeEach(cleanup);
  afterAll(async()=>{await cleanup();await pool.end();});
  const enqueue=async(workspace=ws,channel="dingtalk", jobId=job)=>{
    await pool.query("INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload) VALUES($1,$2,$3,'job_failed',$4)",[workspace,channel,`workspace:${workspace}:admins`,{jobId}]);
  };
  const ports=(send:()=>Promise<unknown>)=>({store,lock:workerOnceLock(pool,ws),now:()=>new Date().toISOString(),transport:{send}});
  it("persists one acknowledgement, deduplicates the second row, never touches inbox or another space",async()=>{
    await enqueue();await enqueue();await enqueue(other);await enqueue(ws,"inbox");
    const send=vi.fn(async()=>({kind:"acknowledged"}));
    expect(await runOutboundOnce(options,ports(send))).toEqual({status:"drained",claimed:2,sent:1,failed:0,retried:0,deduplicated:1});
    expect(send).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT status,sent_at,dedupe_of FROM outbound_messages WHERE workspace_id=$1 AND channel='dingtalk' ORDER BY created_at,id",[ws])).rows)
      .toEqual([expect.objectContaining({status:"sent",sent_at:expect.any(Date),dedupe_of:null}),expect.objectContaining({status:"deduplicated",sent_at:null,dedupe_of:expect.any(String)})]);
    expect((await pool.query("SELECT workspace_id,channel,status,attempts FROM outbound_messages WHERE workspace_id=$1 OR (workspace_id=$2 AND channel='inbox') ORDER BY channel",[other,ws])).rows)
      .toEqual([{workspace_id:other,channel:"dingtalk",status:"queued",attempts:0},{workspace_id:ws,channel:"inbox",status:"queued",attempts:0}]);
  });
  it("two concurrent passes share the actual advisory lock",async()=>{
    await enqueue();let signalStart!:()=>void,finish!:()=>void;
    const started=new Promise<void>(resolve=>{signalStart=resolve;}),complete=new Promise<void>(resolve=>{finish=resolve;});
    const first=runOutboundOnce(options,ports(async()=>{signalStart();await complete;return {kind:"acknowledged"};}));
    const secondSend=vi.fn(async()=>({kind:"acknowledged"}));
    try {
      await Promise.race([started,first.then(()=>{throw new Error("First pass exited before transport");})]);
      expect(await runOutboundOnce(options,ports(secondSend))).toMatchObject({status:"locked",claimed:0});
    }
    finally {finish();}
    expect(await first).toMatchObject({sent:1});expect(secondSend).not.toHaveBeenCalled();
  });
  it("ambiguous delivery is persisted, retried only when due, and terminal after the second unknown",async()=>{
    await enqueue(); const send=vi.fn(async()=>{throw new Error("secret://synthetic-should-not-be-logged");});
    expect(await runOutboundOnce(options,ports(send))).toMatchObject({retried:1,sent:0});
    expect(await runOutboundOnce(options,ports(send))).toMatchObject({claimed:0});
    await pool.query("UPDATE outbound_messages SET run_after=now()-interval '1 second' WHERE workspace_id=$1 AND status='queued'",[ws]);
    expect(await runOutboundOnce(options,ports(send))).toMatchObject({failed:1,sent:0});
    expect((await pool.query("SELECT status,attempts,consecutive_unknown,fail_reason FROM outbound_messages WHERE workspace_id=$1",[ws])).rows[0])
      .toEqual({status:"failed",attempts:2,consecutive_unknown:2,fail_reason:"UNKNOWN_OUTCOME"});
  });
  it("a missing destination fails only its row; another valid message still completes",async()=>{
    await enqueue();await enqueue(ws,"dingtalk",randomUUID());
    const send=vi.fn<()=>Promise<unknown>>().mockResolvedValueOnce({kind:"permanent_failure",reason:"NO_CHANNEL_FOR_WORKSPACE"}).mockResolvedValueOnce({kind:"acknowledged"});
    expect(await runOutboundOnce(options,ports(send))).toMatchObject({claimed:2,failed:1,sent:1});
    expect(send).toHaveBeenCalledTimes(2);
  });
});
