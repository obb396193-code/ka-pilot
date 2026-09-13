import { createHmac } from "node:crypto";
import { z } from "zod";
import type { OutboundDeliveryOutcome } from "@ka/domain";

const TOKEN_URL="https://api.dingtalk.com/v1.0/oauth2/accessToken";
const OTO_URL="https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";
const safeValue=z.string().min(1).max(4096).refine(v=>!Array.from(v).some(c=>c.charCodeAt(0)<=32||c.charCodeAt(0)===127));
const dmSchema=z.object({appKey:safeValue,appSecret:safeValue,robotCode:safeValue}).strict();
const groupSchema=z.object({webhook:z.string().min(1).max(8192),secret:safeValue}).strict();
const tokenSchema=z.object({accessToken:safeValue,expireIn:z.number().int().min(1).max(86400)});
const list=z.array(z.string().min(1).max(4096)).max(100).optional();
const otoSchema=z.object({processQueryKey:z.string().min(1).max(4096).optional(),
  invalidStaffIdList:list,filteredStaffIdList:list,flowControlledStaffIdList:list});
type DmConfig=z.infer<typeof dmSchema>;
const permanent=(reason:"UNTRUSTED_DESTINATION"|"REMOTE_REJECTED"|"UNSUPPORTED_MESSAGE"|"NO_DM_BINDING"|"INVALID_TARGET"):OutboundDeliveryOutcome=>({kind:"permanent_failure",reason});
const unavailable:OutboundDeliveryOutcome={kind:"retryable_failure",reason:"REMOTE_UNAVAILABLE"};
const unknown:OutboundDeliveryOutcome={kind:"unknown"};

/** Same HTTPS/no-userinfo/no-custom-port/subdomain policy as session replies;
 * proactive robots additionally need the official path, never arbitrary APIs. */
function groupUrl(value:string):URL {
  const url=new URL(value);
  if(url.protocol!=="https:" || url.username || url.password || url.port || url.hash ||
    !(url.hostname==="dingtalk.com" || url.hostname.endsWith(".dingtalk.com")) ||
    url.pathname!=="/robot/send" || !url.searchParams.get("access_token")) throw new Error();
  return url;
}
function validText(value:unknown):value is string {
  return typeof value==="string" && value.trim().length>0 && Buffer.byteLength(value)<=4000;
}
function httpFailure(status:number):OutboundDeliveryOutcome|null {
  if(status===429) return {kind:"retryable_failure",reason:"REMOTE_RATE_LIMITED"};
  if(status>=500) return unavailable;
  return status>=200 && status<300 ? null : permanent("REMOTE_REJECTED");
}

/** Only transport: callers resolve same-workspace recipients and render the
 * allowlisted template. No payload/URL/token/provider body is logged or returned.
 * Ack means API accepted, never proof of user delivery/read. No hidden retries.
 */
