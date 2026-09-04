import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
const internalToken = "startup-smoke-token-with-at-least-thirty-two-characters";
const children = new Set<ChildProcessWithoutNullStreams>();

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("failed to allocate a test port");
  await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return address.port;
}

function startDataApi(environment: Record<string, string | undefined>): ChildProcessWithoutNullStreams {
  const env = { ...process.env, ...environment };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  const child = spawn(process.execPath, ["--import", "tsx", "src/data-api.ts"], {
    cwd: process.cwd(),
    env: env as NodeJS.ProcessEnv,
    stdio: "pipe",
  });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}

async function waitForOutput(child: ChildProcessWithoutNullStreams, expected: RegExp): Promise<string> {
  let output = "";
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for Data API output: ${output}`)), 10_000);
    const inspect = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (expected.test(output)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      if (!expected.test(output)) {
        clearTimeout(timeout);
        reject(new Error(`Data API exited with ${code}: ${output}`));
      }
    });
  });
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
}

async function waitForClose(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return new Promise((resolve) => child.once("close", (code) => resolve(code)));
}

afterEach(async () => {
  await Promise.all([...children].map(stop));
});

describe("Data API production composition", () => {
  it("starts without KA Data credentials when the optional source is disabled", async () => {
    const port = await unusedPort();
    const child = startDataApi({
      DATABASE_URL: databaseUrl,
      DATA_API_HOST: "127.0.0.1",
      DATA_API_PORT: String(port),
      DATA_API_INTERNAL_TOKEN: internalToken,
      INTERNAL_TEST_AUTH_ENABLED: "false",
      KA_DATA_ENABLED: "false",
      KA_DATA_BASE_URL: undefined,
      KA_DATA_READER_TOKEN: undefined,
    });
    await waitForOutput(child, /KA data API listening/);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });

    const session = await fetch(`http://127.0.0.1:${port}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${internalToken}` },
    });
    expect(session.status).toBe(401);
    await expect(session.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Authentication is required" },
    });
  }, 20_000);

  it("fails startup when KA Data is explicitly enabled without its credentials", async () => {
    const child = startDataApi({
      DATABASE_URL: databaseUrl,
      DATA_API_INTERNAL_TOKEN: internalToken,
      KA_DATA_ENABLED: "true",
      KA_DATA_BASE_URL: undefined,
      KA_DATA_READER_TOKEN: undefined,
    });
    const output = await waitForOutput(child, /KA_DATA_BASE_URL is required/);
    expect(output).toContain("Data API failed");
    expect(await waitForClose(child)).toBe(1);
  }, 20_000);
});
