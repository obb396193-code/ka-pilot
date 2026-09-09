import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const suites = [
  "../../../packages/db/test/scheduled-job-replay.test.ts",
  "../../../packages/db/test/qihang-job-recovery.test.ts",
  "../../../packages/db/test/account-dimension-evidence-repository.test.ts",
  "../../../packages/db/test/qihang-identity-seed.test.ts",
  "../../../packages/db/test/worker-once-diagnostics.test.ts",
  "./worker-once-diagnostic-cli-pg.integration.test.ts",
  "./worker-once-identity-recovery-pg.integration.test.ts",
  "./worker-once-retry-pg.integration.test.ts",
  "./qihang-protocol-pg.integration.test.ts",
];
describe("arch-approved isolated PG test target names", () => {
  it.each(suites)("%s accepts CI/gate test prefixes but retains local host and port fences", name => {
    const source = readFileSync(new URL(name, import.meta.url), "utf8");
    const checks = source.split("\n").filter(line => line.includes(".pathname") && line.includes("if ("));
    expect(checks.length).toBeGreaterThan(0);
    for (const line of checks) {
      expect(line).toContain("/^\\/ka_[a-z0-9_]+_test$/");
      expect(line).toContain('"localhost"'); expect(line).toContain('"127.0.0.1"');
      expect(line).toContain('!== "55432"');
    }
  });
  it("the approved name pattern accepts only explicit ka test databases, not production", () => {
    const valid = /^\/ka_[a-z0-9_]+_test$/;
    for (const name of ["/ka_ci_be_r010_test", "/ka_gate_test", "/ka_be_owned_test"]) expect(valid.test(name)).toBe(true);
    for (const name of ["/postgres", "/ka", "/ka_production", "/ka_test", "/ka-prod_test", "/ka_a_test/other"]) expect(valid.test(name)).toBe(false);
  });
});
