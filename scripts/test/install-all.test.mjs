import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const packages = ["packages/domain", "packages/db", "apps/worker", "apps/web", "apps/dingtalk-gateway"];
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup({ missingLock } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ka-install-unit-"))); roots.push(root);
  const repo = join(root, "checkout with spaces");
  mkdirSync(join(repo, "scripts"), { recursive: true }); mkdirSync(join(root, "bin"));
  copyFileSync(new URL("../install-all.sh", import.meta.url), join(repo, "scripts/install-all.sh"));
  for (const path of packages) {
    mkdirSync(join(repo, path), { recursive: true });
    writeFileSync(join(repo, path, "package.json"), "{}");
    if (path !== missingLock) writeFileSync(join(repo, path, "package-lock.json"), "{}");
  }
  const log = join(root, "install.jsonl");
  writeFileSync(join(root, "bin/npm"), `#!/usr/bin/env node
const fs=require('node:fs');
fs.appendFileSync(process.env.INSTALL_TEST_LOG,JSON.stringify(process.argv.slice(2))+'\\n');
if(process.env.INSTALL_TEST_FAIL && process.argv.includes(process.env.INSTALL_TEST_FAIL))process.exit(17);
`, { mode: 0o755 });
  return { root, repo, log, run(args = [], extraEnv = {}) {
    return spawnSync("bash", [join(repo, "scripts/install-all.sh"), ...args], {
      cwd: root, encoding: "utf8", timeout: 5000,
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, INSTALL_TEST_LOG: log, ...extraEnv },
    });
  } };
}
function lines(log) { try { return readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)); } catch (error) { if (error.code === "ENOENT") return []; throw error; } }

test("locked installs run domain before file-dependent packages, from any cwd", () => {
  const s = setup(); const result = s.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(s.log), packages.map((path) => ["ci", "--include=dev", "--no-audit", "--no-fund", "--prefix", join(s.repo, path)]));
});
test("one failed package prevents all later installs and preserves status", () => {
  const s = setup(); const result = s.run([], { INSTALL_TEST_FAIL: join(s.repo, "packages/db") });
  assert.equal(result.status, 17); assert.equal(lines(s.log).length, 2);
});
test("preflights every lock before the first install, not after partial mutation", () => {
  const s = setup({ missingLock: "apps/web" }); const result = s.run();
  assert.notEqual(result.status, 0); assert.equal(lines(s.log).length, 0);
});
test("arguments cannot select arbitrary packages or inject npm options", () => {
  const s = setup(); const result = s.run(["--registry=https://invalid.test"]);
  assert.notEqual(result.status, 0); assert.equal(lines(s.log).length, 0);
});
test("production builds explicitly include tsx/compiler runtime dependencies", () => {
  const s = setup(); const result = s.run([], { NODE_ENV: "production", npm_config_omit: "dev" });
  assert.equal(result.status, 0); assert.ok(lines(s.log).every((args) => args.includes("--include=dev")));
});
test("root lifecycle delegates to the same bounded install entry", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.private, true); assert.equal(pkg.scripts.postinstall, "bash scripts/install-all.sh");
  assert.equal(pkg.scripts["install:all"], pkg.scripts.postinstall);
  assert.equal(pkg.dependencies, undefined);
});
