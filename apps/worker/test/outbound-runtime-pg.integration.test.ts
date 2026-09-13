import { randomUUID } from "node:crypto";
import { spawn, fork, type ChildProcess } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { runMigrations, DailyReportRepository } from "@ka/db";
import { dailyDeliverySchema } from "@ka/domain";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";
import { executeOutboundRuntime } from "../src/notifications/outbound-runtime.js";
import { parseOutboundConfig } from "../src/notifications/outbound-config.js";
const databaseUrl=process.env.TEST_DATABASE_URL??"";const url=new URL(databaseUrl);
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.port!=="55432"||!/^\/ka_[a-z0-9_]+_test$/.test(url.pathname))throw new Error("Isolated local test DB required");
describe("P198 runtime / actual local PG and executable, no external sends",()=>{
 const pool=new Pool({connectionString:databaseUrl}),ws=randomUUID(),other=randomUUID();
 const base={DATABASE_URL:databaseUrl,OUTBOUND_WORKSPACE_ID:ws,KA_WEB_BASE_URL:"https://ka.example.test"};
 beforeAll(async()=>{await runMigrations({databaseUrl});await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic outbox'),($2,'other')",[ws,other]);});
 const clear=async()=>{await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])",[[ws,other]]);};beforeEach(clear);
 afterAll(async()=>{await clear();await pool.query("DELETE FROM report_runs WHERE workspace_id=$1",[ws]);await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])",[[ws,other]]);await pool.end();});
 const enqueue=async(workspaceId=ws,channel="dingtalk",kind="job_failed")=>{await pool.query("INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload) VALUES($1,$2,$3,$4,$5)",[workspaceId,channel,`workspace:${workspaceId}:admins`,kind,{jobId:randomUUID()}]);};
 const group=JSON.stringify({[ws]:{webhook:"https://oapi.dingtalk.com/robot/send?access_token=synthetic",secret:"synthetic"}});
 let orphan:{child:ChildProcess;closed:Promise<number|null>;lock:PoolClient}|undefined;
 const clearOrphan=async()=>{
   if(!orphan)return;const {child,closed,lock}=orphan;orphan=undefined;
   if(child.exitCode===null)child.kill("SIGKILL");
   await lock.query("ROLLBACK");lock.release();await closed;
 };
 beforeEach(async context=>{
   if(context.task.name!=="orphaned child exits even while its workspace read is blocked")return;
   const lock=await pool.connect();await lock.query("BEGIN");await lock.query("LOCK TABLE workspaces IN ACCESS EXCLUSIVE MODE");
   const connection=new URL(databaseUrl);const app=`p198-orphan-${ws}`;connection.searchParams.set("application_name",app);
   const child=fork(new URL("../src/notifications/outbound-runtime.ts",import.meta.url),[],{cwd:new URL("..",import.meta.url),execArgv:["--import","tsx"],env:{PATH:process.env.PATH,...base,DATABASE_URL:connection.toString()},stdio:["ignore","ignore","ignore","ipc"]});
   orphan={child,closed:new Promise<number|null>(resolve=>child.once("exit",resolve)),lock};
   // Start-up belongs to fixture preparation, not the 1-second orphan-exit assertion.
   try{
     const deadline=Date.now()+8000;let observed=false;
     while(Date.now()<deadline){
       observed=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[app])).rowCount===1;
       if(observed||child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,25));
     }
     expect(observed).toBe(true);
   }catch(error){await clearOrphan();throw error;}
 });
 afterEach(clearOrphan);
 it("daily report reads real deduplication without claiming it was sent or is still queued",async()=>{
   const userId=randomUUID(), reportId=randomUUID(), jobId=randomUUID();
   await pool.query("INSERT INTO report_runs(id,workspace_id,user_id,kind,ref,status) VALUES($1,$2,$3,'daily_brief',$4,'ready')",[reportId,ws,userId,{date:"2026-09-13"}]);
   // Give the duplicate a later creation time so report selection is deterministic.
   await pool.query("INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload,created_at) VALUES($1,'dingtalk',$2,'job_failed',$3,now()-interval '2 seconds')",[ws,`workspace:${ws}:admins`,{jobId}]);
   const fetchFn=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{"errcode":0}'));
   expect(await executeOutboundRuntime(parseOutboundConfig({...base,DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:group}),{fetchFn})).toMatchObject({sent:1});
   await pool.query("INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload) VALUES($1,'dingtalk',$2,'job_failed',$3)",[ws,`workspace:${ws}:admins`,{jobId,reportRunId:reportId}]);
   expect(await executeOutboundRuntime(parseOutboundConfig({...base,DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:group}),{fetchFn})).toMatchObject({deduplicated:1,sent:0});
   const facts=await new DailyReportRepository(pool).facts({workspaceId:ws,userId,workspaceKind:"personal",role:"optimizer",scope:{kind:"explicit_accounts",accounts:[]}},"2026-09-13");
   expect(dailyDeliverySchema.parse(facts.delivery)).toEqual({status:"deduplicated",at:null,target:`workspace:${ws}:admins`});
   expect(fetchFn).toHaveBeenCalledTimes(1);
 });
 it("supervised runtime is actually killed on deadline, leaving queued rows untouched",async()=>{
   await enqueue();const lock=await pool.connect();let pid:number|undefined;
   await lock.query("BEGIN");await lock.query("LOCK TABLE workspaces IN ACCESS EXCLUSIVE MODE");
   try{
     const result=await superviseWorkerOnce({maxMs:1500,startChild:()=>{
       const child=fork(new URL("../src/notifications/outbound-runtime.ts",import.meta.url),[],{cwd:new URL("..",import.meta.url),execArgv:["--import","tsx"],env:{PATH:process.env.PATH,...base},stdio:["ignore","ignore","ignore","ipc"]});
       pid=child.pid;return child;
     }});
     expect(result.status).toBe("budget");expect(pid).toBeGreaterThan(0);
     expect(()=>process.kill(pid!,0)).toThrow();
   }finally{await lock.query("ROLLBACK");lock.release();}
   expect((await pool.query("SELECT status,attempts FROM outbound_messages WHERE workspace_id=$1",[ws])).rows).toEqual([{status:"queued",attempts:0}]);
 });
 it("orphaned child exits even while its workspace read is blocked",async()=>{
   expect(orphan).toBeDefined();const {child,closed}=orphan!;child.disconnect();
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{expect(await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve("still_running"),1000);})])).toBe(1);}
   finally{clearTimeout(timer);}
 });
 it.each([{}, {OUTBOUND_WORKSPACE_ID:"not-a-uuid"}, {args:["--workspace","secret"]}])("CLI rejects invalid config/args without exposing them: %j",async patch=>{
   const result=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
     const child=spawn(process.execPath,["--import","tsx","src/notifications/outbound-cli.ts",...("args" in patch?patch.args:[])],{cwd:new URL("..",import.meta.url),env:{PATH:process.env.PATH,...("args" in patch?base:patch)},stdio:["ignore","pipe","pipe"]});
     let output="";child.stdout.on("data",b=>{output+=String(b);});child.stderr.on("data",b=>{output+=String(b);});child.once("error",reject);child.once("close",code=>resolve({code,output}));
   });
   expect(result).toEqual({code:1,output:"Outbound round failed\n"});
 });
 it("default composition renders and persists provider acknowledgement without touching another space or inbox",async()=>{
   await enqueue();await enqueue(other);await enqueue(ws,"inbox");
   const fetchFn=vi.fn<typeof fetch>().mockResolvedValue(new Response('{"errcode":0}'));
   expect(await executeOutboundRuntime(parseOutboundConfig({...base,DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:group}),{fetchFn})).toMatchObject({sent:1,claimed:1});
   expect(fetchFn).toHaveBeenCalledTimes(1);
   expect((await pool.query("SELECT status FROM outbound_messages WHERE workspace_id=$1 AND channel='dingtalk'",[ws])).rows[0].status).toBe("sent");
   expect((await pool.query("SELECT status FROM outbound_messages WHERE workspace_id=$1 OR (workspace_id=$2 AND channel='inbox')",[other,ws])).rows).toEqual([{status:"queued"},{status:"queued"}]);
 });
 it("missing destination and unknown kind are terminal per-row, not a crashed pass",async()=>{
   await enqueue();await enqueue(ws,"dingtalk","future_kind");const fetchFn=vi.fn<typeof fetch>();
   expect(await executeOutboundRuntime(parseOutboundConfig(base),{fetchFn})).toMatchObject({failed:2,claimed:2});
   expect(fetchFn).not.toHaveBeenCalled();
   expect((await pool.query("SELECT fail_reason FROM outbound_messages WHERE workspace_id=$1 ORDER BY fail_reason",[ws])).rows)
     .toEqual([{fail_reason:"NO_CHANNEL_FOR_WORKSPACE"},{fail_reason:"UNSUPPORTED_KIND"}]);
 });
 it("real CLI starts without Qihang/KA/DM credentials, processes only outbox and emits no private fields",async()=>{
   await enqueue();
   const result=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
     const child=spawn(process.execPath,["--import","tsx","src/notifications/outbound-cli.ts"],{cwd:new URL("..",import.meta.url),env:{PATH:process.env.PATH,...base},stdio:["ignore","pipe","pipe"]});
     let output="";child.stdout.on("data",b=>{output+=String(b);});child.stderr.on("data",b=>{output+=String(b);});child.once("error",reject);child.once("close",code=>resolve({code,output}));
   });
   expect(result).toEqual({code:0,output:"Outbound round finished (bounded; pending rows may remain)\n"});
   expect((await pool.query("SELECT status,fail_reason FROM outbound_messages WHERE workspace_id=$1",[ws])).rows)
     .toEqual([{status:"failed",fail_reason:"NO_CHANNEL_FOR_WORKSPACE"}]);
 });
 it("inactive workspace cannot claim or send",async()=>{
   await enqueue();await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1",[ws]);const fetchFn=vi.fn<typeof fetch>();
   try{await expect(executeOutboundRuntime(parseOutboundConfig(base),{fetchFn})).rejects.toThrow("OUTBOUND_RUNTIME_FAILED");}
   finally{await pool.query("UPDATE workspaces SET is_active=true WHERE id=$1",[ws]);}
   expect(fetchFn).not.toHaveBeenCalled();expect((await pool.query("SELECT status FROM outbound_messages WHERE workspace_id=$1",[ws])).rows[0].status).toBe("queued");
 });
});
