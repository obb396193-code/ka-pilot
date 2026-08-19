import { createAgentRunEvent, type AgentTaskKind } from "@ka/domain";
import { z } from "zod";

import type {
  AgentAuthContext,
  AgentToolDefinition,
} from "./sdk/tools.js";

export type AgentOperationMode = "read" | "preview" | "execute";

export interface AgentOperationCapability {
  id: string;
  description: string;
  mode: AgentOperationMode;
  taskKinds: AgentTaskKind[];
  inputSchema: z.ZodRawShape;
}

export interface AgentOperationPort {
  invoke(input: {
    auth: AgentAuthContext;
    capabilityId: string;
    mode: Exclude<AgentOperationMode, "execute">;
    input: Record<string, unknown>;
  }): Promise<{ message: string; data?: unknown }>;
}

export function createOperationToolDefinitions(input: {
  port: AgentOperationPort;
  auth: AgentAuthContext;
  taskKind: AgentTaskKind;
  capabilities: readonly AgentOperationCapability[];
}): AgentToolDefinition[] {
  const definitions: AgentToolDefinition[] = [];
  const seen = new Set<string>();
  for (const capability of input.capabilities) {
    assertCapability(capability);
    if (capability.mode === "execute") {
      throw new Error("Direct write capabilities cannot be exposed to the Agent runtime");
    }
    const mode = capability.mode;
    if (!capability.taskKinds.includes(input.taskKind)) continue;
    if (seen.has(capability.id)) throw new Error(`Duplicate Agent capability: ${capability.id}`);
    seen.add(capability.id);
    const schema = z.object(capability.inputSchema).strict();
    definitions.push({
      name: capability.id,
      description: capability.description,
      inputSchema: capability.inputSchema,
      execute: async (rawInput, runtimeAuth) => {
        assertSameAuth(input.auth, runtimeAuth);
        const parsed = schema.parse(rawInput);
        const result = await input.port.invoke({
          auth: input.auth,
          capabilityId: capability.id,
          mode,
          input: parsed,
        });
        const payload = {
          message: result.message,
          ...(result.data === undefined ? {} : { data: result.data }),
        };
        createAgentRunEvent({
          seq: 1,
          at: new Date(0).toISOString(),
          kind: "tool",
          payload,
        });
        const text = result.data === undefined
          ? result.message
          : `${result.message}\n${JSON.stringify(result.data)}`;
        if (text.length > 100_000) throw new Error("Agent operation result exceeds the safety limit");
        return { content: [{ type: "text", text }] };
      },
    });
  }
  return definitions;
}

function assertCapability(capability: AgentOperationCapability): void {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(capability.id)) {
    throw new Error("Agent capability id must be a safe snake_case token");
  }
  if (capability.description.trim() === "" || capability.description.length > 1_000) {
    throw new Error("Agent capability description is invalid");
  }
  if (capability.taskKinds.length === 0) throw new Error("Agent capability requires a task kind");
}

function assertSameAuth(expected: AgentAuthContext, actual: AgentAuthContext): void {
  if (
    expected.workspaceId !== actual.workspaceId ||
    expected.userId !== actual.userId ||
    expected.runId !== actual.runId
  ) {
    throw new Error("Agent operation auth context cannot be replaced by model input");
  }
}
