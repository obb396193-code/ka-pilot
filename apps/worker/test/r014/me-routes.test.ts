import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { createMeRoutes } from "../../src/r014/me-routes.js";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

describe("R-014 me routes (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const workspaces: string[] = [];
  let auth: { workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal"; scope: { kind: "explicit_accounts"; accounts: never[] } };

  const call = (pathname: string, method: string, body?: unknown, search = ""): Promise<Captured> =>
    callRoute(auth, pathname, method, body, search);

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createMeRoutes(pool));
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r014-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    auth = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      await pool.query("DELETE FROM saved_views WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM user_watchlists WHERE workspace_id=$1", [workspaceId]);
      await pool.query(
        "DELETE FROM identity_preferences WHERE identity_id IN (SELECT identity_id FROM workspace_memberships WHERE workspace_id=$1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("claims exactly the R-014 paths and nothing else", () => {
    for (const pathname of ["/api/v1/me/preferences", "/api/v1/me/watchlist", "/api/v1/me/views",
      "/api/v1/me/counts", "/api/v1/me/workload", "/api/v1/me/notifications", "/api/v1/me/notifications/read"]) {
      expect(findR014Route(pathname), pathname).not.toBeNull();
    }
    for (const pathname of ["/api/v1/query", "/api/v1/accounts", "/healthz", "/api/v1/me"]) {
      expect(findR014Route(pathname), pathname).toBeNull();
    }
  });

  it("serves preferences and patches only what was sent", async () => {
    const first = await call("/api/v1/me/preferences", "GET");
    expect(first.status).toBe(200);
    expect((first.body as { data: unknown }).data).toEqual({ theme: { mode: "bw" }, locale: null, updatedAt: null });
    const patched = await call("/api/v1/me/preferences", "PATCH", { theme: { mode: "full", hue: "#112233" } });
    expect(patched.status).toBe(200);
    expect((patched.body as { data: { theme: unknown } }).data.theme).toEqual({ mode: "full", hue: "#112233" });
  });

  it("rejects a disallowed method with 405 and a stable envelope", async () => {
    const result = await call("/api/v1/me/counts", "DELETE");
    expect(result.status).toBe(405);
    expect(result.body).toEqual({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Only GET is supported", retryable: false, requestId: "test-request" },
    });
  });

  it("maps a repository rejection to 400 without leaking internals", async () => {
    const result = await call("/api/v1/me/preferences", "PATCH", { theme: { mode: "neon" } });
    expect(result.status).toBe(400);
    const error = (result.body as { error: { message: string } }).error;
    expect(error.message).toBe("The request is not valid");
    expect(JSON.stringify(result.body)).not.toMatch(/select|insert|zod|stack/i);
  });

  it("round-trips the watchlist and refuses a non-array payload", async () => {
    expect((await call("/api/v1/me/watchlist", "GET")).body).toMatchObject({ data: { items: [] } });
    const saved = await call("/api/v1/me/watchlist", "PUT", { items: [] });
    expect(saved.status).toBe(200);
    const bad = await call("/api/v1/me/watchlist", "PUT", { items: "nope" });
    expect(bad.status).toBe(400);
  });

  it("creates, lists, patches and deletes a saved view", async () => {
    const created = await call("/api/v1/me/views", "POST", {
      page: "data.table", name: "循环测试视图", config: { version: "view/v1" },
    });
    expect(created.status).toBe(200);
    const id = (created.body as { data: { id: string } }).data.id;
    expect((await call("/api/v1/me/views", "GET", undefined, "?page=data.table")).body)
      .toMatchObject({ data: { items: [{ id }] } });
    expect((await call(`/api/v1/me/views/${id}`, "PATCH", { isShared: true })).status).toBe(200);
    const removed = await call(`/api/v1/me/views/${id}`, "DELETE");
    expect(removed.status).toBe(204);
    expect(removed.body).toBeUndefined();
    expect((await call(`/api/v1/me/views/${id}`, "DELETE")).status).toBe(404);
  });

  it("serves counts with absent-table sources treated as zero, not as unknown", async () => {
    const result = await call("/api/v1/me/counts", "GET");
    expect(result.status).toBe(200);
    const data = (result.body as { data: Record<string, unknown> }).data;
    // approvals / dispatches 表还没建 → 系统里根本没有这种对象，计数确实是 0。
    expect(data.approvalsToApprove).toBe(0);
    expect(data.dispatchesReceived).toBe(0);
    expect(data.workItems).toEqual({ open: 0, p0: 0, p1: 0, opportunity: 0 });
  });

  it("never invents a load score and never claims an on-call shift it cannot see", async () => {
    const data = ((await call("/api/v1/me/workload", "GET")).body as { data: Record<string, unknown> }).data;
    expect(data.loadScore).toEqual({ value: { value: null, state: "undefined" }, source: "not_configured", formula: null });
    expect(data.oncall).toEqual({ today: false, next: null });
  });

  it("marks notifications read and keeps the theme preference intact", async () => {
    const read = await call("/api/v1/me/notifications/read", "POST", {});
    expect(read.status).toBe(200);
    expect((read.body as { data: { unread: number } }).data.unread).toBe(0);
    // 已读态与主题共用一份 JSONB：写已读不能把主题冲掉。
    const prefs = ((await call("/api/v1/me/preferences", "GET")).body as { data: { theme: unknown } }).data;
    expect(prefs.theme).toEqual({ mode: "full", hue: "#112233" });
  });
});
