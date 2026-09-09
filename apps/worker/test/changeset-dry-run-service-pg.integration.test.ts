import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ChangeSetRepository, runMigrations } from "@ka/db";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ChangeSetDryRunService, type ChangeSetPreflightInput } from "../src/changesets/dry-run-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders } from "./business-auth-fixtures.js";

// Explicit local, synthetic-only DB. Never fall back to shared /ka or live source.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local test database required");

describe("dry-run service to actual PG (synthetic preflight port, no media)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const store = new ChangeSetRepository(pool);
  const workspaceId = randomUUID(), other = randomUUID(), userId = randomUUID(), otherUser = randomUUID();
  const now = new Date("2026-09-08T00:00:00Z"), expires = new Date("2026-09-08T00:10:00Z");
  const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "preview" }] } };
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    for (const ws of [workspaceId, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic preflight')", [ws]);
      await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic')", [ws === workspaceId ? userId : otherUser, ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
    }
  }, 30000);
  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM execution_runs r USING changesets c WHERE r.changeset_id=c.id AND c.workspace_id=ANY($1::uuid[])`, [[workspaceId, other]]);
      for (const table of ["jobs", "changeset_items", "changesets", "accounts", "users"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[workspaceId, other]]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[workspaceId, other]]);
    } finally { await pool.end(); }
  });
  const create = (media = "KUAISHOU", ws = workspaceId) => store.create({ workspaceId: ws, media, accountId: "same", title: "synthetic dry-run",
    initiator: ws === workspaceId ? userId : otherUser, credentialOwnerUserId: ws === workspaceId ? userId : otherUser,
    ttlExpireAt: expires, reasonCode: "synthetic", items: [{ targetType: "unit", targetId: "u1", field: "bid",
      fromValue: { type: "number", value: 30 }, toValue: { type: "number", value: 29 } }] });
  function evidence(input: ChangeSetPreflightInput, status: "success" | "unknown" = "success") {
    return { workspaceId: input.workspaceId, media: input.media, accountId: input.accountId,
      credentialOwnerUserId: input.credentialOwnerUserId, draftHash: input.draftHash,
      items: input.items.map(item => ({ itemId: item.id, status, failReason: status === "success" ? null : "SOURCE_UNAVAILABLE" })) };
  }
  const runs = async (id: string) => (await pool.query("SELECT attempt,status,dry_run FROM execution_runs WHERE changeset_id=$1 ORDER BY attempt", [id])).rows;

  it("public observations are persisted with the same run; changed and unknown clear proof without jobs", async () => {
    const draft = await create();
    let verdict: "ok" | "changed" | "unknown" = "ok";
    const service = new ChangeSetDryRunService({ store, now: () => now, preflight: { check: async input => ({
      ...evidence(input), dataAsOf: null, items: input.items.map(item => ({ itemId: item.id,
        status: verdict === "ok" ? "success" : verdict === "unknown" ? "unknown" : "failed",
        failReason: verdict === "ok" ? null : verdict === "unknown" ? "UNKNOWN_RESULT" : "FROM_VALUE_CHANGED",
        observed: verdict === "unknown" ? null : { type: "number", value: verdict === "ok" ? 30 : 35 } })) }) } });
    for (const next of ["ok", "changed", "unknown"] as const) {
      verdict = next; const result = await service.preview(draft.id, auth);
      expect(result.data.items[0]!.verdict).toBe(next); expect(result.data.confirmAllowed).toBe(false); // preview-only grant
      const row = (await pool.query("SELECT dry_run,result_payload FROM execution_runs WHERE id=$1 AND changeset_id=$2", [result.data.executionRunId, draft.id])).rows[0];
      expect(row.dry_run).toBe(true); expect(row.result_payload.observations).toEqual({ checkedAt: now.toISOString(), dataAsOf: null, items: result.data.items });
      const header = (await pool.query("SELECT status,dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [draft.id])).rows[0];
      expect(header.status).toBe("draft"); expect(header.confirm_hash).toBeNull();
      expect(header.dry_run_hash).toBe(next === "ok" ? result.data.hash : null);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("rejects observation injection against a locked draft without a persisted partial run", async () => {
    const draft = await create(), prepared = await store.prepareDryRun({ workspaceId, changeSetId: draft.id, now });
    const item = draft.items[0]!;
    await expect(store.recordDryRun({ workspaceId, changeSetId: draft.id, now, expectedHash: prepared.hash,
      items: [{ itemId: item.id, status: "success" }], observations: { checkedAt: now.toISOString(), dataAsOf: null,
        items: [{ itemId: String(item.id), targetType: "unit", targetId: "outside", field: "bid", fromValue: item.fromValue,
          toValue: item.toValue, observed: item.fromValue, verdict: "ok", reason: null }] } })).rejects.toThrow("Invalid dry-run observations");
    expect(await runs(draft.id)).toEqual([]);
    expect((await pool.query("SELECT dry_run_hash FROM changesets WHERE id=$1", [draft.id])).rows[0].dry_run_hash).toBeNull();
  });

  it("source-off actual HTTP to PG checks personal draft but writes no run, proof or job", async () => {
    const draft = await create(), foreignMedia = await create("TENCENT"), foreignWorkspace = await create("KUAISHOU", other);
    const token = "synthetic-d6-pg-internal-token-long-enough";
    const absent = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const server = createDataApiServer({ service: absent, detailService: absent, taskListService: absent,
      accountListService: absent, workItemListService: absent, internalToken: token, sessionAuthService: approvedSessionAuth(auth),
      dryRunService: new ChangeSetDryRunService({ store, now: () => now }) } as unknown as DataApiServerOptions);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
      for (const [target, expected] of [[draft.id, 503], [foreignMedia.id, 403], [foreignWorkspace.id, 404]] as const) {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/changesets/${target}/dry-run`, { method: "POST",
          headers: { ...businessHeaders(token), "x-request-id": "d6-pg", "x-ka-account-scope": "*" }, body: "{}" });
        expect(response.status).toBe(expected); expect((await response.json()).error.requestId).toBe("d6-pg");
        expect(await runs(target)).toEqual([]);
      }
      expect((await pool.query("SELECT status,dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [draft.id])).rows[0])
        .toEqual({ status: "draft", dry_run_hash: null, confirm_hash: null });
      expect((await pool.query("SELECT COUNT(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });

  it("observed HTTP results match real PG snapshots and never enqueue media execution", async () => {
    const draft = await create(), foreignMedia = await create("TENCENT"), foreignWorkspace = await create("KUAISHOU", other);
    let state: "ok" | "changed" | "unknown" = "ok";
    const check = vi.fn(async (input: ChangeSetPreflightInput) => ({ ...evidence(input), dataAsOf: null,
      items: input.items.map(item => ({ itemId: item.id,
        status: state === "ok" ? "success" : state === "changed" ? "failed" : "unknown",
        failReason: state === "ok" ? null : state === "changed" ? "FROM_VALUE_CHANGED" : "UNKNOWN_RESULT",
        observed: state === "unknown" ? null : { type: "number", value: state === "ok" ? 30 : 35 },
      })) })); // Synthetic evidence only; no media transport is injected.
    const token = "synthetic-observed-pg-internal-token-long-enough";
    const absent = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const server = createDataApiServer({ service: absent, detailService: absent, taskListService: absent,
      accountListService: absent, workItemListService: absent, internalToken: token, sessionAuthService: approvedSessionAuth(auth),
      dryRunService: new ChangeSetDryRunService({ store, now: () => now, preflight: { check } }) } as unknown as DataApiServerOptions);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
      const call = (id: string) => fetch(`http://127.0.0.1:${address.port}/api/v1/changesets/${id}/dry-run`, { method: "POST",
        headers: { ...businessHeaders(token), "x-request-id": "observed-pg", "x-ka-account-scope": "*" }, body: "{}" });
      for (const verdict of ["ok", "changed", "unknown"] as const) {
        state = verdict; const response = await call(draft.id), body = await response.json();
        expect(response.status).toBe(200); expect(body.meta).toEqual({ requestId: "observed-pg", dataAsOf: null,
          businessDate: "2026-09-08", workspaceKind: "personal", selectedSource: "platform" });
        expect(body.data.items[0].verdict).toBe(verdict); expect(body.data.confirmAllowed).toBe(false);
        const row = (await pool.query("SELECT dry_run,result_payload FROM execution_runs WHERE id=$1 AND changeset_id=$2",
          [body.data.executionRunId, draft.id])).rows[0];
        expect(row.dry_run).toBe(true); expect(row.result_payload.observations.items).toEqual(body.data.items);
        expect(row.result_payload.observations.checkedAt).toBe(body.data.checkedAt);
      }
      // Real BFF implementation -> real localhost HTTP -> real PG; only the
      // approved session and media read evidence are synthetic in this harness.
      const { handleR010CommandRequest } = await import(new URL("../../web/lib/data/r010-command-bff.ts", import.meta.url).href);
      const bff = await handleR010CommandRequest(new Request(`https://web.example/api/internal/changesets/${draft.id}/dry-run`, {
        method: "POST", headers: { origin: "https://web.example", "content-type": "application/json",
          cookie: businessHeaders(token).cookie!, "x-ka-account-scope": "*", "x-ka-workspace-id": other }, body: "{}",
      }), { environment: { KA_DATA_BACKEND_ORIGIN: `http://127.0.0.1:${address.port}`, KA_DATA_SERVICE_TOKEN: token },
        requestId: () => "bff-observed-pg" });
      expect(bff.status).toBe(200); expect(bff.body.meta.requestId).toBe("bff-observed-pg");
      expect(bff.body.data.items[0].verdict).toBe("unknown"); expect(bff.body.meta.dataAsOf).toBeNull();
      expect(bff.body.data.confirmAllowed).toBe(false);
      const snapshot = (await pool.query("SELECT result_payload FROM execution_runs WHERE id=$1 AND changeset_id=$2",
        [bff.body.data.executionRunId, draft.id])).rows[0].result_payload.observations;
      expect(snapshot.items).toEqual(bff.body.data.items);
      check.mockClear();
      for (const [id, expected] of [[foreignMedia.id, 403], [foreignWorkspace.id, 404]] as const) {
        expect((await call(id)).status).toBe(expected); expect(await runs(id)).toEqual([]);
      }
      expect(check).not.toHaveBeenCalled();
      expect((await pool.query("SELECT status,dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [draft.id])).rows[0])
        .toEqual({ status: "draft", dry_run_hash: null, confirm_hash: null });
      expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });

  it("success is still draft; repeat has ordered dry attempts; unknown invalidates old proof; no jobs", async () => {
    const draft = await create(); let status: "success" | "unknown" = "success";
    const service = new ChangeSetDryRunService({ store, now: () => now, preflight: { check: async input => evidence(input, status) } });
    const first = await service.run(draft.id, auth);
    await service.run(draft.id, auth);
    expect(await runs(draft.id)).toEqual([{ attempt: 1, status: "success", dry_run: true }, { attempt: 2, status: "success", dry_run: true }]);
    expect((await pool.query("SELECT status,dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [draft.id])).rows[0])
      .toEqual({ status: "draft", dry_run_hash: first.hash, confirm_hash: null });
    status = "unknown";
    expect((await service.run(draft.id, auth)).status).toBe("unknown");
    expect((await pool.query("SELECT dry_run_hash FROM changesets WHERE id=$1", [draft.id])).rows[0].dry_run_hash).toBeNull();
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("same account across media/workspace cannot pass scope or reach preflight", async () => {
    const foreignMedia = await create("TENCENT"), foreignWorkspace = await create("KUAISHOU", other);
    const check = vi.fn(async (input: ChangeSetPreflightInput) => evidence(input));
    const service = new ChangeSetDryRunService({ store, preflight: { check }, now: () => now });
    await expect(service.run(foreignMedia.id, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.run(foreignWorkspace.id, auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(check).not.toHaveBeenCalled();
    expect(await runs(foreignMedia.id)).toEqual([]); expect(await runs(foreignWorkspace.id)).toEqual([]);
  });
  it("a concurrent draft edit after prepare invalidates evidence under record lock", async () => {
    const draft = await create();
    const service = new ChangeSetDryRunService({ store, now: () => now, preflight: { check: async input => {
      await pool.query("UPDATE changeset_items SET to_value=$2::jsonb WHERE changeset_id=$1", [draft.id, JSON.stringify({ type: "number", value: 28 })]);
      return evidence(input);
    } } });
    await expect(service.run(draft.id, auth)).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
    expect(await runs(draft.id)).toEqual([]);
  });
  it("credential owner change cannot reuse an unchanged item/TTL hash", async () => {
    const draft = await create(), replacement = randomUUID();
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic replacement')", [replacement, workspaceId]);
    const service = new ChangeSetDryRunService({ store, now: () => now, preflight: { check: async input => {
      await pool.query("UPDATE changesets SET credential_owner_user_id=$2 WHERE id=$1", [draft.id, replacement]); return evidence(input);
    } } });
    await expect(service.run(draft.id, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await runs(draft.id)).toEqual([]);
  });
  it("expiry during preflight does not persist a success", async () => {
    const draft = await create(); let time = now;
    const service = new ChangeSetDryRunService({ store, now: () => time, preflight: { check: async input => {
      time = expires; return evidence(input);
    } } });
    await expect(service.run(draft.id, auth)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await runs(draft.id)).toEqual([]);
  });
  it("TTL shortened concurrently is a controlled state conflict, not a storage 500", async () => {
    const draft = await create();
    const service = new ChangeSetDryRunService({ store, now: () => now, preflight: { check: async input => {
      await pool.query("UPDATE changesets SET ttl_expire_at=$2 WHERE id=$1", [draft.id, now]); return evidence(input);
    } } });
    await expect(service.run(draft.id, auth)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await runs(draft.id)).toEqual([]);
  });
});
