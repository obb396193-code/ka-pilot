import {
  fingerprintMaterialTeardownAnalysis,
  materialTeardownJsonSchema,
  parseMaterialTeardownResult,
  type AgentRunEvent,
  type MaterialTeardownEvidence,
  type MaterialTeardownResult,
} from "@ka/domain";

import type { ClaudeAgentRuntime, ClaudeAgentRuntimeInput } from "../agent/sdk/runtime.js";
import { createKaMcpBundle, type AgentAuthContext } from "../agent/sdk/tools.js";
import { renderTeardownPrompt } from "./teardown-prompt.js";

export interface StructuredTeardownAgentPort {
  execute(input: {
    prompt: string;
    systemPrompt: string;
    outputJsonSchema: Record<string, unknown>;
  }): Promise<{
    structuredOutput: unknown;
    providerId: string;
    model: string;
    profileVersion: string;
  }>;
}

export class TeardownAnalysisError extends Error {
  constructor(readonly reason: "agent_failed" | "invalid_output") {
    super(`Teardown analysis failed: ${reason}`);
    this.name = "TeardownAnalysisError";
  }
}

export interface MaterialTeardownAnalysis {
  readonly result: MaterialTeardownResult;
  readonly analysisFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly promptVersion: string;
  readonly promptTemplateSha256: string;
  readonly schemaVersion: string;
  readonly providerId: string;
  readonly model: string;
  readonly profileVersion: string;
  readonly visualPayloadStatus: "blocked_pending_trusted_multimodal_provider";
}

export class TeardownAnalyzer {
  constructor(private readonly agent: StructuredTeardownAgentPort) {}

  async analyze(evidence: MaterialTeardownEvidence): Promise<MaterialTeardownAnalysis> {
    const rendered = await renderTeardownPrompt({ evidence });
    let response: Awaited<ReturnType<StructuredTeardownAgentPort["execute"]>>;
    try {
      response = await this.agent.execute({
        prompt: rendered.prompt,
        systemPrompt: "You are the evidence-bound KA material teardown analyst. Return strict structured output and never claim to have seen unavailable images.",
        outputJsonSchema: materialTeardownJsonSchema(),
      });
    } catch {
      throw new TeardownAnalysisError("agent_failed");
    }
    let result: MaterialTeardownResult;
    let analysisFingerprint: string;
    try {
      result = parseMaterialTeardownResult(response.structuredOutput, evidence);
      analysisFingerprint = fingerprintMaterialTeardownAnalysis({
        evidenceFingerprint: evidence.fingerprint,
        promptVersion: rendered.promptVersion,
        schemaVersion: evidence.schemaVersion,
        providerId: response.providerId,
        model: response.model,
        profileVersion: response.profileVersion,
      });
    } catch {
      throw new TeardownAnalysisError("invalid_output");
    }
    return deepFreeze({
      result,
      analysisFingerprint,
      evidenceFingerprint: evidence.fingerprint,
      promptVersion: rendered.promptVersion,
      promptTemplateSha256: rendered.promptTemplateSha256,
      schemaVersion: evidence.schemaVersion,
      providerId: response.providerId,
      model: response.model,
      profileVersion: response.profileVersion,
      visualPayloadStatus: "blocked_pending_trusted_multimodal_provider",
    });
  }
}

type TeardownRuntimeBaseInput = Omit<
  ClaudeAgentRuntimeInput,
  "prompt" | "systemPrompt" | "outputJsonSchema" | "mcp"
>;

/**
 * Reuses the hardened B5 Claude Agent SDK runtime without granting any tool or
 * filesystem capability. Production wiring remains separate from this module.
 */
export class ClaudeRuntimeStructuredTeardownAgent implements StructuredTeardownAgentPort {
  constructor(private readonly options: {
    runtime: Pick<ClaudeAgentRuntime, "execute">;
    runtimeInput: TeardownRuntimeBaseInput;
    auth: AgentAuthContext;
    emit?: ((event: AgentRunEvent) => void | Promise<void>) | undefined;
  }) {}

  async execute(input: {
    prompt: string;
    systemPrompt: string;
    outputJsonSchema: Record<string, unknown>;
  }): Promise<{
    structuredOutput: unknown;
    providerId: string;
    model: string;
    profileVersion: string;
  }> {
    const mcp = createKaMcpBundle({ auth: this.options.auth, definitions: [] });
    const result = await this.options.runtime.execute({
      ...this.options.runtimeInput,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      outputJsonSchema: input.outputJsonSchema,
      mcp,
    }, this.options.emit ?? (() => undefined));
    if (result.outcome !== "success") throw new TeardownAnalysisError("agent_failed");
    return {
      structuredOutput: result.structuredOutput,
      providerId: this.options.runtimeInput.provider.providerId,
      model: this.options.runtimeInput.provider.model,
      profileVersion: this.options.runtimeInput.provider.profileVersion,
    };
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
