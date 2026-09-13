import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

// The production-composition probe now keeps one real BFF child alive via IPC;
// retain the same loader requirement for spawn and the remaining execFile calls.
function webProbes(text: string) {
  return [...text.matchAll(/(?:promisify\(execFile\)|bffChild = spawn)\(process\.execPath, \[([^\n]+)/g)];
}
// Node22's native TS loading hid Node20 deployment failures. Every existing
// cross-package parity/HTTP child must register our installed loader explicitly.
it("all Web TS subprocess probes register tsx instead of relying on native stripping", async () => {
  let probes = 0;
  for (const name of ["data-api-http", "hourly-public-query", "gap-public-query", "pivot-public-query",
    "r010-command-bff-parity", "r010-production-composition-pg.integration", "work-item-list-http", "work-item-list-bff-parity"]) {
    const text = await readFile(new URL(`./${name}.test.ts`, import.meta.url), "utf8");
    const calls = webProbes(text);
    expect(calls.length, name).toBeGreaterThan(0);
    for (const call of calls) expect(call[1], name).toMatch(/^"--import", "tsx", "--input-type=module", "-e"/);
    probes += calls.length;
  }
  expect(probes).toBe(11);
});

it.each(["promisify(execFile)", "bffChild = spawn"])("loader guard still catches missing tsx in %s", entry => {
  const invalid = webProbes(`${entry}(process.execPath, ["--input-type=module", "-e", "code"]);`);
  expect(invalid).toHaveLength(1);
  expect(invalid[0]?.[1]).not.toMatch(/^"--import", "tsx", "--input-type=module", "-e"/);
  const valid = webProbes(`${entry}(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "code"]);`);
  expect(valid).toHaveLength(1);
  expect(valid[0]?.[1]).toMatch(/^"--import", "tsx", "--input-type=module", "-e"/);
});
