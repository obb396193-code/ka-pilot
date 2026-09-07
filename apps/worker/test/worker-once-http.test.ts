import { once } from "node:events";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerOnceHttpServer, parseWorkerOnceHttpConfig, type WorkerOnceHttpOptions } from "../src/scheduling/worker-once-http.js";

const token = "synthetic-worker-trigger-token-00000001";
const ready = { status: "completed", jobs: { leased: 2, done: 1, failed: 1 } };
const env = { DATABASE_URL: "postgres://synthetic.invalid/test", QIHANG_BASE_URL: "https://synthetic.invalid/get_data",
  WORKER_ONCE_WORKSPACE_ID: "00000000-0000-4000-8000-000000000101", WORKER_ONCE_MEDIA: "KUAISHOU", WORKER_TRIGGER_TOKEN: token };
const servers: Server[] = [];
async function setup(run = vi.fn(async (): Promise<unknown> => ready), acquireLock: WorkerOnceHttpOptions["acquireLock"] = vi.fn(async () => vi.fn(async () => undefined))) {
  const server = createWorkerOnceHttpServer({ token, run, acquireLock }); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
  return { base: `http://127.0.0.1:${address.port}`, server, run, acquireLock };
}
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
const post = (base: string, init: RequestInit = {}) => fetch(`${base}/internal/worker/once`, { method: "POST", headers: { "X-Worker-Trigger-Token": token }, ...init });

describe("worker HTTP frozen trigger boundary", () => {
  it("defaults to a localhost listener, but requires explicit source/scope and a nonempty secret", () => {
    expect(parseWorkerOnceHttpConfig(env)).toMatchObject({ host: "127.0.0.1", port: 3102, token, worker: { maxMs: 600000 } });
    for (const value of [undefined, "", "short", `${token}\n`]) expect(() => parseWorkerOnceHttpConfig({ ...env, WORKER_TRIGGER_TOKEN: value })).toThrow();
    expect(() => parseWorkerOnceHttpConfig({ ...env, WORKER_HTTP_PORT: "0" })).toThrow();
    expect(() => parseWorkerOnceHttpConfig({ ...env, NODE_ENV: "production", KA_DATA_DEV_ANY: "" })).toThrow();
  });
  it("health never triggers work; success uses canonical counts and requestId header", async () => {
    const s = await setup(); expect((await fetch(`${s.base}/health`)).status).toBe(200); expect(s.run).not.toHaveBeenCalled();
    const response = await post(s.base, { headers: { "X-Worker-Trigger-Token": token, "x-request-id": "worker-test-123" } });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("worker-test-123"); expect(await response.json()).toEqual(ready);
    expect(s.run).toHaveBeenCalledTimes(1); expect(s.acquireLock).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { "X-Worker-Trigger-Token": "wrong" }])("unauthorized callers cannot inspect busy state or trigger work", async (headers) => {
    const s = await setup(); const response = await post(s.base, { headers });
    expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED", requestId: expect.any(String) } });
    expect(s.run).not.toHaveBeenCalled(); expect(s.acquireLock).not.toHaveBeenCalled();
  });
  it("duplicate token headers are rejected even when both values match", async () => {
    const s = await setup();
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${s.base}/internal/worker/once`, { method: "POST", headers: { "X-Worker-Trigger-Token": [token, token] } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    expect(status).toBe(401); expect(s.run).not.toHaveBeenCalled();
  });
  it("rejects methods, query scope and body overrides; empty JSON is allowed", async () => {
    const s = await setup();
    expect((await post(s.base, { method: "GET" })).status).toBe(405);
    expect((await fetch(`${s.base}/internal/worker/once?workspaceId=other`, { method: "POST", headers: { "X-Worker-Trigger-Token": token } })).status).toBe(400);
    for (const body of ['{"workspaceId":"other"}', "[]", "null", "bad", " ".repeat(1024)]) expect((await post(s.base, { body })).status).toBe(400);
    expect(s.run).not.toHaveBeenCalled();
    expect((await post(s.base, { body: "{}", headers: { "X-Worker-Trigger-Token": token, "x-ka-workspace-id": "foreign" } })).status).toBe(200);
    expect(s.run.mock.calls[0]).toHaveLength(1); // signal only; no browser input forwarded
  });
  it("single flight remains busy until the run finishes, then permits another run", async () => {
    let finish!: (value: typeof ready) => void;
    const run = vi.fn(() => new Promise<typeof ready>((resolve) => { finish = resolve; })); const s = await setup(run);
    const first = post(s.base); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const busy = await post(s.base); expect(busy.status).toBe(409); expect(await busy.json()).toMatchObject({ error: { code: "WORKER_BUSY" } });
    finish(ready); expect((await first).status).toBe(200);
    run.mockResolvedValue(ready); expect((await post(s.base)).status).toBe(200);
  });
  it("distributed lock refusal returns busy without running", async () => {
    const s = await setup(undefined, vi.fn(async () => null));
    expect((await post(s.base)).status).toBe(409); expect(s.run).not.toHaveBeenCalled();
  });
  it.each(["budget", "blocked_auth"])("preserves %s, not a generic failed response", async (status) => {
    const s = await setup(vi.fn(async () => ({ status, jobs: { leased: 0, done: 0, failed: 0 } })));
    const response = await post(s.base); expect(response.status).toBe(200); expect(await response.json()).toEqual({ status, jobs: { leased: 0, done: 0, failed: 0 } });
  });
  it("always releases the lock on failure, sanitizes errors, and can recover", async () => {
    const release = vi.fn(async () => undefined), run = vi.fn(async (): Promise<unknown> => { throw new Error(`secret ${token} SQL private`); });
    const s = await setup(run, vi.fn(async () => release)); const response = await post(s.base);
    expect(response.status).toBe(500); const body = await response.text(); expect(body).not.toContain(token); expect(body).not.toContain("SQL"); expect(release).toHaveBeenCalledTimes(1);
    run.mockResolvedValue(ready); expect((await post(s.base)).status).toBe(200);
  });
  it("malformed runner data is rejected rather than serialized to the client", async () => {
    const s = await setup(vi.fn(async () => ({ ...ready, private: token })));
    const response = await post(s.base); expect(response.status).toBe(502); expect(await response.text()).not.toContain(token);
  });
  it("regenerates unsafe correlation IDs and refuses unknown routes", async () => {
    const s = await setup(); const response = await post(s.base, { headers: { "X-Worker-Trigger-Token": token, "x-request-id": "a".repeat(200) } });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect((await fetch(`${s.base}/api/v1/changesets/execute`, { method: "POST" })).status).toBe(404); expect(s.run).toHaveBeenCalledTimes(1);
  });
  it("aborts a running round on shutdown and releases only after the runner settles", async () => {
    const controller = new AbortController(), release = vi.fn(async () => undefined);
    let settled!: () => void;
    const run = vi.fn((signal: AbortSignal) => new Promise<unknown>((resolve) => {
      signal.addEventListener("abort", () => { settled = () => resolve({ status: "aborted", jobs: { leased: 0, done: 0, failed: 0 } }); });
    }));
    const server = createWorkerOnceHttpServer({ token, run, signal: controller.signal, acquireLock: async () => release }); servers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listener");
    const first = post(`http://127.0.0.1:${address.port}`); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    controller.abort(); expect(release).not.toHaveBeenCalled(); settled();
    expect((await first).status).toBe(503); expect(release).toHaveBeenCalledTimes(1);
  });
});
