import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunEvent } from "@ka/domain";

import type { ProviderCandidate } from "../provider/types.js";
import { buildSafeAgentOptions } from "./safety.js";
import { SdkMessageAdapter } from "./message-adapter.js";
import type { KaMcpBundle } from "./tools.js";
import type { CredentialEnvelopeBinding } from "../gateway/credential-envelope.js";

export interface QueryHandle extends AsyncIterable<unknown> {
  close?: (() => void) | undefined;
}

export type QueryFactory = (input: { prompt: string; options?: Options }) => QueryHandle;

export interface ClaudeAgentRuntimeInput {
  prompt: string;
  systemPrompt: string;
  provider: ProviderCandidate;
  gateway: {
    baseUrl: string;
    clientKey: string;
    credentialEnvelope: string;
    binding: CredentialEnvelopeBinding;
  };
  mcp: KaMcpBundle;
  cwd: string;
  home: string;
  tmpDir: string;
  path: string;
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutMs: number;
  toolTimeoutMs: number;
  outputJsonSchema?: Record<string, unknown> | undefined;
}

export type ClaudeAgentRuntimeResult =
  | {
      outcome: "success";
      finalText: string;
      structuredOutput: unknown;
      estimatedCostUsd: number;
      unknownMessageCount: number;
    }
  | {
      outcome: "error";
      code: "timeout" | "sdk_execution_failed" | "sdk_missing_result" | string;
      estimatedCostUsd: number;
      unknownMessageCount: number;
    };

export class ClaudeAgentRuntime {
  private readonly queryFactory: QueryFactory;
  private readonly onDiagnostic: (line: string) => void;

  constructor(options: {
    queryFactory?: QueryFactory | undefined;
    onDiagnostic?: ((line: string) => void) | undefined;
  } = {}) {
    this.queryFactory = options.queryFactory ?? ((input) => query(input));
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
  }

  async execute(
    input: ClaudeAgentRuntimeInput,
    emit: (event: AgentRunEvent) => void | Promise<void>,
  ): Promise<ClaudeAgentRuntimeResult> {
    assertRuntimeBinding(input);
    const abortController = new AbortController();
    const adapter = new SdkMessageAdapter();
    const options = buildSafeAgentOptions({
      ...input,
      model: input.provider.model,
      abortController,
      stderr: (line) => this.onDiagnostic(redactSdkDiagnostic(line)),
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, input.timeoutMs);
    let handle: QueryHandle | undefined;
    let finalResult: Record<string, unknown> | undefined;
    try {
      handle = this.queryFactory({ prompt: input.prompt, options });
      for await (const message of handle) {
        for (const event of adapter.adapt(message)) await emit(event);
        if (isRecord(message) && message.type === "result") finalResult = message;
      }
      return buildRuntimeResult(finalResult, adapter.unknownMessageCount);
    } catch {
      return runtimeFailure(timedOut, finalResult, adapter.unknownMessageCount);
    } finally {
      clearTimeout(timer);
      closeQuery(handle);
    }
  }
}

function assertRuntimeBinding(input: ClaudeAgentRuntimeInput): void {
  if (input.prompt.trim() === "") throw new Error("Agent prompt is required");
  if (input.provider.providerId !== input.gateway.binding.providerId) {
    throw new Error("Agent provider must match the credential binding");
  }
}

function runtimeFailure(
  timedOut: boolean,
  finalResult: Record<string, unknown> | undefined,
  unknownMessageCount: number,
): ClaudeAgentRuntimeResult {
  return {
    outcome: "error",
    code: timedOut ? "timeout" : "sdk_execution_failed",
    estimatedCostUsd: readEstimatedCost(finalResult),
    unknownMessageCount,
  };
}

function closeQuery(handle: QueryHandle | undefined): void {
  if (handle?.close !== undefined) handle.close();
}

export function redactSdkDiagnostic(input: string): string {
  return input
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-|mul_|mcn_)[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret)\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .slice(0, 2_000);
}

function buildRuntimeResult(
  message: Record<string, unknown> | undefined,
  unknownMessageCount: number,
): ClaudeAgentRuntimeResult {
  if (message === undefined) {
    return { outcome: "error", code: "sdk_missing_result", estimatedCostUsd: 0, unknownMessageCount };
  }
  const cost = readEstimatedCost(message);
  if (message.subtype === "success" && message.is_error === false) {
    return {
      outcome: "success",
      finalText: typeof message.result === "string" ? message.result : "",
      structuredOutput: message.structured_output,
      estimatedCostUsd: cost,
      unknownMessageCount,
    };
  }
  return {
    outcome: "error",
    code:
      typeof message.subtype === "string" && /^[a-z0-9_]{1,100}$/.test(message.subtype)
        ? message.subtype
        : "sdk_execution_failed",
    estimatedCostUsd: cost,
    unknownMessageCount,
  };
}

function readEstimatedCost(message: Record<string, unknown> | undefined): number {
  const value = message?.total_cost_usd;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
