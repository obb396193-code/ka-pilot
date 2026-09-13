import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DingTalkOutboundHttp } from "../src/notifications/dingtalk-outbound-http.js";

// Synthetic keys only. No tests use global fetch or a real DingTalk destination.
const group={webhook:"https://oapi.dingtalk.com/robot/send?access_token=synthetic",secret:"synthetic-secret"};
const dm={appKey:"synthetic-app",appSecret:"synthetic-key",robotCode:"synthetic-robot"};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const fake=()=>vi.fn<typeof fetch>();
describe("bounded DingTalk outbound HTTP",()=>{
  it("signs configured group URL and needs a real errcode=0 acknowledgement",async()=>{
    const fetchFn=fake().mockResolvedValue(response({errcode:0}));
    const http=new DingTalkOutboundHttp({fetchFn,now:()=>1789296000000});
    expect(await http.sendGroup(group,"synthetic notice")).toEqual({kind:"acknowledged"});
    const [url,init]=fetchFn.mock.calls[0]!;
    const parsed=new URL(String(url));
    expect(parsed.searchParams.get("timestamp")).toBe("1789296000000");
    expect(parsed.searchParams.get("sign")).toBe(createHmac("sha256",group.secret).update(`1789296000000\n${group.secret}`).digest("base64"));
    expect(init).toMatchObject({method:"POST",redirect:"error",body:JSON.stringify({msgtype:"text",text:{content:"synthetic notice"}})});
  });
  it.each(["http://oapi.dingtalk.com/robot/send","https://dingtalk.com.evil.test/robot/send","https://127.0.0.1/robot/send",
    "https://user:pass@oapi.dingtalk.com/robot/send","https://oapi.dingtalk.com:444/robot/send","https://oapi.dingtalk.com/robot/send#fragment"])("never fetches an untrusted destination %s",async webhook=>{
    const fetchFn=fake();expect(await new DingTalkOutboundHttp({fetchFn}).sendGroup({...group,webhook},"notice"))
      .toEqual({kind:"permanent_failure",reason:"UNTRUSTED_DESTINATION"});expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    [429,{kind:"retryable_failure",reason:"REMOTE_RATE_LIMITED"}],
    [503,{kind:"retryable_failure",reason:"REMOTE_UNAVAILABLE"}],
    [403,{kind:"permanent_failure",reason:"REMOTE_REJECTED"}],
    [302,{kind:"permanent_failure",reason:"REMOTE_REJECTED"}],
  ])("classifies HTTP %s without exposing provider text",async(status,expected)=>{
    const fetchFn=fake().mockResolvedValue(response({secret:"never-return"},status as number));
    expect(await new DingTalkOutboundHttp({fetchFn}).sendGroup(group,"notice")).toEqual(expected);
  });
  it.each([{}, {errcode:"0"},null,{errcode:0.5}])("does not fabricate sent from malformed ack %j",async body=>{
    expect(await new DingTalkOutboundHttp({fetchFn:fake().mockResolvedValue(response(body))}).sendGroup(group,"notice")).toEqual({kind:"unknown"});
  });
  it("explicit group rejection is not an acknowledgement",async()=>{
    expect(await new DingTalkOutboundHttp({fetchFn:fake().mockResolvedValue(response({errcode:310000,errmsg:"private"}))}).sendGroup(group,"notice"))
      .toEqual({kind:"permanent_failure",reason:"REMOTE_REJECTED"});
  });
  it("connection exception and deadline become unknown, never include credentials",async()=>{
    const http=new DingTalkOutboundHttp({fetchFn:fake().mockRejectedValue(new Error(group.webhook))});
    expect(await http.sendGroup(group,"notice")).toEqual({kind:"unknown"});
    const stalled=new DingTalkOutboundHttp({fetchFn:fake().mockImplementation(()=>new Promise(()=>{})),timeoutMs:10});
    expect(await stalled.sendGroup(group,"notice")).toEqual({kind:"unknown"});
  });
  it("bounds acknowledgement bytes including chunked bodies and exact cap",async()=>{
    for(const length of [262144,262145]){
      const fetchFn=fake().mockResolvedValue(new Response("x".repeat(length)));
      expect(await new DingTalkOutboundHttp({fetchFn}).sendGroup(group,"notice")).toEqual({kind:"unknown"});
    }
  });
  it("rejects oversized text without truncating or sending",async()=>{
    const fetchFn=fake();expect(await new DingTalkOutboundHttp({fetchFn}).sendGroup(group,"中".repeat(2000)))
      .toEqual({kind:"permanent_failure",reason:"UNSUPPORTED_MESSAGE"});expect(fetchFn).not.toHaveBeenCalled();
  });
  it("uses fixed token/OTO endpoints and reuses a token only in this transport instance",async()=>{
    const fetchFn=fake().mockResolvedValueOnce(response({accessToken:"synthetic-token",expireIn:7200}))
      .mockResolvedValueOnce(response({processQueryKey:"accepted"})).mockResolvedValueOnce(response({processQueryKey:"accepted2"}));
    const http=new DingTalkOutboundHttp({fetchFn,dm});
    expect(await http.sendDirect("synthetic-user","notice")).toEqual({kind:"acknowledged"});
    expect(await http.sendDirect("synthetic-user","notice2")).toEqual({kind:"acknowledged"});
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls[0]![0]).toBe("https://api.dingtalk.com/v1.0/oauth2/accessToken");
    expect(fetchFn.mock.calls[1]).toEqual(["https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend",expect.objectContaining({
      redirect:"error",headers:{"content-type":"application/json","x-acs-dingtalk-access-token":"synthetic-token"},
      body:JSON.stringify({robotCode:dm.robotCode,userIds:["synthetic-user"],msgKey:"sampleText",msgParam:JSON.stringify({content:"notice"})}),
    })]);
  });
  it.each([
    [{invalidStaffIdList:["synthetic-user"],processQueryKey:"key"},{kind:"permanent_failure",reason:"REMOTE_REJECTED"}],
    [{filteredStaffIdList:["synthetic-user"],processQueryKey:"key"},{kind:"permanent_failure",reason:"REMOTE_REJECTED"}],
    [{flowControlledStaffIdList:["synthetic-user"],processQueryKey:"key"},{kind:"retryable_failure",reason:"REMOTE_RATE_LIMITED"}],
    [{flowControlledStaffIdList:"bad",processQueryKey:"key"},{kind:"unknown"}],
    [{invalidStaffIdList:["another-user"],processQueryKey:"key"},{kind:"unknown"}],
    [{},{kind:"unknown"}],
  ])("checks single-recipient result lists: %j",async(body,expected)=>{
    const fetchFn=fake().mockResolvedValueOnce(response({accessToken:"synthetic-token",expireIn:7200})).mockResolvedValueOnce(response(body));
    expect(await new DingTalkOutboundHttp({fetchFn,dm}).sendDirect("synthetic-user","notice")).toEqual(expected);
  });
  it("missing DM credentials cannot borrow group credentials",async()=>{
    const fetchFn=fake();expect(await new DingTalkOutboundHttp({fetchFn}).sendDirect("synthetic-user","notice"))
      .toEqual({kind:"permanent_failure",reason:"NO_DM_BINDING"});expect(fetchFn).not.toHaveBeenCalled();
  });
  it("token failure does not send and is known retryable, not an ambiguous message result",async()=>{
    const fetchFn=fake().mockRejectedValue(new Error("synthetic-token-error"));
    expect(await new DingTalkOutboundHttp({fetchFn,dm}).sendDirect("synthetic-user","notice"))
      .toEqual({kind:"retryable_failure",reason:"REMOTE_UNAVAILABLE"});expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("a cancelled pass cannot start any HTTP request",async()=>{
    const fetchFn=fake().mockResolvedValue(response({errcode:0})),controller=new AbortController();controller.abort();
    const http=new DingTalkOutboundHttp({fetchFn,dm});
    await http.sendGroup(group,"notice",controller.signal);
    await http.sendDirect("synthetic-user","notice",controller.signal);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("a stalled response body is bounded by the same deadline",async()=>{
    const cancel=vi.fn();const fetchFn=fake().mockResolvedValue(new Response(new ReadableStream({cancel})));
    expect(await new DingTalkOutboundHttp({fetchFn,timeoutMs:10}).sendGroup(group,"notice")).toEqual({kind:"unknown"});
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("token expiry causes fresh lookup without an automatic message resend",async()=>{
    let now=1000000;
    const fetchFn=fake().mockResolvedValueOnce(response({accessToken:"token-one",expireIn:61}))
      .mockResolvedValueOnce(response({processQueryKey:"key"})).mockResolvedValueOnce(response({accessToken:"token-two",expireIn:61}))
      .mockResolvedValueOnce(response({processQueryKey:"key2"}));
    const http=new DingTalkOutboundHttp({fetchFn,dm,now:()=>now});
    await http.sendDirect("synthetic-user","notice");now+=1000;await http.sendDirect("synthetic-user","notice");
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[3]![1]?.headers).toMatchObject({"x-acs-dingtalk-access-token":"token-two"});
  });
  it("invalid DM target and invalid configuration do not become network requests",async()=>{
    const fetchFn=fake();const http=new DingTalkOutboundHttp({fetchFn,dm});
    expect(await http.sendDirect("\nprivate","notice")).toEqual({kind:"permanent_failure",reason:"INVALID_TARGET"});
    expect(()=>new DingTalkOutboundHttp({timeoutMs:Infinity})).toThrow("OUTBOUND_CONFIG_INVALID");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
