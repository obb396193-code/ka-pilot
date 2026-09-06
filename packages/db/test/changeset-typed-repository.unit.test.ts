import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ChangeSetRepository, type NewChangeSet } from "../src/changeset-repository.js";

const ws = "00000000-0000-4000-8000-000000000001", user = "00000000-0000-4000-8000-000000000002";
const value = { type: "number" as const, value: 1 };
const input: NewChangeSet = { workspaceId: ws, media: "KUAISHOU", accountId: "synthetic", initiator: user, credentialOwnerUserId: user,
  title: "synthetic typed draft", ttlExpireAt: new Date("2026-09-07T00:00:00Z"), reasonCode: "test",
  items: [{ targetType: "unit", targetId: "synthetic-unit", field: "bid", fromValue: value, toValue: { type: "boolean", value: false } }] };

function setup(options: { old?: unknown; failInsert?: boolean } = {}) {
  const header = { id: "00000000-0000-4000-8000-000000000003", workspace_id: ws, media: "KUAISHOU", account_id: "synthetic",
    status: "draft", initiator: user, credential_owner_user_id: user, ttl_expire_at: input.ttlExpireAt, created_at: new Date() };
  const row = { id: 1, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", target_type: "unit", target_id: "synthetic-unit", field: "bid",
    from_value: "old" in options ? options.old : value, to_value: { type: "boolean", value: false }, item_status: "pending", fail_reason: null };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO changeset_items")) {
      if (options.failInsert) throw new Error("test database error");
      row.from_value = JSON.parse(params[7] as string);
      row.to_value = JSON.parse(params[8] as string);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM changeset_items")) return { rows: [row], rowCount: 1 };
    if (sql.includes("FROM workspaces") || sql.includes("FROM users")) return { rows: [{ id: user }], rowCount: 1 };
    if (sql.includes("changesets")) return { rows: [header], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  const repository = new ChangeSetRepository({ query, connect } as unknown as Pool);
  return { repository, query, connect, release };
}

describe("typed changeset JSONB repository boundary (mock SQL, not PG)", () => {
  it("writes typed objects as JSONB, reads them back and commits last", async () => {
    const context = setup();
    const created = await context.repository.create(input);
    expect(created.items[0]).toMatchObject({ fromValue: value, toValue: { type: "boolean", value: false } });
    const call = context.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO changeset_items"))!;
    expect(call[0]).toContain("$8::jsonb,$9::jsonb");
    expect(call[0]).not.toContain("to_jsonb");
    expect(JSON.parse(call[1]![7] as string)).toEqual(value);
    expect(context.query.mock.calls.at(-1)![0]).toBe("COMMIT");
    expect(context.release).toHaveBeenCalledOnce();
  });
  it.each([null, "001", "true", '{"x":1}', { type: "number", value: "1" }])("rejects legacy/present-invalid output %j", async (old) => {
    await expect(setup({ old }).repository.find(ws, "synthetic")).rejects.toThrow("invalid or legacy untyped values");
  });
  it.each([null, "1", { type: "number", value: NaN }])("rejects an invalid second item before any DB access %j", async (bad) => {
    const context = setup();
    await expect(context.repository.create({ ...input, items: [...input.items, { ...input.items[0]!, field: "other", fromValue: bad }] } as NewChangeSet)).rejects.toThrow();
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("rejects duplicate target fields before DB access", async () => {
    const context = setup();
    await expect(context.repository.create({ ...input, items: [...input.items, ...input.items] })).rejects.toThrow("Duplicate");
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("rejects empty draft items before DB access", async () => {
    const context = setup();
    await expect(context.repository.create({ ...input, items: [] })).rejects.toThrow("at least one item");
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("snapshots JSON before awaiting DB access so caller mutation cannot change a checked draft", async () => {
    const context = setup(), original = { amount: 1 };
    const supplied: NewChangeSet = { ...input, items: [{ ...input.items[0]!, fromValue: { type: "json", value: original } }] };
    const pending = context.repository.create(supplied);
    original.amount = 999;
    const saved = await pending;
    expect(saved.items[0]!.fromValue).toEqual({ type: "json", value: { amount: 1 } });
  });
  it("rolls back and releases on a failed item insert", async () => {
    const context = setup({ failInsert: true });
    await expect(context.repository.create(input)).rejects.toThrow("test database error");
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(context.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(context.release).toHaveBeenCalledOnce();
  });
});
