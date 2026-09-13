import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboundDeliveryRepository } from "../src/outbound-delivery-repository.js";
import { runMigrations } from "../src/migrate.js";
const databaseUrl=process.env.TEST_DATABASE_URL??"";
const url=new URL(databaseUrl);
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.port!=="55432"||!/^\/ka_[a-z0-9_]+_test$/.test(url.pathname))throw new Error("Isolated local test DB required");
describe("outbound recipient context / synthetic PG",()=>{
  const pool=new Pool({connectionString:databaseUrl}),repo=new OutboundDeliveryRepository(pool),ws=randomUUID(),other=randomUUID(),user=randomUUID();
  beforeAll(async()=>{await runMigrations({databaseUrl});await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic delivery'),($2,'foreign')",[ws,other]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic user')",[user,ws]);});
  afterAll(async()=>{for(const table of ["identity_mappings","outbound_messages","etl_runs","jobs","users"])await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`,[[ws,other]]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])",[[ws,other]]);await pool.end();});
  const claim=async(target=`workspace:${ws}:admins`)=>{
    const jobId=randomUUID();await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload) VALUES($1,$2,'etl_full',$3)",[jobId,ws,{businessDate:"2026-09-10",media:"KUAISHOU"}]);
    await pool.query("INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload) VALUES($1,'dingtalk',$2,'job_failed',$3)",[ws,target,{jobId,error:"do-not-read-or-send"}]);
    const c=await repo.claim(ws);if(!c||"maintenanceLimit" in c)throw new Error("No claim");return c;
  };
  it("reads trusted workspace/date/media with a live lease, never raw errors",async()=>{
    const c=await claim();const context=await repo.deliveryContext(c);
    expect(context).toMatchObject({workspaceId:ws,messageId:c.id,workspaceName:"synthetic delivery",businessDate:"2026-09-10",media:"KUAISHOU",runId:null,step:null});
    expect(JSON.stringify(context)).not.toContain("do-not-read-or-send");
    await expect(repo.deliveryContext({...c,workspaceId:other})).rejects.toThrow("OUTBOUND_STORE_FAILED");
    await expect(repo.deliveryContext({...c,leaseToken:randomUUID()})).rejects.toThrow("OUTBOUND_STORE_FAILED");
  });
  it("resolves only the active user mapping in the same workspace; duplicate or inactive cannot pick one",async()=>{
    const c=await claim(`user:${user}`);expect(await repo.directRecipient(c,user)).toBeNull();
    await pool.query("INSERT INTO identity_mappings(workspace_id,provider,user_id,external_id) VALUES($1,'dingtalk',$2,'foreign-staff')",[other,user]);
    expect(await repo.directRecipient(c,user)).toBeNull();
    await pool.query("INSERT INTO identity_mappings(workspace_id,provider,user_id,external_id) VALUES($1,'dingtalk',$2,'own-staff')",[ws,user]);
    expect(await repo.directRecipient(c,user)).toBe("own-staff");
    await expect(repo.directRecipient(c,randomUUID())).rejects.toThrow("OUTBOUND_STORE_FAILED");
    await pool.query("UPDATE users SET is_active=false WHERE id=$1",[user]);expect(await repo.directRecipient(c,user)).toBeNull();
    await pool.query("UPDATE users SET is_active=true WHERE id=$1",[user]);
    await pool.query("INSERT INTO identity_mappings(workspace_id,provider,user_id,external_id) VALUES($1,'dingtalk',$2,'duplicate-staff')",[ws,user]);
    expect(await repo.directRecipient(c,user)).toBeNull();
  });
  it("does not prepare delivery for an inactive workspace",async()=>{
    const c=await claim();await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1",[ws]);
    await expect(repo.deliveryContext(c)).rejects.toThrow("OUTBOUND_STORE_FAILED");
    await pool.query("UPDATE workspaces SET is_active=true WHERE id=$1",[ws]);
  });
});
