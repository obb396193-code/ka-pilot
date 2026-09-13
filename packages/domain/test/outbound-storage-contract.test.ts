import { describe, expect, it } from "vitest";
import { durableOutboundClaimSchema, outboundMaintenanceLimitSchema, outboundWorkspaceSchema } from "../src/outbound-storage-contract.js";

const claim = { id:"11111111-1111-4111-8111-111111111111",workspaceId:"22222222-2222-4222-8222-222222222222",
  leaseToken:"33333333-3333-4333-8333-333333333333",channel:"dingtalk",target:"user:synthetic",kind:"job_failed",
  payload:{jobId:"synthetic"},dedupeKey:`outbound:v1:${"a".repeat(64)}`,attempts:1,consecutiveUnknown:0,sentAt:null };
describe("private durable outbound claim boundary",()=>{
  it("accepts a live unsent claim, never a browser auth context",()=>{
    expect(durableOutboundClaimSchema.parse(claim)).toEqual(claim);
    expect(outboundWorkspaceSchema.safeParse("workspace-from-browser").success).toBe(false);
  });
  it.each([
    {channel:"inbox"},{sentAt:"2026-09-13T00:00:00Z"},{attempts:0},{attempts:6},{attempts:1.5},
    {consecutiveUnknown:1},{consecutiveUnknown:2,attempts:3},{leaseToken:""},{dedupeKey:"arbitrary"},
    {target:""},{kind:""},{payload:[]},{scope:"admin"},
  ])("rejects malformed or impossible claims: %j",patch=>{
    expect(durableOutboundClaimSchema.safeParse({...claim,...patch}).success).toBe(false);
  });
  it("allows one previous unknown only when there was a previous attempt",()=>{
    expect(durableOutboundClaimSchema.safeParse({...claim,attempts:2,consecutiveUnknown:1}).success).toBe(true);
  });
  it("maintenance signal cannot masquerade as drained or carry extra data",()=>{
    expect(outboundMaintenanceLimitSchema.parse({maintenanceLimit:true})).toEqual({maintenanceLimit:true});
    expect(outboundMaintenanceLimitSchema.safeParse({maintenanceLimit:false}).success).toBe(false);
    expect(outboundMaintenanceLimitSchema.safeParse({maintenanceLimit:true,payload:{}}).success).toBe(false);
  });
});
