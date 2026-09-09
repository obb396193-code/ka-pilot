import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { QihangIdentitySeedRepository } from "../src/qihang-identity-seed-repository.js";

const input = { workspace_id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-4000-8000-000000000002", qihang_user_id: "synthetic-private" };
function fixture(rows: unknown[] = [{ id: input.user_id, qihang_user_id: null }]) {
  const query = vi.fn(async (sql: string): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: sql.includes("SELECT actor") ? rows : [], rowCount: 1 }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect, repository: new QihangIdentitySeedRepository({ connect } as unknown as Pool) };
}
describe("Qihang identity binding database boundary", () => {
  it("rejects invalid input and non-boolean force before DB", async () => {
    const f = fixture();
    await expect(f.repository.bind({ ...input, role: "admin" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(f.repository.bind(input, "true" as unknown as boolean)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([[], [{ id: input.user_id, qihang_user_id: null }, { id: input.user_id, qihang_user_id: null }]].map(rows => [rows]))("missing or ambiguous actor fails closed", async rows => {
    const f = fixture(rows);
    await expect(f.repository.bind(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(f.query).toHaveBeenCalledWith("ROLLBACK"); expect(f.release).toHaveBeenCalledWith(false);
  });
  it("rejects corrupt present identity", async () => {
    const f = fixture([{ id: input.user_id, qihang_user_id: 123 }]);
    await expect(f.repository.bind(input)).rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });
  it("rolls back if the actor was not updated exactly once", async () => {
    const f = fixture();
    f.query.mockImplementation(async sql => ({ rows: sql.includes("SELECT actor") ? [{ id: input.user_id, qihang_user_id: null }] : [], rowCount: sql.startsWith("UPDATE") ? 0 : 1 }));
    await expect(f.repository.bind(input)).rejects.toMatchObject({ code: "DATABASE_ERROR" });
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("destroys a broken rollback connection without leaking the original error", async () => {
    const f = fixture(); f.query.mockRejectedValue(new Error("private-db-url synthetic-private"));
    await expect(f.repository.bind(input)).rejects.toThrow(/^Qihang identity seed failed: DATABASE_ERROR$/);
    expect(f.release).toHaveBeenCalledWith(true);
  });
  it("sanitizes connect failure without attempting release", async () => {
    const f = fixture(); f.connect.mockRejectedValue(new Error("private-db-url"));
    await expect(f.repository.bind(input)).rejects.toThrow(/^Qihang identity seed failed: DATABASE_ERROR$/);
    expect(f.release).not.toHaveBeenCalled();
  });
});
