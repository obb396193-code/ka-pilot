import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import * as poolModule from "../src/pool.js";
import { runBootstrapSeedCommand } from "../src/seed-bootstrap.js";
const input = { identities: [], workspaces: [], memberships: [], grants: [] };
function setup() {
  const seed = vi.fn(async () => ({ inserted: 0, workspaces: [], memberships: [] }));
  const close = vi.fn(async () => undefined); const open = vi.fn(() => ({ seed, close }));
  return { args: [JSON.stringify(input)], env: { DATABASE_URL: "postgres://synthetic-only" }, seed, close, open, write: vi.fn() };
}
describe("bootstrap CLI", () => {
  it("validates before opening one transaction service, outputs no provider subject or secrets", async () => {
    const h = setup(); await runBootstrapSeedCommand(h);
    expect(h.seed).toHaveBeenCalledWith(input); expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.write).toHaveBeenCalledWith('{"inserted":0,"workspaces":[],"memberships":[]}\n');
  });
  it.each([[], ["{"], ["null"], [JSON.stringify({ ...input, password: "private" })], ["x".repeat(1024 * 1024)], [JSON.stringify(input), "extra"]].map((args, index) => ({ args, index })))("rejects unsafe input $index before DB open", async ({ args }) => {
    const h = { ...setup(), args }; await expect(runBootstrapSeedCommand(h)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.open).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it("requires a configured database even for an empty input", async () => {
    const h = { ...setup(), env: {} }; await expect(runBootstrapSeedCommand(h)).rejects.toThrow();
    expect(h.open).not.toHaveBeenCalled();
  });
  it("closes on failure and never leaks a raw error", async () => {
    const h = setup(); h.seed.mockRejectedValue(new Error("private SQL DSN"));
    await expect(runBootstrapSeedCommand(h)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect(h.close).toHaveBeenCalledTimes(1); expect(h.write).not.toHaveBeenCalled();
  });
  it("real CLI without JSON does not invent a default identity or connect", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/seed-bootstrap.ts", import.meta.url))], { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("Bootstrap seed failed\n");
  });
  it("wires default factory to Repository, commits empty explicit seed and closes pool", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 })); const end = vi.fn(async () => undefined);
    const factory = vi.spyOn(poolModule, "createPool").mockReturnValue({ connect: async () => ({ query, release: vi.fn() }), end } as unknown as Pool);
    try {
      const write = vi.fn(); await runBootstrapSeedCommand({ args: [JSON.stringify(input)], env: { DATABASE_URL: "postgres://synthetic-only" }, write });
      expect(factory).toHaveBeenCalledWith("postgres://synthetic-only"); expect(query).toHaveBeenCalledWith("COMMIT");
      expect(end).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1);
    } finally { factory.mockRestore(); }
  });
});
