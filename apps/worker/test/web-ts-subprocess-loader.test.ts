import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

// Node22's native TS loading hid Node20 deployment failures. Every existing
// cross-package parity/HTTP child must register our installed loader explicitly.
it("all Web TS subprocess probes register tsx instead of relying on native stripping", async () => {
  let probes = 0;
  for (const name of ["data-api-http", "hourly-public-query", "gap-public-query", "pivot-public-query",
    "r010-command-bff-parity", "r010-production-composition-pg.integration", "work-item-list-http", "work-item-list-bff-parity"]) {
    const text = await readFile(new URL(`./${name}.test.ts`, import.meta.url), "utf8");
    const calls = [...text.matchAll(/promisify\(execFile\)\(process\.execPath, \[([^\n]+)/g)];
    expect(calls.length, name).toBeGreaterThan(0);
    for (const call of calls) expect(call[1], name).toMatch(/^"--import", "tsx", "--input-type=module", "-e"/);
    probes += calls.length;
  }
  expect(probes).toBe(11);
});
