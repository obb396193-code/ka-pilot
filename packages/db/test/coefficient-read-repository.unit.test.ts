import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { CoefficientReadRepository } from "../src/coefficient-read-repository.js";
const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const date = "2026-09-09";
const row = { workspace_id: auth.workspaceId, id: "9007199254740993", media: "KUAISHOU", op: "multiply", coefficient: "0.7812",
  effective_date: "2026-09-01", changed_by: null, actor_id: null, actor_name: null };
function setup(rows: unknown[] = [row], authorized = true) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => { void values;
    return { rows: sql.includes("coefficient-read-auth") ? (authorized ? [{ allowed: true }] : []) : sql.includes("coefficient-read-versions") ? rows : [] }; });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, connect, release, repo: new CoefficientReadRepository({ connect } as unknown as Pool) };
}
it("rejects unauthorized contexts and invalid filters before connecting", async () => {
  for (const candidate of [null, { ...auth, role: "optimizer" }, { ...auth, userId: "invalid" },
    { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }]) {
    const s = setup(); await expect(s.repo.read(candidate, date)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(s.connect).not.toHaveBeenCalled();
  }
  for (const [day, media] of [["2026-02-31", undefined], [date, "KUAISHOU' OR 1=1"], [date, ""]]) {
    const s = setup(); await expect(s.repo.read(auth, day, media)).rejects.toMatchObject({ code: "INVALID_REQUEST" }); expect(s.connect).not.toHaveBeenCalled();
  }
});
it("uses bound workspace and media in one RR/RO transaction, preserving exact id and unrecorded actor", async () => {
  const s = setup(); const result = await s.repo.read(auth, date, "KUAISHOU");
  expect(result).toMatchObject({ workspaceId: auth.workspaceId, businessDate: date, versions: [{ id: row.id,
    coefficient: 0.7812, current: true, historyCount: 1, actor: { status: "unrecorded" }, evidence: { status: "not_stored" } }] });
  expect(s.query.mock.calls[0]![0]).toContain("REPEATABLE READ READ ONLY");
  const sql = s.query.mock.calls.find(([sql]) => sql.includes("coefficient-read-versions"))!;
  expect(sql[0]).toContain("LIMIT 10001"); expect(sql[0]).toContain('c.media COLLATE "C",c.effective_date DESC,c.id DESC');
  expect(sql[1]).toEqual([auth.workspaceId, "KUAISHOU"]); expect(sql[0]).not.toContain(auth.workspaceId);
  expect(s.query.mock.calls.at(-1)![0]).toBe("COMMIT");
});
it("rejects inactive authorization before reading version rows", async () => {
  const s = setup([], false); await expect(s.repo.read(auth, date)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(s.query.mock.calls.some(([q]) => q.includes("coefficient-read-versions"))).toBe(false);
});
it.each([{ coefficient: "NaN" }, { coefficient: "Infinity" }, { coefficient: "0" }, { coefficient: "bad" },
  { coefficient: null }, { op: "wrong" }, { workspace_id: "foreign" }, { effective_date: "2026-02-31" },
  { id: "9223372036854775808" }, { media: null }, { actor_id: auth.userId, actor_name: null, changed_by: auth.userId }])("rejects invalid stored evidence %j", async patch => {
  await expect(setup([{ ...row, ...patch }]).repo.read(auth, date)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
});
it("rejects duplicate ids or ambiguous currently effective versions, but preserves future history", async () => {
  await expect(setup([{ ...row, media: "TENCENT" }]).repo.read(auth, date, "KUAISHOU")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  await expect(setup([row, row]).repo.read(auth, date)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  await expect(setup([{ ...row, id: "2" }, { ...row, id: "1" }]).repo.read(auth, date)).rejects.toMatchObject({ code: "AMBIGUOUS_VERSION" });
  const result = await setup([{ ...row, id: "3", effective_date: "2026-10-01" }, row]).repo.read(auth, date);
  expect(result.versions.map(v => [v.current, v.historyCount])).toEqual([[false, 2], [true, 2]]);
});
it("preserves bigint/date order without relying on a driver collation", async () => {
  const result = await setup([{ ...row, id: "9007199254740993", effective_date: "2026-08-01" }, row,
    { ...row, id: "9007199254740995", effective_date: "2026-08-01" }].map((v, i) => i === 1 ? { ...v, id: "9007199254740994" } : v)).repo.read(auth, date);
  expect(result.versions.map(v => v.id)).toEqual(["9007199254740994", "9007199254740995", "9007199254740993"]);
});
it("caps raw history and bounds actual encoded output before returning", async () => {
  await expect(setup(Array(10001).fill(row)).repo.read(auth, date)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  const rows = Array.from({ length: 10000 }, (_, i) => ({ ...row, id: String(10000 - i), media: `MEDIA_${String(i).padStart(5, "0")}`,
    changed_by: auth.userId, actor_id: auth.userId, actor_name: "界".repeat(700) }));
  await expect(setup(rows).repo.read(auth, date)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
});
it("accepts16MiB minus1 but rejects exact16MiB output, measured in UTF8 bytes", async () => {
  const rows = Array.from({ length: 4000 }, (_, i) => ({ ...row, id: String(i + 1), media: `MEDIA_${String(i).padStart(5, "0")}`,
    changed_by: auth.userId, actor_id: auth.userId, actor_name: "s" }));
  const baseline = await setup(rows).repo.read(auth, date);
  let padding = 16 * 1024 * 1024 - 1 - Buffer.byteLength(JSON.stringify(baseline));
  for (const entry of rows) {
    const amount = Math.min(padding, 4095); entry.actor_name += "x".repeat(amount); padding -= amount;
  }
  expect(padding).toBe(0);
  expect(Buffer.byteLength(JSON.stringify(await setup(rows).repo.read(auth, date)))).toBe(16 * 1024 * 1024 - 1);
  rows.at(-1)!.actor_name += "x";
  await expect(setup(rows).repo.read(auth, date)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
});
it("returns no fabricated values for an empty history and sanitizes errors", async () => {
  expect((await setup([]).repo.read(auth, date)).versions).toEqual([]);
  for (const [failure, code] of [[new Error("SQL-secret"), "SOURCE_UNAVAILABLE"], [{ code: "57014" }, "UPSTREAM_TIMEOUT"]] as const) {
    const s = setup(); s.query.mockImplementation(async () => { throw failure; });
    await expect(s.repo.read(auth, date)).rejects.toThrow(`Coefficient read: ${code}`);
  }
});
