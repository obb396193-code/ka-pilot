import { describe, expect, it, vi } from "vitest";
import { BootstrapSeedRepository } from "../src/bootstrap-seed-repository.js";

const id = "00000000-0000-4000-8000-000000000090";
const workspace = "00000000-0000-4000-8000-000000000091";
const actor = "00000000-0000-4000-8000-000000000092";
const input = { identities: [{ id, display_name: "Synthetic" }], workspaces: [{ id: workspace, kind: "personal", name: "Synthetic space" }], memberships: [{ identity_id: id, workspace_id: workspace, user_id: actor, role: "optimizer" }], grants: [{ workspace_id: workspace, media: "KUAISHOU", account_id: "same-id", user_id: actor }] };
function setup(overrides: Record<string, Record<string, unknown>[]> = {}) {
  const defaults: Record<string, Record<string, unknown>[]> = {
    identity: [{ id, display_name: "Synthetic", is_active: true }],
    workspace: [{ id: workspace, name: "Synthetic space", kind: "personal", is_active: true }],
    member: [{ workspace_id: workspace, identity_id: id, user_id: actor, role: "optimizer", is_active: true }],
    actor: [{ id: actor, workspace_id: workspace, role: "optimizer", is_active: true }],
    "grant-member": [{ workspace_id: workspace, identity_id: id, user_id: actor, role: "optimizer", is_active: true }],
    "personal-count": [{ workspace_id: workspace }], "shared-count": [{ identity_id: id }],
  };
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    void _values;
    const marker = /\/\* bootstrap-([a-z-]+) \*\//.exec(sql)?.[1];
    return { rows: marker ? (overrides[marker] ?? defaults[marker] ?? []) : [], rowCount: sql.startsWith("INSERT") ? 1 : 0 };
  });
  const release = vi.fn(); const connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect, repository: new BootstrapSeedRepository({ connect }) };
}
describe("bootstrap transaction boundary (mock SQL, not PG)", () => {
  it("uses a serializable locked transaction and never updates existing metadata", async () => {
    const h = setup(); await h.repository.seed(input);
    const sql = h.query.mock.calls.map(([sql]) => sql);
    expect(sql[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(sql.join("\n")).toContain("pg_advisory_xact_lock");
    expect(sql.some((text) => /^UPDATE |^DELETE /.test(text))).toBe(false);
    expect(sql.at(-1)).toBe("COMMIT"); expect(h.release).toHaveBeenCalledWith(false);
    const accountInsert = h.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO accounts"));
    expect(accountInsert?.[0]).toContain("status"); expect(accountInsert?.[0]).toContain("NULL");
    expect(accountInsert?.[1]).toEqual([workspace, "KUAISHOU", "same-id"]);
    expect(sql.filter((text) => /bootstrap-(personal|shared)-count/.test(text)).every((text) => text.includes("LIMIT 2"))).toBe(true);
  });
  it.each([
    { identity: [] }, { identity: [{ id, is_active: false }] },
    { workspace: [{ id: workspace, kind: "team", name: "Synthetic space", is_active: true }] },
    { actor: [{ id: actor, workspace_id: id, role: "optimizer", is_active: true }] },
    { member: [{ workspace_id: workspace, identity_id: id, user_id: actor, role: "admin", is_active: true }] },
    { "personal-count": [{}, {}] }, { "shared-count": [{}, {}] },
    { "grant-member": [] }, { "grant-member": [{}, {}] },
  ])("rolls back bad authority chain %j", async (overrides) => {
    const h = setup(overrides);
    await expect(h.repository.seed(input)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK"); expect(h.release).toHaveBeenCalledWith(false);
  });
  it("rejects malformed input before connecting", async () => {
    const h = setup(); await expect(h.repository.seed({ ...input, password: "secret" })).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.connect).not.toHaveBeenCalled();
  });
  it("rejects grant overflow before commit instead of creating an unusable session", async () => {
    const h = setup({ "grant-count": Array.from({ length: 1001 }, () => ({})) });
    await expect(h.repository.seed(input)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("bounded retries only after successfully rolling back retryable DB conflicts", async () => {
    const h = setup(); h.query.mockRejectedValueOnce({ code: "40001", message: "private SQL" });
    await h.repository.seed(input); expect(h.connect).toHaveBeenCalledTimes(2);
  });
  it("destroys the client if rollback fails instead of retrying it", async () => {
    const h = setup(); h.query.mockRejectedValue({ code: "40001" });
    await expect(h.repository.seed(input)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.connect).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledWith(true);
  });
});
