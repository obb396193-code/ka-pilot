import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function run(extra: Record<string, string>, args: string[] = []) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/scheduling/worker-once-cli.ts", ...args], {
      cwd: new URL("..", import.meta.url),
      env: { PATH: process.env.PATH, ...extra }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", reject); child.once("close", (code) => resolve({ code, output }));
  });
}
describe("worker once real CLI configuration boundary", () => {
  it.each([
    [{}, []],
    [{ NODE_ENV: "production", KA_DATA_DEV_SAMPLE: "synthetic-secret" }, []],
    [{ DATABASE_URL: "postgres://synthetic:synthetic@127.0.0.1:1/not_used" }, ["--workspace-id", "synthetic-private-id"]],
  ])("rejects incomplete/production-dev/browser-like input before DB with fixed output", async (env, args) => {
    expect(await run(env, args)).toEqual({ code: 1, output: "Worker once failed\n" });
  });
});
