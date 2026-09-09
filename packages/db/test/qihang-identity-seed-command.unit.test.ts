import { describe, expect, it, vi } from "vitest";
import { runQihangIdentitySeedCommand } from "../src/seed-qihang-identity.js";
const workspace_id = "00000000-0000-4000-8000-000000000001", user_id = "00000000-0000-4000-8000-000000000002";
const input = { workspace_id, user_id, qihang_user_id: "synthetic-private-qihang" };
const result = { workspaceId: workspace_id, userId: user_id, status: "bound" } as const;
function fixture() {
  const bind = vi.fn().mockResolvedValue(result), close = vi.fn(), write = vi.fn();
  const open = vi.fn(() => ({ bind, close }));
  return { bind, close, write, open, env: { DATABASE_URL: "postgres://synthetic-only" } };
}
describe("private Qihang identity seed command", () => {
  it.each([[JSON.stringify(input)], [JSON.stringify(input), "--force"], ["--force", JSON.stringify(input)]].map(args => [args]))("binds with explicit force only and outputs safe result", async args => {
    const f = fixture(); await runQihangIdentitySeedCommand({ ...f, args });
    expect(f.bind).toHaveBeenCalledWith(input, args.includes("--force"));
    expect(f.write).toHaveBeenCalledWith(`${JSON.stringify(result)}\n`);
    expect(f.write.mock.calls.flat().join("")).not.toContain(input.qihang_user_id);
    expect(f.close).toHaveBeenCalledTimes(1);
  });
  it.each([[], ["bad json"], ["--force"], [JSON.stringify(input), "--force", "--force"], [JSON.stringify({ ...input, role: "admin" })], ["x".repeat(65536)]].map(args => [args]))("rejects malformed arguments before opening DB", async args => {
    const f = fixture();
    await expect(runQihangIdentitySeedCommand({ ...f, args })).rejects.toThrow("Qihang identity seed failed");
    expect(f.open).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled();
  });
  it("never leaks raw DB error and always closes after opening", async () => {
    const f = fixture(); f.bind.mockRejectedValue(new Error("private-database-url " + input.qihang_user_id));
    await expect(runQihangIdentitySeedCommand({ ...f, args: [JSON.stringify(input)] })).rejects.toThrow(/^Qihang identity seed failed: DATABASE_ERROR$/);
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.write).not.toHaveBeenCalled();
  });
  it("rejects a leaking repository output", async () => {
    const f = fixture(); f.bind.mockResolvedValue({ ...result, qihang_user_id: input.qihang_user_id });
    await expect(runQihangIdentitySeedCommand({ ...f, args: [JSON.stringify(input)] })).rejects.toThrow("Qihang identity seed failed");
    expect(f.write).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])("requires a configured database before open", async databaseUrl => {
    const f = fixture();
    await expect(runQihangIdentitySeedCommand({ ...f, env: { DATABASE_URL: databaseUrl }, args: [JSON.stringify(input)] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.open).not.toHaveBeenCalled();
  });
  it("does not print success if closing the service fails", async () => {
    const f = fixture(); f.close.mockRejectedValue(new Error("private-db-url"));
    await expect(runQihangIdentitySeedCommand({ ...f, args: [JSON.stringify(input)] })).rejects.toThrow(/^Qihang identity seed failed: DATABASE_ERROR$/);
    expect(f.write).not.toHaveBeenCalled();
  });
});
