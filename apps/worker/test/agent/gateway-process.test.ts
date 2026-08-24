import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  GatewayProcessManager,
  type GatewaySpawn,
} from "../../src/agent/gateway/process-manager.js";

describe("GatewayProcessManager", () => {
  it("waits for readiness, supplies secrets only through child env and stops idempotently", async () => {
    const child = new FakeChild();
    const spawn = vi.fn((...parameters: Parameters<GatewaySpawn>) => {
      void parameters;
      return child;
    });
    const diagnostics: string[] = [];
    const manager = new GatewayProcessManager({
      spawn,
      healthCheck: async () => true,
      onDiagnostic: (line) => diagnostics.push(line),
    });
    await manager.start(startInput());
    expect(manager.status).toBe("running");
    const spawnOptions = spawn.mock.calls[0]![2];
    expect(spawnOptions.env).toMatchObject({
      AUTH_STATIC_API_KEYS: "gateway-client-key",
      MODEL_GATEWAY_ENVELOPE_KEY_BASE64: "envelope-key-base64",
      MANAGER_API_KEY: "manager-key",
    });
    child.stderr.write("Authorization: Bearer do-not-log");
    expect(diagnostics.join(" ")).toContain("[REDACTED]");
    expect(diagnostics.join(" ")).not.toContain("do-not-log");
    await manager.stop();
    await manager.stop();
    expect(manager.status).toBe("stopped");
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("reports an early crash and enforces startup timeout", async () => {
    const crashed = new FakeChild();
    const crashManager = new GatewayProcessManager({
      spawn: () => {
        queueMicrotask(() => crashed.crash(2));
        return crashed;
      },
      healthCheck: async () => false,
    });
    await expect(crashManager.start(startInput())).rejects.toThrow(/exited before readiness/);

    const hanging = new FakeChild();
    const timeoutManager = new GatewayProcessManager({
      spawn: () => hanging,
      healthCheck: async () => false,
    });
    await expect(
      timeoutManager.start({ ...startInput(), startupTimeoutMs: 10 }),
    ).rejects.toThrow(/startup timeout/);
    expect(hanging.kill).toHaveBeenCalled();
  });
});

class FakeChild extends EventEmitter {
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  readonly kill = vi.fn((signal?: NodeJS.Signals) => {
    void signal;
    if (this.exitCode === null) {
      this.exitCode = 0;
      queueMicrotask(() => this.emit("exit", 0, null));
    }
    return true;
  });

  crash(code: number): void {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

function startInput() {
  return {
    config: { host: "127.0.0.1", port: 3456, Providers: [] },
    clientKey: "gateway-client-key",
    envelopeKey: "envelope-key-base64",
    managerKey: "manager-key",
    startupTimeoutMs: 100,
    baseEnv: { PATH: "/usr/bin:/bin", HOME: "/private/tmp", TMPDIR: "/private/tmp" },
  };
}
