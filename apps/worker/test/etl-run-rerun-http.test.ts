import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtlRunRerunError } from "@ka/db";
import { etlRunRerunResponseSchema } from "@ka/domain";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { EtlRunRerunService } from "../src/admin/etl-run-rerun-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

const token = "synthetic-rerun-internal-token-long-enough", requestId = "fixture-etl-run-rerun-001";
const auth = personalAuth({ workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", accounts: [] });
function fixture(name: string) {
  const value = JSON.parse(readFileSync(new URL(`../../../packages/contract/fixtures/system/${name}.json`, import.meta.url), "utf8"));
  if (value.meta) delete value.meta._note;
  return value;
}
const data = fixture("etl-run-rerun").data;
describe("ETL rerun HTTP composition", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  async function start(options: { role?: string; failure?: unknown; output?: unknown; missing?: boolean; max?: number } = {}) {
    const rerun = vi.fn(async () => { if (options.failure) throw options.failure; return options.output ?? { workspaceId: auth.workspaceId, data }; });
    const unused = new Proxy({}, { get() { throw new Error("Unexpected service"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken: token, sessionAuthService: approvedSessionAuth({ ...auth, role: options.role ?? "admin" } as typeof auth),
      maxResponseBytes: options.max, etlRunRerunService: options.missing ? undefined : new EtlRunRerunService({ rerun }),
    } as unknown as DataApiServerOptions);
    servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
    return { rerun, async call(options: { method?: string; id?: string; body?: string; search?: string; headers?: Record<string, string> } = {}) {
      const method = options.method ?? "POST";
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/system/etl-runs/${options.id ?? data.sourceRunId}/rerun${options.search ?? ""}`, {
        method, headers: { ...businessHeaders(token), "content-type": "application/json", "x-request-id": requestId,
          "x-ka-role": "admin", "x-ka-workspace-id": "forged", ...options.headers },
        ...(method === "GET" || method === "HEAD" ? {} : { body: options.body ?? "{}" }),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  it("202 matches arch fixture exactly and only approved Session context reaches repository", async () => {
    const state = await start(), result = await state.call();
    expect(result.status).toBe(202); expect(result.body).toEqual(fixture("etl-run-rerun"));
    expect(etlRunRerunResponseSchema.safeParse(result.body).success).toBe(true);
    expect(state.rerun).toHaveBeenCalledWith(auth, data.sourceRunId);
    expect(result.headers.get("x-request-id")).toBe(requestId); expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("409 conflict matches arch text/keys and includes only existing job ID", async () => {
    const state = await start({ failure: new EtlRunRerunError("CONFLICT", data.jobId) });
    const result = await state.call({ headers: { "x-request-id": "fixture-etl-run-rerun-409" } });
    expect(result.status).toBe(409); expect(result.body).toEqual(fixture("etl-run-rerun-conflict"));
  });
  it.each(["viewer", "optimizer", "operator", "lead"])("rejects %s before enqueue", async role => {
    const state = await start({ role }), result = await state.call();
    expect(result.status).toBe(403); expect(result.body.error.code).toBe(role === "viewer" ? "READ_ONLY_ROLE" : "FORBIDDEN");
    expect(state.rerun).not.toHaveBeenCalled();
  });
  it("requires bearer plus Session; forged scope cannot authorize", async () => {
    const state = await start();
    expect((await state.call({ headers: { cookie: "" } })).status).toBe(401);
    // An explicitly present but empty bearer is invalid (403), not absent (401).
    expect((await state.call({ headers: { authorization: "" } })).status).toBe(403);
    expect((await state.call({ headers: { authorization: "Bearer wrong" } })).status).toBe(403);
    expect(state.rerun).not.toHaveBeenCalled();
  });
  it.each(["GET", "PATCH", "PUT", "DELETE", "OPTIONS"])("405 %s without repository", async method => {
    const state = await start(), result = await state.call({ method });
    expect(result.status).toBe(405); expect(result.headers.get("allow")).toBe("POST"); expect(state.rerun).not.toHaveBeenCalled();
  });
  it.each(["01", "0", "1e3", "9223372036854775808", "00000000-0000-4000-8000-000000000e01"])("rejects invalid path ID %s", async id => {
    const state = await start(); expect((await state.call({ id })).status).toBe(400); expect(state.rerun).not.toHaveBeenCalled();
  });
  it.each(["null", "[]", "{", '{"workspaceId":"other"}', '{"credentialOwnerUserId":"other"}'])("rejects body %s", async body => {
    const state = await start(); expect((await state.call({ body })).status).toBe(400); expect(state.rerun).not.toHaveBeenCalled();
  });
  it("rejects query overrides and supports absent body", async () => {
    const state = await start(); expect((await state.call({ search: "?scope=all" })).status).toBe(400);
    expect(state.rerun).not.toHaveBeenCalled(); expect((await state.call({ body: "" })).status).toBe(202);
  });
  it.each([ ["NOT_FOUND",404], ["INVALID_STATE",409], ["SOURCE_UNAVAILABLE",503], ["UPSTREAM_INVALID_RESPONSE",502], ["UPSTREAM_TIMEOUT",504] ] as const)("maps %s with stable envelope", async (code, status) => {
    const result = await (await start({ failure: new EtlRunRerunError(code) })).call();
    expect(result.status).toBe(status); expect(result.body.error).toMatchObject({ code, requestId });
    expect(Object.keys(result.body.error).sort()).toEqual(["code", "message", "requestId", "retryable"]);
  });
  it("missing configuration and corrupt repository returns never become 202", async () => {
    expect((await (await start({ missing: true })).call()).status).toBe(503);
    for (const output of [{ workspaceId: "foreign", data }, { workspaceId: auth.workspaceId, data: { ...data, sourceRunId: "1700" } },
      { workspaceId: auth.workspaceId, data, secret: "synthetic" }]) expect((await (await start({ output })).call()).status).toBe(502);
    const error = await (await start({ failure: new Error("private SQL/token") })).call();
    expect(error.status).toBe(500); expect(JSON.stringify(error.body)).not.toContain("private");
  });
  it("exact response byte cap fails closed", async () => {
    const max = Buffer.byteLength(JSON.stringify(fixture("etl-run-rerun")));
    const state = await start({ max });
    expect((await state.call()).status).toBe(502); expect(state.rerun).not.toHaveBeenCalled();
    expect((await (await start({ max: max+1 })).call()).status).toBe(202);
  });
});
