import { isAbsolute, join } from "node:path";

import type {
  HookJSONOutput,
  McpSdkServerConfigWithInstance,
  Options,
} from "@anthropic-ai/claude-agent-sdk";

import type { CredentialEnvelopeBinding } from "../gateway/credential-envelope.js";
import type { KaMcpBundle } from "./tools.js";

const DISALLOWED_BUILT_INS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "WebFetch",
  "WebSearch",
  "Task",
  "Skill",
  "Glob",
  "Grep",
  "NotebookEdit",
];
const SAFE_ENV_KEYS = new Set([
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
]);

export interface SafeAgentOptionsInput {
  model: string;
  systemPrompt: string;
  cwd: string;
  home: string;
  tmpDir: string;
  path: string;
  gateway: {
    baseUrl: string;
    clientKey: string;
    credentialEnvelope: string;
    binding: CredentialEnvelopeBinding;
  };
  mcp: KaMcpBundle;
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutMs: number;
  toolTimeoutMs: number;
  abortController: AbortController;
  outputJsonSchema?: Record<string, unknown> | undefined;
  stderr?: ((data: string) => void) | undefined;
}

export function buildSafeAgentOptions(input: SafeAgentOptionsInput): Options {
  assertSafeInput(input);
  const guard = createPreToolUseGuard(input.mcp.allowedToolNames);
  const options: Options = {
    abortController: input.abortController,
    cwd: input.cwd,
    model: input.model,
    systemPrompt: input.systemPrompt,
    tools: [],
    allowedTools: [...input.mcp.allowedToolNames],
    disallowedTools: DISALLOWED_BUILT_INS,
    permissionMode: "dontAsk",
    settingSources: [],
    skills: [],
    plugins: [],
    agents: {},
    additionalDirectories: [],
    strictMcpConfig: true,
    persistSession: false,
    includePartialMessages: true,
    includeHookEvents: false,
    promptSuggestions: false,
    forwardSubagentText: false,
    enableFileCheckpointing: false,
    maxTurns: input.maxTurns,
    maxBudgetUsd: input.maxBudgetUsd,
    mcpServers: input.mcp.mcpServers,
    env: buildSubprocessEnvironment(input),
    hooks: {
      PreToolUse: [
        {
          hooks: [async (hookInput) => guard(hookInput)],
        },
      ],
    },
    ...(input.outputJsonSchema === undefined
      ? {}
      : { outputFormat: { type: "json_schema", schema: input.outputJsonSchema } }),
    ...(input.stderr === undefined ? {} : { stderr: input.stderr }),
  };
  assertSafeAgentOptions(options, input.mcp.allowedToolNames);
  return options;
}

export function createPreToolUseGuard(allowedTools: readonly string[]) {
  const allowed = new Set(allowedTools);
  return async (input: { hook_event_name: string; tool_name?: string | undefined }): Promise<HookJSONOutput> => {
    const permitted =
      input.hook_event_name === "PreToolUse" &&
      input.tool_name !== undefined &&
      allowed.has(input.tool_name);
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: permitted ? "allow" : "deny",
        permissionDecisionReason: permitted
          ? "KA capability allowlist"
          : "Tool is outside the KA capability allowlist",
      },
    };
  };
}

export function assertSafeAgentOptions(options: Options, allowedToolNames: readonly string[]): void {
  assertToolIsolation(options, allowedToolNames);
  assertFilesystemIsolation(options);
  assertRuntimeIsolation(options);
  assertSafeEnvironment(options.env);
  if (!options.hooks?.PreToolUse?.[0]?.hooks[0]) {
    throw new Error("Agent PreToolUse guard is required");
  }
}

function assertToolIsolation(options: Options, allowedToolNames: readonly string[]): void {
  if (!Array.isArray(options.tools) || options.tools.length !== 0) {
    throw new Error("Agent built-in tools must remain disabled");
  }
  if (!sameStrings(options.allowedTools, allowedToolNames)) {
    throw new Error("Agent tool allowlist does not match the bound MCP bundle");
  }
  if (options.permissionMode !== "dontAsk" || options.allowDangerouslySkipPermissions === true) {
    throw new Error("Agent permission mode is unsafe");
  }
}

function assertFilesystemIsolation(options: Options): void {
  if (!Array.isArray(options.settingSources) || options.settingSources.length !== 0) {
    throw new Error("Agent filesystem settings sources must remain disabled");
  }
  if (!Array.isArray(options.skills) || options.skills.length !== 0) {
    throw new Error("Agent skills must remain disabled");
  }
  if (!Array.isArray(options.plugins) || options.plugins.length !== 0) {
    throw new Error("Agent plugins must remain disabled");
  }
}

