import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filesUnder, importedHttpPaths, inventory } from "./route-path-inventory.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const shell = resolve(root, "apps/worker/src/data/http-server.ts");
const own = inventory([...filesUnder(resolve(root, "apps/worker/src/r010")), shell]);
const ownPaths = [...new Set([...own.paths, ...importedHttpPaths(shell)])].sort();
const other = inventory(filesUnder(resolve(root, "apps/worker/src/r014")).filter(file => file.endsWith("-routes.ts")));
const bff = inventory(filesUnder(resolve(root, "apps/web/lib/data")));

// Only an explicitly non-browser operation may enter this list; a missing BFF is not an exemption.
const BACKEND_ONLY: { path: string; why: string }[] = [];

describe("R010 backend/BFF path coverage tripwire", () => {
  it("really scans the shell, imported constants, regular-expression paths and nested BFF modules", () => {
    expect(own.unresolved).toEqual([]); expect(other.unresolved).toEqual([]); expect(bff.unresolved).toEqual([]);
    expect(ownPaths.length).toBeGreaterThanOrEqual(20); expect(bff.paths.length).toBeGreaterThanOrEqual(40);
    for (const path of ["/api/v1/query", "/api/v1/tasks", "/api/v1/auth/session", "/api/v1/changesets/:p/dry-run",
      "/api/v1/accounts/:p/:p/mute", "/api/v1/admin/members/:p/grants", "/api/v1/system/etl-runs"]) expect(ownPaths).toContain(path);
    for (const path of ["/api/v1/work-items/:p", "/api/v1/changesets/:p", "/api/v1/work-items/:p/ignore", "/api/v1/admin/members/:p/grants"]) expect(bff.paths).toContain(path);
  });
  it("has a browser passthrough for every owned backend route", () => {
    expect(BACKEND_ONLY.every(entry => entry.why.trim().length >= 20 && ownPaths.includes(entry.path))).toBe(true);
    const exempt = new Set(BACKEND_ONLY.map(entry => entry.path));
    expect(ownPaths.filter(path => !bff.paths.includes(path) && !exempt.has(path)), "Missing BFF: report to arch/fe; do not mask with exemptions").toEqual([]);
  });
  it("has no BFF pointing at a route absent from both registered backend owners", () => {
    const backend = new Set([...ownPaths, ...other.paths]);
    expect(bff.paths.filter(path => !backend.has(path)), "Orphan BFF: backend path is not implemented").toEqual([]);
  });
});
