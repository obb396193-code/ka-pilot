import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { IdentityPasswordRepository } from "../src/identity-password-repository.js";
const id = "00000000-0000-4000-8000-000000000211";
const row = { id, password_salt: "synthetic-salt", password_scrypt: "0".repeat(64), algo: "scrypt" };
function setup(rows: unknown[]) {
  const query = vi.fn(async () => ({ rows }));
  return { query, repository: new IdentityPasswordRepository({ query } as unknown as Pool) };
}
describe("F-OS-004 internal-test login identity lookup", () => {
  it("uses bound subject, active internal-test identity and bounded result", async () => {
    const s = setup([row]);
    await expect(s.repository.findByLoginName("synthetic.member")).resolves.toEqual({ identityId: id,
      password: { passwordSalt: row.password_salt, passwordScrypt: row.password_scrypt, algo: "scrypt" } });
    expect(s.query).toHaveBeenCalledWith(expect.stringContaining("i.provider='internal_test'"), ["synthetic.member"]);
    expect(s.query).toHaveBeenCalledWith(expect.stringContaining("i.is_active=true LIMIT 2"), ["synthetic.member"]);
  });
  it.each(["", "x\n", "x' OR 1=1", "x".repeat(129)])("rejects invalid name before DB %j", async name => {
    const s = setup([row]); await expect(s.repository.findByLoginName(name)).resolves.toBeNull(); expect(s.query).not.toHaveBeenCalled();
  });
  it("distinguishes absent identity from legacy identity without stored password", async () => {
    await expect(setup([]).repository.findByLoginName("member")).resolves.toBeNull();
    await expect(setup([{ id, password_salt: null, password_scrypt: null, algo: null }]).repository.findByLoginName("member"))
      .resolves.toEqual({ identityId: id, password: null });
  });
  it.each([[row, row], [{ ...row, id: null }], [{ ...row, algo: "plaintext" }],
    [{ ...row, password_salt: null }], [{ ...row, password_scrypt: 42 }]].map(rows => ({ rows })))("invalid stored row rejects rather than ENV fallback", async ({ rows }) => {
    await expect(setup(rows).repository.findByLoginName("member")).rejects.toMatchObject({ code: "INVALID_RESULT" });
  });
});
