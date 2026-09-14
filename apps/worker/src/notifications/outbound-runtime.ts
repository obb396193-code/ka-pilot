import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool,OutboundDeliveryRepository } from "@ka/db";
import { workerOnceLock } from "../scheduling/worker-once-lock.js";
import { parseOutboundConfig,type OutboundRuntimeConfig } from "./outbound-config.js";
import { DingTalkOutboundHttp } from "./dingtalk-outbound-http.js";
import { createOutboundTransport } from "./outbound-routing.js";
import { runOutboundOnce,type OutboundPassResult } from "./outbound-once.js";
async function close(pool:ReturnType<typeof createPool>):Promise<void>{
  try{await pool.end();}catch{throw new Error("OUTBOUND_RUNTIME_FAILED");}
}

/** Server-only composition. No ETL scheduling, no fallback workspace/credential. */
export async function executeOutboundRuntime(config:OutboundRuntimeConfig,options:{fetchFn?:typeof fetch;signal?:AbortSignal}={}):Promise<OutboundPassResult>{
  const pool=createPool(config.databaseUrl,{max:3,connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000});
  try{
    const workspace=await pool.query("SELECT id FROM workspaces WHERE id=$1 AND is_active=true",[config.workspaceId]);
    if(workspace.rowCount!==1)throw new Error();
    const store=new OutboundDeliveryRepository(pool);
    const http=new DingTalkOutboundHttp({...options,...(config.dm?{dm:config.dm}:{})});
    return await runOutboundOnce({workspaceId:config.workspaceId,configured:true,batchSize:config.batchSize},
      {store,transport:createOutboundTransport(config,store,http),lock:workerOnceLock(pool,config.workspaceId),now:()=>new Date().toISOString()},options.signal);
  }catch{throw new Error("OUTBOUND_RUNTIME_FAILED");}
  finally{await close(pool);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const controller=new AbortController();
  // An orphan may be blocked inside a driver which does not observe AbortSignal.
  // Immediate exit releases DB sockets; an in-flight send stays fenced for unknown recovery.
  const abort=():never=>{controller.abort();process.exit(1);};process.once("disconnect",abort);
  const report=(message:unknown)=>new Promise<void>((resolve,reject)=>{
    if(!process.connected||!process.send){reject(new Error());return;}
    process.send(message,error=>error?reject(new Error()):resolve());
  });
  try{
    if(!process.send||!process.connected||process.argv.length!==2)throw new Error();
    const {status,...counts}=await executeOutboundRuntime(parseOutboundConfig(process.env),{signal:controller.signal});
    if(status!=="locked"&&status!=="drained"&&status!=="batch_limit")throw new Error();
    // P-198：先报本轮结果再报结束。只报 completed 的话，锁没拿到（一条没发）也会被说成跑过了。
    await report({kind:"outbound_pass",status,counts});
    await report({kind:"terminal",status:"completed"});
  }catch{process.exitCode=1;}
  finally{process.removeListener("disconnect",abort);if(process.connected)process.disconnect();}
}
