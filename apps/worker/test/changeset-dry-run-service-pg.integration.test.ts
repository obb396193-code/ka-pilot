import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ChangeSetRepository, runMigrations } from "@ka/db";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ChangeSetDryRunService, type ChangeSetPreflightInput } from "../src/changesets/dry-run-service.js";

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
