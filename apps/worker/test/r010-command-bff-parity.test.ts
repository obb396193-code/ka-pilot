import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { accountMuteRequestSchema, accountMuteResultSchema } from "@ka/domain";
import { expect, it } from "vitest";

it("Web mute request/result strict schemas agree with Domain, including missing and invalid fields", async () => {
  const requests: unknown[] = [null, {}, [], { days: 1, reason_chip: "synthetic" }, { days: 3, reason_chip: "" },
    { days: 7, reason_chip: "s" }, { days: 2, reason_chip: "s" }, { days: "1", reason_chip: "s" }, { days: 1 },
    { days: 1, reason_chip: null }, { days: 1, reason_chip: "s".repeat(4097) }, { days: 1, reason_chip: "s", workspaceId: "forged" }];
  const good = { mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" };
  const results: unknown[] = [null, {}, good, { ...good, mutedUntil: "2026-09-09T03:00:00Z" },
    { ...good, mutedUntil: "2026-02-31T03:00:00+08:00" }, { ...good, mutedUntil: "2026-09-09T03:00:00" },
    { ...good, scope: "all" }, { ...good, extra: "private" }];
  const expected = [requests.map(v => accountMuteRequestSchema.safeParse(v).success), results.map(v => accountMuteResultSchema.safeParse(v).success)];
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
    "const m=await import(process.argv[1]);const [a,b]=JSON.parse(process.argv[2]);process.stdout.write(JSON.stringify([a.map(v=>m.muteRequestSchema.safeParse(v).success),b.map(v=>m.muteResultSchema.safeParse(v).success)]))",
    new URL("../../web/lib/data/r010-command-contracts.ts", import.meta.url).href, JSON.stringify([requests, results])], { timeout: 10000 });
  expect(JSON.parse(stdout)).toEqual(expected);
});

it("source-off BFF agrees exactly with frozen D6 fixture, not a guessed success", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../../packages/contract/fixtures/changesets/dry-run-source-unavailable.json", import.meta.url), "utf8"));
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
    `const {handleR010CommandRequest}=await import(process.argv[1]);const fixture=JSON.parse(process.argv[2]);
     const request=new Request('https://web.example/api/internal/changesets/00000000-0000-4000-8000-000000000001/dry-run',{
       method:'POST',headers:{origin:'https://web.example','content-type':'application/json',cookie:'ka_session=synthetic-session-longer-than-thirty-two'},body:'{}'});
     const result=await handleR010CommandRequest(request,{environment:{KA_DATA_BACKEND_ORIGIN:'https://backend.example',KA_DATA_SERVICE_TOKEN:'synthetic-token-longer-than-thirty-two'},
       requestId:()=>fixture.error.requestId,fetchImpl:async()=>Response.json(fixture,{status:503,headers:{'x-request-id':fixture.error.requestId}})});
     process.stdout.write(JSON.stringify(result));`,
    new URL("../../web/lib/data/r010-command-bff.ts", import.meta.url).href, JSON.stringify(fixture)], { timeout: 10000 });
  expect(JSON.parse(stdout)).toEqual({ status: 503, requestId: fixture.error.requestId, body: fixture });
});
