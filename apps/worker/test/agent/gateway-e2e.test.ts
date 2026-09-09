import { tmpdir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildGatewaySidecarConfig } from "../../src/agent/gateway/config-builder.js";
import { sealCredentialEnvelope } from "../../src/agent/gateway/credential-envelope.js";
import { GatewayProcessManager } from "../../src/agent/gateway/process-manager.js";
import type { ProviderProfile } from "../../src/agent/provider/types.js";

const envelopeKey = Buffer.alloc(32, 4).toString("base64");
const clientKey = "gateway-client-key-for-e2e-localhost";
const managerKey = "gateway-manager-key-for-e2e-localhost";
const binding = {
  workspaceId: "workspace-alpha",
  userId: "user-alpha",
  runId: "run-alpha",
  providerId: "openai-fake",
  model: "model-alpha",
};

describe("real protocol gateway with fake upstreams", () => {
  let manager: GatewayProcessManager | undefined;
  let upstream: Awaited<ReturnType<typeof startFakeUpstream>> | undefined;

  afterEach(async () => {
    await manager?.stop();
    await upstream?.close();
  });

  it("converts text, tool and SSE responses while rejecting bad envelopes before upstream", async () => {
    upstream = await startFakeUpstream();
    const gatewayPort = await reservePort();
    const diagnostics: string[] = [];
    manager = new GatewayProcessManager({ onDiagnostic: (line) => diagnostics.push(line) });
    const profiles: ProviderProfile[] = [
      profile("openai-fake", "openai_chat_completions", upstream.baseUrl),
      profile("anthropic-fake", "anthropic_messages", upstream.origin),
    ];
    await manager.start({
      config: buildGatewaySidecarConfig({
        port: gatewayPort,
        providers: profiles,
        pluginPath: fileURLToPath(
          new URL("../../gateway/ka-credential-injector.mjs", import.meta.url),
        ),
      }),
      clientKey,
      envelopeKey,
      managerKey,
      startupTimeoutMs: 8_000,
      baseEnv: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? tmpdir(),
        TMPDIR: process.env.TMPDIR ?? tmpdir(), // 跨平台：Linux CI 无 /private/tmp
      },
    });
    const baseUrl = `http://127.0.0.1:${gatewayPort}`;
    const validToken = sealCredentialEnvelope(
      { ...binding, credential: "openai-private-key" },
      envelopeKey,
    );

    const rejected = await sendMessage(baseUrl, `${validToken}broken`, "plain text");
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(upstream.requests).toHaveLength(0);

    const text = await sendMessage(baseUrl, validToken, "plain text");
    expect(text.status).toBe(200);
    expect(await text.json()).toMatchObject({
      type: "message",
      content: [expect.objectContaining({ type: "text", text: "fake text response" })],
      usage: { input_tokens: 3, output_tokens: 2 },
    });
    expect(upstream.requests[0]).toMatchObject({
      path: "/v1/chat/completions",
      authorization: "Bearer openai-private-key",
      hasKaHeader: false,
    });

    const toolResponse = await sendMessage(baseUrl, validToken, "please use tool", {
      tools: [
        {
          name: "query_metrics",
          description: "query metrics",
          input_schema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
    });
    expect(toolResponse.status).toBe(200);
    expect(await toolResponse.json()).toMatchObject({
      content: [
        expect.objectContaining({
          type: "tool_use",
          name: "query_metrics",
          input: { query: "cost" },
        }),
      ],
    });

    const streamed = await sendMessage(baseUrl, validToken, "stream text", { stream: true });
    expect(streamed.status).toBe(200);
    const streamBody = await streamed.text();
    expect(streamBody).toContain("content_block_delta");
    expect(streamBody).toContain("fake stream response");

    const anthropicBinding = { ...binding, providerId: "anthropic-fake" };
    const anthropicToken = sealCredentialEnvelope(
      { ...anthropicBinding, credential: "anthropic-private-key" },
      envelopeKey,
    );
    const native = await sendMessage(baseUrl, anthropicToken, "native anthropic", {
      providerId: "anthropic-fake",
    });
    expect(native.status).toBe(200);
    expect(await native.json()).toMatchObject({
      content: [expect.objectContaining({ text: "fake native response" })],
    });
    expect(upstream.requests.at(-1)).toMatchObject({
      path: "/v1/messages",
      apiKey: "anthropic-private-key",
      hasKaHeader: false,
    });
    expect(diagnostics.join(" ")).not.toContain("openai-private-key");
    expect(diagnostics.join(" ")).not.toContain("anthropic-private-key");
  }, 20_000);
});

function profile(
  id: string,
  protocol: ProviderProfile["protocol"],
  baseUrl: string,
): ProviderProfile {
  return {
    id,
    protocol,
    baseUrl,
    models: ["model-alpha"],
    defaultModel: "model-alpha",
    enabled: true,
    taskKinds: ["chat", "diagnosis"],
    fallbackProviderIds: [],
  };
}

async function sendMessage(
  baseUrl: string,
  credentialEnvelope: string,
  prompt: string,
  options: {
    stream?: boolean;
    tools?: unknown[];
    providerId?: string;
  } = {},
): Promise<Response> {
  const providerId = options.providerId ?? binding.providerId;
  return fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${clientKey}`,
      "x-target-provider": providerId,
      "x-target-model": binding.model,
      "x-ka-credential-envelope": credentialEnvelope,
      "x-ka-workspace-id": binding.workspaceId,
      "x-ka-user-id": binding.userId,
      "x-ka-run-id": binding.runId,
      "x-ka-provider-id": providerId,
      "x-ka-model": binding.model,
    },
    body: JSON.stringify({
      model: binding.model,
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
      stream: options.stream ?? false,
      ...(options.tools === undefined ? {} : { tools: options.tools }),
    }),
  });
}

async function startFakeUpstream(): Promise<{
  origin: string;
  baseUrl: string;
  requests: Array<{
    path: string;
    authorization: string | undefined;
    apiKey: string | undefined;
    hasKaHeader: boolean;
  }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{
    path: string;
    authorization: string | undefined;
    apiKey: string | undefined;
    hasKaHeader: boolean;
  }> = [];
  const server = createServer(async (request, response) => {
    const body = await readJsonBody(request);
    requests.push({
      path: request.url ?? "",
      authorization: stringHeader(request, "authorization"),
      apiKey: stringHeader(request, "x-api-key"),
      hasKaHeader: Object.keys(request.headers).some((header) => header.startsWith("x-ka-")),
    });
    if (request.url === "/v1/messages") {
      sendAnthropicResponse(response);
      return;
    }
    if (body.stream === true) {
      sendOpenAiStream(response);
      return;
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMessage = messages.at(-1);
    const content = isRecord(lastMessage) ? lastMessage.content : "";
    if (typeof content === "string" && content.includes("tool")) {
      sendOpenAiToolResponse(response);
      return;
    }
    sendOpenAiTextResponse(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sendOpenAiTextResponse(response: ServerResponse): void {
  sendJson(response, {
    id: "chatcmpl-fake",
    object: "chat.completion",
    created: 1,
    model: "model-alpha",
    choices: [{ index: 0, message: { role: "assistant", content: "fake text response" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
}

function sendOpenAiToolResponse(response: ServerResponse): void {
  sendJson(response, {
    id: "chatcmpl-tool",
    object: "chat.completion",
    created: 1,
    model: "model-alpha",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-fake",
              type: "function",
              function: { name: "query_metrics", arguments: "{\"query\":\"cost\"}" },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
}

function sendOpenAiStream(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "text/event-stream" });
  const chunks = [
    { id: "chatcmpl-stream", object: "chat.completion.chunk", created: 1, model: "model-alpha", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] },
    { id: "chatcmpl-stream", object: "chat.completion.chunk", created: 1, model: "model-alpha", choices: [{ index: 0, delta: { content: "fake stream response" }, finish_reason: null }] },
    { id: "chatcmpl-stream", object: "chat.completion.chunk", created: 1, model: "model-alpha", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
  ];
  chunks.forEach((chunk) => response.write(`data: ${JSON.stringify(chunk)}\n\n`));
  response.end("data: [DONE]\n\n");
}

function sendAnthropicResponse(response: ServerResponse): void {
  sendJson(response, {
    id: "msg-fake",
    type: "message",
    role: "assistant",
    model: "model-alpha",
    content: [{ type: "text", text: "fake native response" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function stringHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
