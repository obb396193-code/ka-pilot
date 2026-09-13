import { z } from "zod";
import { assertProductionEnvironment } from "../production-environment.js";
import { isTrustedDingTalkGroup } from "./dingtalk-outbound-http.js";
const secret=z.string().min(1).max(4096).refine(v=>!Array.from(v).some(c=>c.charCodeAt(0)<=32||c.charCodeAt(0)===127));
const group=z.object({webhook:z.string().min(1).max(8192),secret}).strict();
const dm=z.object({appKey:secret,appSecret:secret,robotCode:secret}).strict();
const runtime=z.object({databaseUrl:z.string().url().refine(v=>["postgres:","postgresql:"].includes(new URL(v).protocol)),workspaceId:z.uuid(),
  webBaseUrl:z.string().url().refine(v=>{const u=new URL(v);return !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/"&&
    (u.protocol==="https:"||(u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname)));}),
  batchSize:z.coerce.number().int().min(1).max(100).default(20),maxMs:z.coerce.number().int().min(1).max(600000).default(60000),
}).strict();
function channels(env:Readonly<NodeJS.ProcessEnv>) {
  const groups=new Map<string,z.infer<typeof group>>();
  const raw=env.DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE;
  if(raw && Buffer.byteLength(raw)<262144){
    try{
      const parsed:unknown=JSON.parse(raw);
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&Object.keys(parsed).length<=1000)
        for(const [key,value] of Object.entries(parsed)){
          const id=z.uuid().safeParse(key),entry=group.safeParse(value);
          if(id.success&&entry.success&&isTrustedDingTalkGroup(entry.data))groups.set(id.data,entry.data);
        }
    }catch{/* Malformed group config must not suppress an independently configured DM. */}
  }
  const credentials=dm.safeParse({appKey:env.DINGTALK_CLIENT_ID,appSecret:env.DINGTALK_CLIENT_SECRET,robotCode:env.DINGTALK_ROBOT_CODE});
  return {groups,dm:credentials.success?credentials.data:null};
}
export type OutboundRuntimeConfig=z.infer<typeof runtime>&ReturnType<typeof channels>;
export function parseOutboundConfig(env:Readonly<NodeJS.ProcessEnv>):OutboundRuntimeConfig {
  try{
    assertProductionEnvironment(env);
    return {...runtime.parse({databaseUrl:env.DATABASE_URL,workspaceId:env.OUTBOUND_WORKSPACE_ID,webBaseUrl:env.KA_WEB_BASE_URL,
      batchSize:env.OUTBOUND_BATCH_SIZE,maxMs:env.OUTBOUND_MAX_MS}),...channels(env)};
  }catch{throw new Error("OUTBOUND_CONFIG_INVALID");}
}
export function outboundChannelStatus(env:Readonly<NodeJS.ProcessEnv>,workspaceId:string){
  const c=channels(env);
  return {group:c.groups.has(workspaceId)?"configured":"not_configured",dm:c.dm?"configured":"not_configured"};
}
/** Minimal server child environment; no ETL identity, trigger token, or other-space webhook. */
export function outboundChildEnvironment(config:OutboundRuntimeConfig,env:Readonly<NodeJS.ProcessEnv>):NodeJS.ProcessEnv {
  const own=config.groups.get(config.workspaceId);
  return {PATH:env.PATH,NODE_ENV:env.NODE_ENV,NODE_EXTRA_CA_CERTS:env.NODE_EXTRA_CA_CERTS,
    DATABASE_URL:config.databaseUrl,OUTBOUND_WORKSPACE_ID:config.workspaceId,KA_WEB_BASE_URL:config.webBaseUrl,
    OUTBOUND_BATCH_SIZE:String(config.batchSize),OUTBOUND_MAX_MS:String(config.maxMs),
    DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:JSON.stringify(own?{[config.workspaceId]:own}:{}),
    ...(config.dm?{DINGTALK_CLIENT_ID:config.dm.appKey,DINGTALK_CLIENT_SECRET:config.dm.appSecret,DINGTALK_ROBOT_CODE:config.dm.robotCode}:{})};
}
