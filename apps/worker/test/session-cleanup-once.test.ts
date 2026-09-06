import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseSessionCleanupConfig } from "../src/auth/session-cleanup-once.js";

const env = { DATABASE_URL: "postgres://synthetic:synthetic@127.0.0.1:55432/ka_fixture_test", SESSION_CLEANUP_WORKSPACE_ID: "00000000-0000-4000-8000-000000000002", SESSION_CLEANUP_RUN_ID: "00000000-0000-4000-8000-000000000003" };
describe("explicit server-only session retention invocation", () => {
  it("requires workspace and logical run ID but no Qihang or media credentials", () => {
    expect(parseSessionCleanupConfig(env)).toEqual({ databaseUrl: env.DATABASE_URL, workspaceId: env.SESSION_CLEANUP_WORKSPACE_ID, runId: env.SESSION_CLEANUP_RUN_ID, maxMs: 60_000 });
  });
  it.each([{}, { ...env, SESSION_CLEANUP_WORKSPACE_ID: "bad" }, { ...env, SESSION_CLEANUP_RUN_ID: "" }, { ...env, SESSION_CLEANUP_MAX_MS: "600001" }, { ...env, NODE_ENV: "production", KA_DATA_DEV_TOKEN: "synthetic-secret" }])("rejects missing/invalid settings with a safe fixed error", (input) => {
    expect(() => parseSessionCleanupConfig(input)).toThrow("Session cleanup failed");
  });
  it("real CLI without explicit configuration never silently cleans a default workspace", async () => {
    const result = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/auth/session-cleanup-cli.ts"], { cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = ""; child.stdout.on("data", (v: Buffer) => { out += v; }); child.stderr.on("data", (v: Buffer) => { err += v; });
      child.once("error", reject); child.once("close", (code) => resolve({ code, out, err }));
    });
    expect(result).toEqual({ code: 1, out: "", err: "Session cleanup failed\n" });
  });
});
