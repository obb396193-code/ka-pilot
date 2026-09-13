import { z } from "zod";
import { outboundDeliveryContextSchema, type OutboundDeliveryOutcome, type OutboundDeliveryContext } from "@ka/domain";
import type { OutboundClaim } from "./outbound-once.js";
import type { OutboundRuntimeConfig } from "./outbound-config.js";
type ContextPort={deliveryContext(c:OutboundClaim):Promise<unknown>;directRecipient(c:OutboundClaim,userId:string):Promise<string|null>};
type HttpPort={sendGroup(config:unknown,text:string,signal?:AbortSignal):Promise<unknown>;sendDirect(staffId:string,text:string,signal?:AbortSignal):Promise<unknown>};
const knownChecks:Record<string,string>={total_reconciliation:"总量对平",cpa_outlier:"成本异常",missing_consecutive_days:"连续缺数"};
const knownSteps=new Set(["start","account_realtime","account_offline","ad_realtime","account_hourly","enqueue:canonical","enqueue:quality",
  "aggregate:load_inputs","aggregate:settings","aggregate:upsert","quality:start","quality:total_reconciliation","quality:cpa_outlier","quality:missing_consecutive_days","quality:notify","quality:validation_failed"]);
const knownCodes=new Set(["QIHANG_IDENTITY_MISSING","ACCOUNT_SCOPE_MISSING","UPSTREAM_UNAVAILABLE","UPSTREAM_INVALID_RESPONSE","UPSTREAM_TIMEOUT","UPSTREAM_TRUNCATED"]);
function fact(text:string):string {
  return /^[\p{L}\p{N} _()（）·-]{1,120}$/u.test(text)?text:"未知";
}
function stepLabel(raw:string|null):string {
  if(raw===null)return "未知";if(knownSteps.has(raw))return raw;
  return /^(fetch:account_page_\d{1,6}|validate:account_page_\d{1,6}(_scope)?|persist:account_page_\d{1,6}_accounts_and_raw|account_(realtime|offline)_\d{4}-\d{2}-\d{2})$/.test(raw)?raw:"未知";
}
function render(c:OutboundClaim,meta:OutboundDeliveryContext,base:string):string {
  if(c.kind==="data_quality_failed"){
    const data=z.object({ds:z.iso.date(),failedChecks:z.array(z.string().min(1).max(256)).max(1000)}).parse(c.payload);
    if(data.ds!==meta.businessDate)throw new Error();
    const link=new URL("/data",base);link.searchParams.set("tab","gap");
    return ["【KA Pilot】数据质量告警",`业务日：${data.ds}`,`失败项数：${data.failedChecks.length}`,
      `检查项：${data.failedChecks.slice(0,3).map(k=>knownChecks[k]??"未识别检查项").join("、")||"无"}`,link.toString()].join("\n");
  }
  const attempts=c.payload.attempts==null?"未知":String(z.number().int().nonnegative().max(1000).parse(c.payload.attempts));
  const code=typeof c.payload.errorCode==="string"&&knownCodes.has(c.payload.errorCode)?c.payload.errorCode:"未知";
  const link=new URL("/admin",base);link.searchParams.set("tab","etl");if(meta.runId)link.searchParams.set("runId",meta.runId);
  return ["【KA Pilot】拉数失败",`空间：${fact(meta.workspaceName)} · 媒体：${meta.media??"未知"}`,`业务日：${meta.businessDate}`,
    `失败步骤：${stepLabel(meta.step)} · 错误码：${code}`,`ETL尝试次数：${attempts}（重试次数以运行记录为准）`,link.toString()].join("\n");
}
export function createOutboundTransport(config:OutboundRuntimeConfig,repo:ContextPort,http:HttpPort){
  const failed=(reason:"INVALID_TARGET"|"UNSUPPORTED_KIND"|"NO_CHANNEL_FOR_WORKSPACE"|"NO_DM_BINDING"|"UNSUPPORTED_MESSAGE"):OutboundDeliveryOutcome=>({kind:"permanent_failure",reason});
  return {async send(c:OutboundClaim,signal:AbortSignal):Promise<unknown>{
    if(c.workspaceId!==config.workspaceId||c.channel!=="dingtalk")return failed("INVALID_TARGET");
    if(!["job_failed","job_blocked_auth","data_quality_failed"].includes(c.kind))return failed("UNSUPPORTED_KIND");
    const groupTarget=c.target===`workspace:${c.workspaceId}:admins`;
    const user=c.target.startsWith("user:")?z.uuid().safeParse(c.target.slice(5)):null;
    if(!groupTarget&&!user?.success)return failed("INVALID_TARGET");
    const group=config.groups.get(c.workspaceId);
    if(groupTarget&&!group)return failed("NO_CHANNEL_FOR_WORKSPACE");
    if(!groupTarget&&!config.dm)return failed("NO_DM_BINDING");
    let meta:OutboundDeliveryContext,staffId:string|null=null;
    try{
      meta=outboundDeliveryContextSchema.parse(await repo.deliveryContext(c));
      if(meta.workspaceId!==c.workspaceId||meta.messageId!==c.id)throw new Error();
      if(user?.success)staffId=await repo.directRecipient(c,user.data);
    }catch{return {kind:"retryable_failure",reason:"REMOTE_UNAVAILABLE"};}
    if(!groupTarget&&staffId===null)return failed("NO_DM_BINDING");
    let text:string;try{text=render(c,meta,config.webBaseUrl);}catch{return failed("UNSUPPORTED_MESSAGE");}
    if(signal.aborted)return {kind:"unknown"};
    return groupTarget?http.sendGroup(group,text,signal):http.sendDirect(staffId!,text,signal);
  }};
}
