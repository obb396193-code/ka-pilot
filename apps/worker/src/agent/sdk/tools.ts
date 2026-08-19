import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

export interface AgentAuthContext {
  workspaceId: string;
  userId: string;
  runId: string;
}

export interface AgentToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean | undefined;
}

export interface AgentToolDefinition<Schema extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Schema;
  execute(input: Record<string, unknown>, auth: AgentAuthContext): Promise<AgentToolResult>;
}

export interface KaMcpBundle {
  mcpServers: Record<string, McpSdkServerConfigWithInstance>;
  allowedToolNames: string[];
}

export function bindAgentTool<Schema extends z.ZodRawShape>(
  auth: AgentAuthContext,
  definition: AgentToolDefinition<Schema>,
): SdkMcpToolDefinition<Schema> {
  assertToolDefinition(definition);
  return tool(
    definition.name,
    definition.description,
    definition.inputSchema,
    async (input) => definition.execute(input as Record<string, unknown>, auth),
    { alwaysLoad: true },
  );
}

export function createKaMcpBundle(input: {
  auth: AgentAuthContext;
  definitions: readonly AgentToolDefinition[];
}): KaMcpBundle {
  const names = new Set<string>();
  const definitions = input.definitions.map((definition) => {
    if (names.has(definition.name)) throw new Error(`Duplicate Agent tool: ${definition.name}`);
    names.add(definition.name);
    return bindAgentTool(input.auth, definition);
  });
  const server = createSdkMcpServer({
    name: "ka",
    version: "0.1.0",
    instructions: "Only execute the explicitly registered KA operating capabilities.",
    tools: definitions,
    alwaysLoad: true,
  });
  return {
    mcpServers: { ka: server },
    allowedToolNames: [...names].sort().map((name) => `mcp__ka__${name}`),
  };
}

function assertToolDefinition(definition: AgentToolDefinition): void {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(definition.name)) {
    throw new Error("Agent tool name must be a safe snake_case token");
  }
  if (definition.description.trim() === "") throw new Error("Agent tool description is required");
}
