import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { buildGatewaySidecarConfig } from "../../src/agent/gateway/config-builder.js";
import { sealCredentialEnvelope } from "../../src/agent/gateway/credential-envelope.js";
import { GatewayProcessManager } from "../../src/agent/gateway/process-manager.js";
import { ClaudeAgentRuntime } from "../../src/agent/sdk/runtime.js";
import { createKaMcpBundle } from "../../src/agent/sdk/tools.js";

const runSmoke = process.env.KA_RUN_AGENT_SDK_SMOKE === "1" ? describe : describe.skip;
const envelopeKey = Buffer.alloc(32, 19).toString("base64");
const clientKey = "sdk-smoke-local-gateway-client-key";

runSmoke("real Claude Agent SDK through the local gateway", () => {
  let manager: GatewayProcessManager | undefined;
  let upstream: Awaited<ReturnType<typeof startFakeOpenAiUpstream>> | undefined;
  let sandboxRoot: string | undefined;

  afterEach(async () => {
    await manager?.stop();
    await upstream?.close();
    if (sandboxRoot !== undefined) await rm(sandboxRoot, { recursive: true, force: true });
  });

  it("streams a fake provider answer through the real SDK subprocess", async () => {
    upstream = await startFakeOpenAiUpstream();
    const gatewayPort = await reservePort();
    manager = new GatewayProcessManager();
    await manager.start({
      config: buildGatewaySidecarConfig({
        port: gatewayPort,
        providers: [
          {
            id: "sdk-smoke",
            protocol: "openai_chat_completions",
            baseUrl: upstream.baseUrl,
            models: ["model-smoke"],
            defaultModel: "model-smoke",
            enabled: true,
            taskKinds: ["chat"],
            fallbackProviderIds: [],
          },
        ],
        pluginPath: fileURLToPath(
          new URL("../../gateway/ka-credential-injector.mjs", import.meta.url),
        ),
      }),
      clientKey,
      envelopeKey,
      managerKey: "sdk-smoke-manager-key",
      startupTimeoutMs: 8_000,
      baseEnv: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? tmpdir(),
        TMPDIR: process.env.TMPDIR ?? tmpdir(),
      },
    });
    sandboxRoot = await mkdtemp(join(tmpdir(), "ka-sdk-smoke-"));
    const cwd = join(sandboxRoot, "cwd");
    const home = join(sandboxRoot, "home");
    const processTmp = join(sandboxRoot, "tmp");
    await Promise.all([mkdir(cwd), mkdir(home), mkdir(processTmp)]);
    const binding = {
      workspaceId: "workspace-smoke",
      userId: "user-smoke",
      runId: "run-smoke",
      providerId: "sdk-smoke",
      model: "model-smoke",
    };
    const credentialEnvelope = sealCredentialEnvelope(
      { ...binding, credential: "fake-upstream-private-key" },
      envelopeKey,
    );
    const events: Array<{ kind: string; payload: Readonly<Record<string, unknown>> }> = [];
    const runtime = new ClaudeAgentRuntime();
    const result = await runtime.execute({
      prompt: "Reply with the test sentence only.",
      systemPrompt: "You are a deterministic smoke-test assistant.",
      provider: {
        providerId: "sdk-smoke",
        model: "model-smoke",
        profileVersion: "smoke-v1",
        protocol: "openai_chat_completions",
      },
      gateway: {
        baseUrl: `http://127.0.0.1:${gatewayPort}`,
        clientKey,
        credentialEnvelope,
        binding,
      },
      mcp: createKaMcpBundle({
        auth: {
          workspaceId: binding.workspaceId,
          userId: binding.userId,
          runId: binding.runId,
        },
        definitions: [],
      }),
      cwd,
      home,
      tmpDir: processTmp,
      path: process.env.PATH ?? "/usr/bin:/bin",
      maxTurns: 2,
      maxBudgetUsd: 0.1,
      timeoutMs: 25_000,
      toolTimeoutMs: 5_000,
    }, (event) => {
      events.push(event);
    });

    expect(result).toMatchObject({
      outcome: "success",
      finalText: "SDK gateway smoke passed.",
    });
    expect(events.some((event) => event.kind === "delta")).toBe(true);
    expect(events.at(-1)?.kind).toBe("done");

    const abortBinding = { ...binding, runId: "run-smoke-abort" };
    const aborted = await runtime.execute({
      prompt: "HANG_FOREVER",
      systemPrompt: "You are a deterministic smoke-test assistant.",
      provider: {
        providerId: "sdk-smoke",
        model: "model-smoke",
        profileVersion: "smoke-v1",
        protocol: "openai_chat_completions",
      },
      gateway: {
        baseUrl: `http://127.0.0.1:${gatewayPort}`,
        clientKey,
        credentialEnvelope: sealCredentialEnvelope(
          { ...abortBinding, credential: "fake-upstream-private-key" },
          envelopeKey,
        ),
        binding: abortBinding,
      },
      mcp: createKaMcpBundle({
        auth: {
          workspaceId: abortBinding.workspaceId,
          userId: abortBinding.userId,
          runId: abortBinding.runId,
        },
        definitions: [],
      }),
      cwd,
      home,
      tmpDir: processTmp,
      path: process.env.PATH ?? "/usr/bin:/bin",
      maxTurns: 2,
      maxBudgetUsd: 0.1,
      timeoutMs: 1_000,
      toolTimeoutMs: 5_000,
    }, () => undefined);
    expect(aborted).toMatchObject({ outcome: "error", code: "timeout" });
    expect(upstream.requests[0]).toMatchObject({
      path: "/v1/chat/completions",
      authorization: "Bearer fake-upstream-private-key",
      hasKaHeader: false,
    });
    expect(upstream.requests.every((request) => request.hasKaHeader === false)).toBe(true);
  }, 60_000);
});

async function startFakeOpenAiUpstream(): Promise<{
  baseUrl: string;
  requests: Array<{
    path: string;
    authorization: string | undefined;
    hasKaHeader: boolean;
  }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{
    path: string;
    authorization: string | undefined;
    hasKaHeader: boolean;
  }> = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      path: request.url ?? "",
      authorization: header(request, "authorization"),
      hasKaHeader: Object.keys(request.headers).some((name) => name.startsWith("x-ka-")),
    });
    if (!body.includes("HANG_FOREVER")) sendOpenAiStream(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function sendOpenAiStream(response: ServerResponse): void {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const chunks = [
    {
      id: "chatcmpl-sdk-smoke",
      object: "chat.completion.chunk",
      created: 1,
      model: "model-smoke",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    },
    {
      id: "chatcmpl-sdk-smoke",
      object: "chat.completion.chunk",
      created: 1,
      model: "model-smoke",
      choices: [{ index: 0, delta: { content: "SDK gateway smoke passed." }, finish_reason: null }],
    },
    {
      id: "chatcmpl-sdk-smoke",
      object: "chat.completion.chunk",
      created: 1,
      model: "model-smoke",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  ];
  chunks.forEach((chunk) => response.write(`data: ${JSON.stringify(chunk)}\n\n`));
  response.end("data: [DONE]\n\n");
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
