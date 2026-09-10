import { describe, expect, it } from "vitest";
import { pendingCoveragePaths, type PendingCoverage } from "./coverage-pending.js";

const entry: PendingCoverage = { path: "/api/v1/system/etl-runs", owner: "F8-15",
  direction: "backend_to_bff", expiresAt: "2026-09-12T00:00:00+08:00" };
describe("temporary coverage debt expires rather than becoming an exemption", () => {
  it("matches only the exact path/direction before expiry", () => {
    const now = new Date("2026-09-11T15:59:59.999Z");
    expect(pendingCoveragePaths([entry], "backend_to_bff", [entry.path], now)).toEqual([entry.path]);
    expect(pendingCoveragePaths([entry], "bff_to_backend", [entry.path], now)).toEqual([]);
  });
  it.each(["2026-09-11T16:00:00.000Z", "2026-09-12T00:00:00.000Z"])("stops suppressing at/after the Shanghai deadline %s", time => {
    expect(pendingCoveragePaths([entry], "backend_to_bff", [entry.path], new Date(time))).toEqual([]);
  });
  it("requires solved entries to be removed instead of hiding future regressions", () => {
    expect(() => pendingCoveragePaths([entry], "backend_to_bff", [], new Date("2026-09-10T00:00:00Z"))).toThrow("resolved");
  });
  it.each([
    { ...entry, expiresAt: "tomorrow" }, { ...entry, owner: "" }, { ...entry, path: "*" },
    { ...entry, direction: "both" },
  ])("rejects malformed debt metadata %j", invalid => {
    expect(() => pendingCoveragePaths([invalid as PendingCoverage], "backend_to_bff", [entry.path], new Date())).toThrow("Invalid");
  });
  it("rejects duplicate entries and invalid clock", () => {
    expect(() => pendingCoveragePaths([entry, entry], "backend_to_bff", [entry.path], new Date())).toThrow("Duplicate");
    expect(() => pendingCoveragePaths([entry], "backend_to_bff", [entry.path], new Date(NaN))).toThrow("Invalid");
  });
});
