import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import * as poolModule from "../src/pool.js";
import { runCoefficientSeedCommand } from "../src/seed-coefficients.js";

const input = { workspace_id: "00000000-0000-4000-8000-000000000080", effective_date: "2026-08-01" };
function setup() {
  const seed = vi.fn(async () => ({ inserted: 4, skipped: 0 }));
  const close = vi.fn(async () => undefined);
  const open = vi.fn(() => ({ seed, close }));
  return { args: [JSON.stringify(input)], env: { DATABASE_URL: "postgres://synthetic-config" }, open, seed, close, write: vi.fn() };
}

describe("coefficient seed operator CLI", () => {
  it("passes validated input to one service and prints only result counts", async () => {
    const options = setup();
    await runCoefficientSeedCommand(options);
    expect(options.seed).toHaveBeenCalledWith(input);
    expect(options.write).toHaveBeenCalledWith('{"inserted":4,"skipped":0}\n');
    expect(options.close).toHaveBeenCalledTimes(1);
  });
  it.each([[], ["{"], ["null"], [JSON.stringify({ ...input, token: "private" })], [JSON.stringify(input), "extra"], [" ".repeat(65536)]].map((args, caseId) => ({ args, caseId })))("rejects case $caseId before open", async ({ args }) => {
    const options = { ...setup(), args };
    await expect(runCoefficientSeedCommand(options)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(options.open).not.toHaveBeenCalled(); expect(options.write).not.toHaveBeenCalled();
  });
  it("requires a configured database before open", async () => {
    const options = { ...setup(), env: {} };
    await expect(runCoefficientSeedCommand(options)).rejects.toThrow(); expect(options.open).not.toHaveBeenCalled();
  });
  it("closes failed requests and does not leak DB details", async () => {
    const options = setup(); options.seed.mockRejectedValue(new Error("postgres://private SQL"));
    await expect(runCoefficientSeedCommand(options)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(options.close).toHaveBeenCalledTimes(1); expect(options.write).not.toHaveBeenCalled();
  });
  it("default factory connects Repository and closes its pool (SQL is mocked, not PG evidence)", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("coefficient-seed-workspace") ? [{ kind: "personal", is_active: true }] : [], rowCount: sql.startsWith("INSERT") ? 1 : 0 }));
    const end = vi.fn(async () => undefined);
    const fakePool = { connect: async () => ({ query, release: vi.fn() }), end } as unknown as Pool;
    const factory = vi.spyOn(poolModule, "createPool").mockReturnValue(fakePool);
    try {
      const write = vi.fn();
      await runCoefficientSeedCommand({ args: [JSON.stringify(input)], env: { DATABASE_URL: "postgres://synthetic-config" }, write });
      expect(factory).toHaveBeenCalledWith("postgres://synthetic-config");
      expect(write).toHaveBeenCalledWith('{"inserted":4,"skipped":0}\n');
      expect(end).toHaveBeenCalledTimes(1);
    } finally { factory.mockRestore(); }
  });
  it("real CLI has no default seed or database mutation", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/seed-coefficients.ts", import.meta.url))], { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("Coefficient seed failed\n");
  });
});
