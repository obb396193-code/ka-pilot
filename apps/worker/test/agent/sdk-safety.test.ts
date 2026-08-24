import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  assertSafeAgentOptions,
  buildSafeAgentOptions,
  createPreToolUseGuard,
} from "../../src/agent/sdk/safety.js";
import {
  bindAgentTool,
  createKaMcpBundle,
} from "../../src/agent/sdk/tools.js";

const auth = {
  workspaceId: "workspace-alpha",
  userId: "user-alpha",
  runId: "run-alpha",
};

describe("Claude Agent SDK safety clamps", () => {
  it("disables built-ins and filesystem settings while allowing only bound in-process MCP tools", () => {
    const bundle = createKaMcpBundle({
      auth,
      definitions: [
        {
          name: "query_metrics",
          description: "Query approved metric facts",
          inputSchema: { query: z.string() },
          execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
        },
      ],
    });
    const options = buildSafeAgentOptions(safetyInput(bundle));

    expect(options).toMatchObject({
      tools: [],
      allowedTools: ["mcp__ka__query_metrics"],
      permissionMode: "dontAsk",
      settingSources: [],
      skills: [],
      plugins: [],
      strictMcpConfig: true,
      persistSession: false,
      includePartialMessages: true,
      maxTurns: 5,
      maxBudgetUsd: 0.75,
    });
    expect(options.mcpServers?.ka).toMatchObject({ type: "sdk", name: "ka" });
    expect(Object.keys(options.env ?? {}).sort()).toEqual(
      [
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_CUSTOM_HEADERS",
        "CLAUDE_AGENT_SDK_CLIENT_APP",
        "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
        "CLAUDE_CONFIG_DIR",
        "HOME",
        "MCP_TOOL_TIMEOUT",
        "NO_PROXY",
        "PATH",
        "TMPDIR",
      ].sort(),
    );
    expect(JSON.stringify(options.env)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(options.env)).not.toContain("MULTICA");
    expect(JSON.stringify(options.env)).not.toContain("provider-private-key");
    expect(options.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
    expect(() => assertSafeAgentOptions(options, bundle.allowedToolNames)).not.toThrow();
  });

  it("fails its preflight audit when a caller re-enables a built-in or settings source", () => {
    const bundle = createKaMcpBundle({ auth, definitions: [] });
    const options = buildSafeAgentOptions(safetyInput(bundle));
    expect(() =>
      assertSafeAgentOptions({ ...options, tools: ["Bash"] }, bundle.allowedToolNames),
    ).toThrow(/built-in/i);
    expect(() =>
      assertSafeAgentOptions({ ...options, settingSources: ["user"] }, bundle.allowedToolNames),
    ).toThrow(/settings/i);
    expect(() =>
      buildSafeAgentOptions({
        ...safetyInput(bundle),
        gateway: {
          ...safetyInput(bundle).gateway,
          binding: { ...safetyInput(bundle).gateway.binding, model: "model-other" },
        },
      }),
    ).toThrow(/model must match/i);
  });

  it("denies every tool outside the exact allowlist in the PreToolUse hook", async () => {
    const guard = createPreToolUseGuard(["mcp__ka__query_metrics"]);
    await expect(
      guard({ hook_event_name: "PreToolUse", tool_name: "Bash" }),
    ).resolves.toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    await expect(
      guard({ hook_event_name: "PreToolUse", tool_name: "mcp__ka__query_metrics" }),
    ).resolves.toMatchObject({
      hookSpecificOutput: { permissionDecision: "allow" },
    });
  });

  it("binds AuthContext in a server closure instead of accepting identity from model input", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    const bound = bindAgentTool(auth, {
      name: "query_metrics",
      description: "Query approved metric facts",
      inputSchema: { query: z.string() },
      execute,
    });
    await bound.handler({ query: "cost" }, {});
    expect(execute).toHaveBeenCalledWith({ query: "cost" }, auth);
  });
});

function safetyInput(bundle: ReturnType<typeof createKaMcpBundle>) {
  return {
    model: "model-alpha",
    systemPrompt: "You are the KA operating assistant.",
    cwd: "/private/tmp/ka-agent-cwd",
    home: "/private/tmp/ka-agent-home",
    tmpDir: "/private/tmp/ka-agent-tmp",
    path: "/usr/bin:/bin",
    gateway: {
      baseUrl: "http://127.0.0.1:3456",
      clientKey: "gateway-client-key-safe-for-localhost",
      credentialEnvelope: "kae1.encrypted-token",
      binding: {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        runId: auth.runId,
        providerId: "idealab-primary",
        model: "model-alpha",
      },
    },
    mcp: bundle,
    maxTurns: 5,
    maxBudgetUsd: 0.75,
    timeoutMs: 45_000,
    toolTimeoutMs: 15_000,
    abortController: new AbortController(),
  };
}
