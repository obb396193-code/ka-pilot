import { describe, expect, it, vi } from "vitest";
import { parseOutboundConfig, outboundChannelStatus, outboundChildEnvironment } from "../src/notifications/outbound-config.js";
import { createOutboundTransport } from "../src/notifications/outbound-routing.js";
const ws="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",user="33333333-3333-4333-8333-333333333333";
const env={DATABASE_URL:"postgres://synthetic/local",OUTBOUND_WORKSPACE_ID:ws,KA_WEB_BASE_URL:"https://ka.example.test",
  DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:JSON.stringify({[ws]:{webhook:"https://oapi.dingtalk.com/robot/send?access_token=synthetic",secret:"synthetic"}})};
const claim={id:other,workspaceId:ws,channel:"dingtalk" as const,leaseToken:user,target:`workspace:${ws}:admins`,kind:"job_failed",payload:{jobId:other,error:"https://secret.invalid?token=never-send"},dedupeKey:`outbound:v1:${"a".repeat(64)}`,attempts:1,consecutiveUnknown:0,sentAt:null};
const context={workspaceId:ws,messageId:other,workspaceName:"合成空间",businessDate:"2026-09-10",media:"KUAISHOU",runId:"42",step:"account_realtime"};
function setup(overrides={}) {
  const repo={deliveryContext:vi.fn<()=>Promise<unknown>>(async()=>context),directRecipient:vi.fn<()=>Promise<string|null>>(async()=>"synthetic-staff")};
  const http={sendGroup:vi.fn<(config:unknown,text:string,signal?:AbortSignal)=>Promise<unknown>>(async()=>({kind:"acknowledged"})),
    sendDirect:vi.fn<(staffId:string,text:string,signal?:AbortSignal)=>Promise<unknown>>(async()=>({kind:"acknowledged"}))};
  return {repo,http,transport:createOutboundTransport(parseOutboundConfig({...env,...overrides}),repo,http)};
}
describe("server configured outbound routing and fact templates",()=>{
  it("rejects channel/workspace/target and unconfigured DM without making a network request",async()=>{
    const f=setup(),signal=new AbortController().signal;
    for(const c of [{...claim,workspaceId:other},{...claim,channel:"inbox" as never},{...claim,target:"not-a-recipient"}])
      expect(await f.transport.send(c,signal)).toMatchObject({reason:"INVALID_TARGET"});
    expect(await f.transport.send({...claim,target:`user:${user}`},signal)).toMatchObject({reason:"NO_DM_BINDING"});
    expect(f.repo.deliveryContext).not.toHaveBeenCalled();expect(f.http.sendDirect).not.toHaveBeenCalled();expect(f.http.sendGroup).not.toHaveBeenCalled();
  });
  it("rejects bad payload facts and a mismatched quality day; cancelled work is not sent",async()=>{
    const f=setup(),controller=new AbortController();
    for(const c of [{...claim,payload:{attempts:"not-a-count"}},{...claim,kind:"data_quality_failed",payload:{ds:"2026-09-11",failedChecks:[]}}])
      expect(await f.transport.send(c,controller.signal)).toMatchObject({reason:"UNSUPPORTED_MESSAGE"});
    controller.abort();expect(await f.transport.send(claim,controller.signal)).toMatchObject({kind:"unknown"});expect(f.http.sendGroup).not.toHaveBeenCalled();
  });
  it("keeps known ETL codes/steps and attempt count, but does not fabricate missing run links",async()=>{
    const f=setup();f.repo.deliveryContext.mockResolvedValueOnce({...context,step:"fetch:account_page_2"});
    await f.transport.send({...claim,payload:{attempts:3,errorCode:"UPSTREAM_TIMEOUT"}},new AbortController().signal);
    const text=String(f.http.sendGroup.mock.calls[0]?.[1]);expect(text).toContain("fetch:account_page_2");expect(text).toContain("UPSTREAM_TIMEOUT");expect(text).toContain("ETL尝试次数：3");
    f.repo.deliveryContext.mockResolvedValueOnce({...context,runId:null,step:null,media:null});
    await f.transport.send(claim,new AbortController().signal);
    const missing=String(f.http.sendGroup.mock.calls[1]?.[1]);expect(missing).not.toContain("runId=");expect(missing).toContain("媒体：未知");expect(missing).toContain("失败步骤：未知");
  });
  it("passes only this workspace's credentials to the supervised child",()=>{
    const input={...env,WORKER_TRIGGER_TOKEN:"do-not-inherit",QIHANG_USER_ID:"do-not-inherit",NODE_OPTIONS:"do-not-inherit",
      DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:JSON.stringify({[ws]:{webhook:"https://oapi.dingtalk.com/robot/send?access_token=synthetic",secret:"synthetic"},[other]:{webhook:"https://oapi.dingtalk.com/robot/send?access_token=do-not-inherit",secret:"do-not-inherit"}})};
    const child=outboundChildEnvironment(parseOutboundConfig(input),input);
    expect(JSON.stringify(child)).not.toContain("do-not-inherit");expect(JSON.stringify(child)).not.toContain(other);
    expect(parseOutboundConfig(child).workspaceId).toBe(ws);
  });
  it("requires explicit server workspace and no Qihang credential",()=>{
    expect(parseOutboundConfig(env)).toMatchObject({workspaceId:ws,batchSize:20});
    expect(()=>parseOutboundConfig({...env,OUTBOUND_WORKSPACE_ID:undefined})).toThrow("OUTBOUND_CONFIG_INVALID");
    expect(()=>parseOutboundConfig({...env,KA_WEB_BASE_URL:"https://user:password@bad.test"})).toThrow("OUTBOUND_CONFIG_INVALID");
  });
  it("group absence fails only its row and never falls back to another workspace",async()=>{
    const f=setup({DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:JSON.stringify({[other]:{webhook:"https://oapi.dingtalk.com/robot/send?access_token=other",secret:"other"}})});
    expect(await f.transport.send(claim,new AbortController().signal)).toEqual({kind:"permanent_failure",reason:"NO_CHANNEL_FOR_WORKSPACE"});
    expect(f.http.sendGroup).not.toHaveBeenCalled();expect(f.repo.deliveryContext).not.toHaveBeenCalled();
  });
  it("rejects cross-workspace target and unrecognized kind before DB or send",async()=>{
    const f=setup();
    expect(await f.transport.send({...claim,target:`workspace:${other}:admins`},new AbortController().signal)).toMatchObject({reason:"INVALID_TARGET"});
    expect(await f.transport.send({...claim,kind:"future_kind"},new AbortController().signal)).toMatchObject({reason:"UNSUPPORTED_KIND"});
    expect(f.repo.deliveryContext).not.toHaveBeenCalled();expect(f.http.sendGroup).not.toHaveBeenCalled();
  });
  it("renders trusted facts and a single fixed link, never raw error or payload URLs",async()=>{
    const f=setup();expect(await f.transport.send(claim,new AbortController().signal)).toEqual({kind:"acknowledged"});
    const text=String(f.http.sendGroup.mock.calls[0]?.[1]);
    expect(text).toContain("【KA Pilot】拉数失败");expect(text).toContain("2026-09-10");expect(text).toContain("KUAISHOU");
    expect(text).toContain("https://ka.example.test/admin?tab=etl");expect(text).not.toContain("never-send");expect(text.match(/https:\/\//g)).toHaveLength(1);
  });
  it("DM requires explicit credentials plus a same-space mapping; invalid group config does not suppress DM",async()=>{
    const f=setup({DINGTALK_CLIENT_ID:"synthetic",DINGTALK_CLIENT_SECRET:"synthetic",DINGTALK_ROBOT_CODE:"synthetic",DINGTALK_ROBOT_WEBHOOK_BY_WORKSPACE:"invalid"});
    expect(await f.transport.send({...claim,target:`user:${user}`,kind:"job_blocked_auth"},new AbortController().signal)).toEqual({kind:"acknowledged"});
    expect(f.repo.directRecipient).toHaveBeenCalledWith(expect.objectContaining({workspaceId:ws}),user);
    f.repo.directRecipient.mockResolvedValueOnce(null);
    expect(await f.transport.send({...claim,target:`user:${user}`},new AbortController().signal)).toMatchObject({reason:"NO_DM_BINDING"});
    expect(f.http.sendDirect).toHaveBeenCalledTimes(1);
  });
  it("quality template publishes only three known check labels and correct total",async()=>{
    const f=setup();await f.transport.send({...claim,kind:"data_quality_failed",payload:{ds:"2026-09-10",failedChecks:["cpa_outlier","missing_consecutive_days","total_reconciliation","https://secret.invalid"]}},new AbortController().signal);
    const text=String(f.http.sendGroup.mock.calls[0]?.[1]);expect(text).toContain("失败项数：4");expect(text).not.toContain("secret.invalid");expect(text).toContain("/data?tab=gap");
  });
  it("malicious metadata or changed scope cannot be sent",async()=>{
    const f=setup();f.repo.deliveryContext.mockResolvedValueOnce({...context,workspaceId:other});
    expect(await f.transport.send(claim,new AbortController().signal)).toMatchObject({kind:"retryable_failure"});expect(f.http.sendGroup).not.toHaveBeenCalled();
    f.repo.deliveryContext.mockResolvedValueOnce({...context,workspaceName:"https://bad.test",step:"secret-token"});
    await f.transport.send(claim,new AbortController().signal);
    const text=String(f.http.sendGroup.mock.calls[0]?.[1]);expect(text).not.toContain("bad.test");expect(text).not.toContain("secret-token");
  });
  it("diagnostic flags are per workspace, no private URL or secret",()=>{
    expect(outboundChannelStatus(env,ws)).toEqual({group:"configured",dm:"not_configured"});
    expect(outboundChannelStatus(env,other)).toEqual({group:"not_configured",dm:"not_configured"});
  });
});