function assertRuntimeIsolation(options: Options): void {
  if (options.strictMcpConfig !== true || options.persistSession !== false) {
    throw new Error("Agent isolation flags are unsafe");
  }
  assertInProcessMcp(options.mcpServers);
}

function assertSafeEnvironment(environment: Record<string, string | undefined> | undefined): void {
  const envKeys = Object.keys(environment ?? {});
  if (envKeys.some((key) => !SAFE_ENV_KEYS.has(key)) || envKeys.length !== SAFE_ENV_KEYS.size) {
    throw new Error("Agent subprocess environment contains an unsafe or missing key");
  }
}

function buildSubprocessEnvironment(input: SafeAgentOptionsInput): Record<string, string> {
  const headers = {
    "x-target-provider": input.gateway.binding.providerId,
    "x-target-model": input.gateway.binding.model,
    "x-ka-credential-envelope": input.gateway.credentialEnvelope,
    "x-ka-workspace-id": input.gateway.binding.workspaceId,
    "x-ka-user-id": input.gateway.binding.userId,
    "x-ka-run-id": input.gateway.binding.runId,
    "x-ka-provider-id": input.gateway.binding.providerId,
    "x-ka-model": input.gateway.binding.model,
  };
  Object.values(headers).forEach(assertHeaderValue);
  return {
    PATH: input.path,
    HOME: input.home,
    TMPDIR: input.tmpDir,
    CLAUDE_CONFIG_DIR: join(input.home, ".claude"),
    CLAUDE_AGENT_SDK_CLIENT_APP: "ka-operating-platform/0.1.0",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    MCP_TOOL_TIMEOUT: String(input.toolTimeoutMs),
    NO_PROXY: "127.0.0.1,localhost,::1",
    ANTHROPIC_BASE_URL: input.gateway.baseUrl,
    ANTHROPIC_AUTH_TOKEN: input.gateway.clientKey,
    ANTHROPIC_CUSTOM_HEADERS: Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n"),
  };
}

function assertSafeInput(input: SafeAgentOptionsInput): void {
  assertModelBinding(input);
  assertRuntimePaths(input);
  assertLocalGateway(input.gateway.baseUrl);
  assertRuntimeLimits(input);
  assertHeaderValue(input.gateway.clientKey);
  assertHeaderValue(input.gateway.credentialEnvelope);
  Object.values(input.gateway.binding).forEach(assertHeaderValue);
}

function assertModelBinding(input: SafeAgentOptionsInput): void {
  if (input.model !== input.gateway.binding.model || input.model.trim() === "") {
    throw new Error("Agent runtime model must match the credential binding");
  }
  if (input.systemPrompt.trim() === "") throw new Error("Agent system prompt is required");
}

function assertRuntimePaths(input: SafeAgentOptionsInput): void {
  if (![input.cwd, input.home, input.tmpDir].every(isAbsolute)) {
    throw new Error("Agent runtime paths must be absolute");
  }
}

function assertLocalGateway(baseUrl: string): void {
  const gatewayUrl = new URL(baseUrl);
  if (
    gatewayUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(gatewayUrl.hostname)
  ) {
    throw new Error("Agent model gateway must be a localhost HTTP endpoint");
  }
}

function assertRuntimeLimits(input: SafeAgentOptionsInput): void {
  if (
    !Number.isSafeInteger(input.maxTurns) ||
    input.maxTurns <= 0 ||
    !Number.isFinite(input.maxBudgetUsd) ||
    input.maxBudgetUsd <= 0 ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs <= 0 ||
    !Number.isSafeInteger(input.toolTimeoutMs) ||
    input.toolTimeoutMs <= 0
  ) {
    throw new Error("Agent limits must be finite positive values");
  }
}

function assertHeaderValue(value: string): void {
  if (value.trim() === "" || /[\r\n]/.test(value)) {
    throw new Error("Agent gateway header values must be non-empty single lines");
  }
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function assertInProcessMcp(servers: Options["mcpServers"]): void {
  if (servers === undefined) throw new Error("Agent MCP bundle is required");
  for (const server of Object.values(servers)) {
    if (server.type !== "sdk" || !("instance" in server)) {
      throw new Error("Agent MCP servers must be in-process SDK instances");
    }
  }
}

export type SafeMcpServer = McpSdkServerConfigWithInstance;
