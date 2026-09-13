import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { SettingsChangeLogRepository } from "../src/settings-change-log-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000001", userId = "00000000-0000-4000-8000-000000000002";
const auth = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
const row = { workspace_id: workspaceId, id: "1", at: "2026-09-01T01:00:00.000001Z", kind: "assessment_price",
  task_id: "task-a", media: null, old_value: null, new_value: 38, effective_date: "2026-09-01", changed_by: userId, actor_name: "Synthetic",
  evidence_url: null, op: "set" };
function setup(rows: unknown[] = [row]) {
  const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes("change-log-live-authority") ? [{ allowed: true }]
    : sql.includes("change-log-page") ? rows : [] })), on: vi.fn(), removeListener: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  return { client, pool, repository: new SettingsChangeLogRepository(pool as unknown as Pool) };
}
describe("P194 readonly change log repository boundaries", () => {
  it("uses one RR/RO snapshot and passes tuple scope only as parameters", async () => {
    const s = setup(), result = await s.repository.page(auth, { kinds: ["assessment_price"], task_id: "task-a", media: "KUAISHOU" }, "2026-09-13");
    expect(result.data.items[0]).toMatchObject({ oldValue: null, newValue: 38 });
    expect(result.workspaceId).toBe(workspaceId);
    expect(s.client.query.mock.calls[0]?.[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(s.client.query).toHaveBeenLastCalledWith("COMMIT");
    const call = s.client.query.mock.calls.find(args => args[0].includes("change-log-page"))!;
    expect(call[0]).toContain("scoped.media = linked.media");
    expect(s.pool.connect).toHaveBeenCalledTimes(1);
    expect(s.client.release).toHaveBeenCalledWith(false);
  });
  it.each([{ media: "bad;sql" }, { workspaceId }, { cursor: "bad" }, { kinds: ["invented"] }])("rejects malformed input before IO %j", async input => {
    const s = setup();
    await expect(s.repository.page(auth, input, "2026-09-13")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(s.pool.connect).not.toHaveBeenCalled();
  });
  it("does not use coefficient effective_date as a fabricated modification timestamp", async () => {
    const s = setup([{ ...row, kind: "channel_coefficient", at: null, task_id: null, media: "KUAISHOU", new_value: { op: "multiply", coefficient: 0.8 } }]);
    await expect(s.repository.page(auth, { kinds: ["channel_coefficient"] }, "2026-09-13")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(s.client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it.each([{ new_value: "NaN" }, { new_value: "Infinity" }, { new_value: "bad" }, { workspace_id: userId }, { effective_date: "2026-02-31" },
    { changed_by: "not-uuid", actor_name: null }, { changed_by: null, actor_name: 123 }, { changed_by: undefined }, { actor_name: undefined }, { new_value: undefined }, { old_value: undefined }])("fails closed on present-invalid DB output %j", async patch => {
    const s = setup([{ ...row, ...patch }]);
    await expect(s.repository.page(auth, { kinds: ["assessment_price"] }, "2026-09-13")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(s.client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("accepts missing actor join as null without losing the actual version", async () => {
    const s = setup([{ ...row, actor_name: null }]);
    expect((await s.repository.page(auth, { kinds: ["assessment_price"] }, "2026-09-13")).data.items[0]?.changedBy).toBeNull();
  });
  it("preserves explicit revoke rather than showing the stored copied price as a new effective price", async () => {
    const s = setup([{ ...row, op: "revoke", new_value: null }]);
    expect((await s.repository.page(auth, { kinds: ["assessment_price"] }, "2026-09-13")).data.items[0]).toMatchObject({ id: "assessment_price:1", op: "revoke", newValue: null });
  });
  it("sanitizes database failure", async () => {
    const s = setup(); s.pool.connect.mockRejectedValue(new Error("SELECT secret FROM private"));
    await expect(s.repository.page(auth, { kinds: ["assessment_price"] }, "2026-09-13")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "Change log SOURCE_UNAVAILABLE" });
  });
  it.each([{}, { ...auth, workspaceKind: "team" }])("rejects invalid approved context before IO", async context => {
    const s = setup();
    await expect(s.repository.page(context, {}, "2026-09-13")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.pool.connect).not.toHaveBeenCalled();
  });
  it("rejects impossible business date before IO", async () => {
    const s = setup();
    await expect(s.repository.page(auth, {}, "2026-02-31")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(s.pool.connect).not.toHaveBeenCalled();
  });
  it.each(["a+/=", "e31", Buffer.from("not-json").toString("base64url"), Buffer.from('{"v":2}').toString("base64url")])("rejects noncanonical/invalid cursor %s", async cursor => {
    const s = setup();
    await expect(s.repository.page(auth, { cursor }, "2026-09-13")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(s.pool.connect).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [{ allowed: false }] }, { rows: [{ allowed: true }, { allowed: true }] }])("requires exactly one live authority row", async ({ rows }) => {
    const s = setup();
    s.client.query.mockImplementation(async sql => ({ rows: sql.includes("change-log-live-authority") ? rows : [] }));
    await expect(s.repository.page(auth, {}, "2026-09-13")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(s.client.query.mock.calls.some(([sql]) => sql.includes("change-log-page"))).toBe(false);
  });
  it.each(["57014", "55P03"])("classifies statement/lock timeout %s without diagnostic leakage", async code => {
    const s = setup(); s.pool.connect.mockRejectedValue({ code, message: "synthetic-private-diagnostic" });
    await expect(s.repository.page(auth, {}, "2026-09-13")).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", message: "Change log UPSTREAM_TIMEOUT" });
  });
  it.each([{ id: "0" }, { at: "2026-09-01T99:00:00.000000Z" }, { kind: "unknown" }, { media: "KUAISHOU" }, { kind: "channel_coefficient", media: "KUAISHOU" }])("rejects invalid internal row position/identity %j", async patch => {
    const s = setup([{ ...row, ...patch }]);
    await expect(s.repository.page(auth, {}, "2026-09-13")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("validates all 51 rows including the unseen sentinel and rejects an oversized page", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({ ...row, id: String(index + 1) }));
    for (const values of [[...rows.slice(0, 50), { ...rows[50], new_value: "bad" }], [...rows, row]]) {
      await expect(setup(values).repository.page(auth, {}, "2026-09-13")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    }
    const s = setup(rows);
    const first = await s.repository.page(auth, {}, "2026-09-13");
    expect(first.data.items).toHaveLength(50); expect(first.data.nextCursor).not.toBeNull();
    await s.repository.page(auth, { cursor: first.data.nextCursor }, "2026-09-13");
    expect(s.client.query.mock.calls.filter(([sql]) => sql.includes("change-log-page"))).toHaveLength(2);
  });
});
