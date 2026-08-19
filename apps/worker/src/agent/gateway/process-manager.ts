import { spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import type { Readable } from "node:stream";

import type { GatewaySidecarConfig } from "./config-builder.js";

interface ManagedChild extends EventEmitter {
  stderr: Readable | null;
  exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
}

interface SpawnOptions {
  env: Record<string, string>;
  stdio: ["ignore", "ignore", "pipe"];
}

export type GatewaySpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ManagedChild;

type GatewayHealthCheck = (url: string, clientKey: string) => Promise<boolean>;

export class GatewayProcessManager {
  private child: ManagedChild | null = null;
  private tempDirectory: string | null = null;
  private expectedStop = false;
  private currentStatus: "stopped" | "starting" | "running" | "crashed" = "stopped";
  private readonly spawn: GatewaySpawn;
  private readonly healthCheck: GatewayHealthCheck;
  private readonly onDiagnostic: (line: string) => void;
  private readonly binPath: string;

  constructor(options: {
    spawn?: GatewaySpawn | undefined;
    healthCheck?: GatewayHealthCheck | undefined;
    onDiagnostic?: ((line: string) => void) | undefined;
    binPath?: string | undefined;
  } = {}) {
    this.spawn = options.spawn ?? (nodeSpawn as unknown as GatewaySpawn);
    this.healthCheck = options.healthCheck ?? defaultHealthCheck;
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.binPath = options.binPath ?? resolveGatewayBin();
  }

  get status(): "stopped" | "starting" | "running" | "crashed" {
    return this.currentStatus;
  }

  async start(input: {
    config: GatewaySidecarConfig | Record<string, unknown>;
    clientKey: string;
    envelopeKey: string;
    managerKey: string;
    startupTimeoutMs: number;
    baseEnv: { PATH: string; HOME: string; TMPDIR: string };
  }): Promise<void> {
    if (this.child !== null) throw new Error("Gateway sidecar is already started");
    assertStartInput(input);
    this.currentStatus = "starting";
    this.expectedStop = false;
    this.tempDirectory = await mkdtemp(join(input.baseEnv.TMPDIR, "ka-model-gateway-"));
    const configPath = join(this.tempDirectory, "gateway.config.json");
    await writeFile(configPath, JSON.stringify(input.config), { encoding: "utf8", mode: 0o600 });
    const child = this.spawn(process.execPath, [this.binPath], {
      env: {
        ...input.baseEnv,
        NODE_ENV: "production",
        GATEWAY_CONFIG_PATH: configPath,
        AUTH_STATIC_API_KEYS: input.clientKey,
        MODEL_GATEWAY_ENVELOPE_KEY_BASE64: input.envelopeKey,
        MANAGER_API_KEY: input.managerKey,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.child = child;
    child.stderr?.on("data", (chunk: Buffer | string) => {
      this.onDiagnostic(redactGatewayDiagnostic(String(chunk)));
    });
    child.once("exit", () => {
      if (!this.expectedStop) this.currentStatus = "crashed";
    });
    try {
      await this.waitForReady(
        `http://${String(input.config.host)}:${String(input.config.port)}/health`,
        input.clientKey,
        input.startupTimeoutMs,
      );
      this.currentStatus = "running";
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (child === null) {
      this.currentStatus = "stopped";
      await this.removeTempDirectory();
      return;
    }
    this.expectedStop = true;
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await waitForExit(child, 2_000);
    }
    this.child = null;
    this.currentStatus = "stopped";
    await this.removeTempDirectory();
  }

  private async waitForReady(url: string, clientKey: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.child?.exitCode !== null) {
        throw new Error("Gateway sidecar exited before readiness");
      }
      if (await this.healthCheck(url, clientKey)) return;
      await delay(25);
    }
    throw new Error("Gateway sidecar startup timeout");
  }

  private async removeTempDirectory(): Promise<void> {
    const directory = this.tempDirectory;
    this.tempDirectory = null;
    if (directory !== null) await rm(directory, { recursive: true, force: true });
  }
}

export function redactGatewayDiagnostic(input: string): string {
  return input
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-|mul_|mcn_)[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret)\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .slice(0, 2_000);
}

function assertStartInput(input: {
  clientKey: string;
  envelopeKey: string;
  managerKey: string;
  startupTimeoutMs: number;
  baseEnv: { PATH: string; HOME: string; TMPDIR: string };
}): void {
  const secretValues = [input.clientKey, input.envelopeKey, input.managerKey];
  if (secretValues.some((value) => value.trim() === "" || /[\r\n]/.test(value))) {
    throw new Error("Gateway runtime secret values must be non-empty single lines");
  }
  if (!Number.isSafeInteger(input.startupTimeoutMs) || input.startupTimeoutMs <= 0) {
    throw new Error("Gateway startup timeout must be a positive integer");
  }
}

async function defaultHealthCheck(url: string, clientKey: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${clientKey}` },
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function resolveGatewayBin(): string {
  const require = createRequire(import.meta.url);
  const packageDirectory = dirname(require.resolve("@the-next-ai/ai-gateway/package.json"));
  return join(packageDirectory, "bin", "next-ai-gateway.js");
}

async function waitForExit(child: ManagedChild, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
