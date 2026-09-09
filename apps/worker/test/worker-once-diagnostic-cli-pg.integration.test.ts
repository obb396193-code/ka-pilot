import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { runWorkerOnceDiagnosis } from "../src/scheduling/worker-once-diagnose.js";

describe("real CLI -> child -> safe phase IPC", () => {
  it("labels real database failure as tick failure without printing connection details", async () => {
    const source = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(source.hostname) || source.port !== "55432" || !/^\/ka_be_[a-z0-9_]+_test$/.test(source.pathname)) throw new Error("Dedicated local be test DB required");
    // Nonexistent database: no mutations or source access, real driver error contains this private marker.
    source.pathname = "/ka_be_synthetic_private_missing_db";
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/scheduling/worker-once-cli.ts"], {
        cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH, DATABASE_URL: source.toString(),
          WORKER_ONCE_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001", WORKER_ONCE_MEDIA: "KUAISHOU",
          QIHANG_BASE_URL: "https://synthetic-private.invalid/get_data", WORKER_ONCE_MAX_MS: "15000" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", (b: Buffer) => { stdout += b; }); child.stderr.on("data", (b: Buffer) => { stderr += b; });
      child.once("error", reject); child.once("close", code => resolve({ code, stdout, stderr }));
    });
    expect(result).toEqual({ code: 1, stdout: "", stderr: "Worker once failed [TICK_FAILED]\n" });
  }, 25000);
  it("diagnose default composition and actual executable only report database presence", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_be_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local be test DB required");
    const env = { PATH: process.env.PATH, DATABASE_URL: databaseUrl, WORKER_ONCE_WORKSPACE_ID: randomUUID(), WORKER_ONCE_MEDIA: "KUAISHOU", QIHANG_BASE_URL: "https://synthetic-private.invalid/get_data" };
    let output = ""; await runWorkerOnceDiagnosis({ env, args: [], write: value => { output += value; } });
    const direct = JSON.parse(output);
    expect(direct).toMatchObject({ diagnosticOnly: true, readOnly: true, workspace: { exists: false, active: false, kind: null }, queue: { total: 0 }, checks: { qihangNetwork: "not_checked" } });
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/scheduling/worker-once-diagnose.ts"], { cwd: new URL("..", import.meta.url), env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (b: Buffer) => { stdout += b; }); child.stderr.on("data", (b: Buffer) => { stderr += b; });
      child.once("error", reject); child.once("close", code => resolve({ code, stdout, stderr }));
    });
    expect(result.code).toBe(0); expect(result.stderr).toBe(""); expect(JSON.parse(result.stdout)).toEqual(direct);
    expect(result.stdout).not.toMatch(/postgres:|synthetic-private/);
  }, 25000);
});