export class DingTalkOutboundHttp {
  private readonly fetchFn:typeof fetch;
  private readonly now:()=>number;
  private readonly timeoutMs:number;
  private readonly dm:DmConfig|null;
  private token:{value:string;until:number}|null=null;
  constructor(options:{fetchFn?:typeof fetch;now?:()=>number;timeoutMs?:number;dm?:unknown}={}) {
    this.fetchFn=options.fetchFn??fetch;this.now=options.now??Date.now;
    this.timeoutMs=options.timeoutMs??10000;
    if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>20000) throw new Error("OUTBOUND_CONFIG_INVALID");
    const parsed=dmSchema.safeParse(options.dm);this.dm=parsed.success?parsed.data:null;
  }

  private async post(url:string,body:unknown,signal?:AbortSignal,token?:string):Promise<{status:number;body:unknown}> {
    if(signal?.aborted)throw new Error("OUTBOUND_INTERRUPTED");
    const controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener("abort",abort,{once:true});
    if(signal?.aborted) controller.abort();
    let rejectAbort!:(error:Error)=>void;
    const interrupted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
    const onAbort=()=>rejectAbort(new Error("OUTBOUND_INTERRUPTED"));
    controller.signal.addEventListener("abort",onAbort,{once:true});
    if(controller.signal.aborted) onAbort();
    const timer=setTimeout(abort,this.timeoutMs);
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try {
      const response=await Promise.race([this.fetchFn(url,{method:"POST",redirect:"error",signal:controller.signal,
        headers:{"content-type":"application/json",...(token?{"x-acs-dingtalk-access-token":token}:{})},body:JSON.stringify(body)}),interrupted]);
      // Rejected requests do not need a provider body, which may contain secrets.
      if(!response.ok){void response.body?.cancel().catch(()=>{});return {status:response.status,body:null};}
      const declared=response.headers.get("content-length");
      if(declared && (!/^\d+$/.test(declared)||Number(declared)>=262144)) {void response.body?.cancel().catch(()=>{});throw new Error();}
      if(!response.body) throw new Error();
      reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      for(;;){
        const part=await Promise.race([reader.read(),interrupted]);if(part.done)break;
        size+=part.value.byteLength;if(size>=262144)throw new Error();chunks.push(part.value);
      }
      return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString("utf8"))};
    } finally {
      clearTimeout(timer);signal?.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",onAbort);
      if(reader)void reader.cancel().catch(()=>{});
      controller.abort();
    }
  }

  async sendGroup(input:unknown,text:string,signal?:AbortSignal):Promise<OutboundDeliveryOutcome> {
    if(!validText(text))return permanent("UNSUPPORTED_MESSAGE");
    const config=groupSchema.safeParse(input);let url:URL;
    if(!config.success)return permanent("UNTRUSTED_DESTINATION");
    try {url=groupUrl(config.data.webhook);} catch{return permanent("UNTRUSTED_DESTINATION");}
    const timestamp=this.now();
    if(!Number.isSafeInteger(timestamp)||timestamp<0)return unknown;
    url.searchParams.set("timestamp",String(timestamp));
    url.searchParams.set("sign",createHmac("sha256",config.data.secret).update(`${timestamp}\n${config.data.secret}`).digest("base64"));
    try {
      const result=await this.post(url.toString(),{msgtype:"text",text:{content:text}},signal);
      const failure=httpFailure(result.status);if(failure)return failure;
      const parsed=z.object({errcode:z.number().int()}).safeParse(result.body);
      return !parsed.success?unknown:parsed.data.errcode===0?{kind:"acknowledged"}:permanent("REMOTE_REJECTED");
    } catch{return unknown;}
  }

  async sendDirect(staffId:string,text:string,signal?:AbortSignal):Promise<OutboundDeliveryOutcome> {
    if(!this.dm)return permanent("NO_DM_BINDING");
    if(!safeValue.safeParse(staffId).success)return permanent("INVALID_TARGET");
    if(!validText(text))return permanent("UNSUPPORTED_MESSAGE");
    let token:string;
    // A token lookup cannot send the message. Failure here is known retryable,
    // not one of the two ambiguous message outcomes. Cache never crosses config.
    try {
      const now=this.now();if(!Number.isSafeInteger(now)||now<0)throw new Error();
      if(this.token && this.token.until>now)token=this.token.value;
      else {
        const result=await this.post(TOKEN_URL,{appKey:this.dm.appKey,appSecret:this.dm.appSecret},signal);
        const failure=httpFailure(result.status);if(failure)return failure;
        const data=tokenSchema.parse(result.body);token=data.accessToken;
        this.token={value:token,until:now+Math.max(0,data.expireIn-60)*1000};
      }
    } catch{return unavailable;}
    if(signal?.aborted)return unknown;
    try {
      const result=await this.post(OTO_URL,{robotCode:this.dm.robotCode,userIds:[staffId],msgKey:"sampleText",msgParam:JSON.stringify({content:text})},signal,token);
      if(result.status===401)this.token=null;
      const failure=httpFailure(result.status);if(failure)return failure;
      const parsed=otoSchema.safeParse(result.body);if(!parsed.success)return unknown;
      const {invalidStaffIdList:invalid=[],filteredStaffIdList:filtered=[],flowControlledStaffIdList:limited=[]}=parsed.data;
      if([...invalid,...filtered,...limited].some(id=>id!==staffId))return unknown;
      if(invalid.includes(staffId)||filtered.includes(staffId))return permanent("REMOTE_REJECTED");
      if(limited.includes(staffId))return {kind:"retryable_failure",reason:"REMOTE_RATE_LIMITED"};
      return parsed.data.processQueryKey?{kind:"acknowledged"}:unknown;
    } catch{return unknown;}
  }
}
