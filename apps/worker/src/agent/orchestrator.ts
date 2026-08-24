import {
  appendAgentRunEvent,
  createAgentRunEvent,
  type AgentRunEvent,
  type AgentTaskKind,
} from "@ka/domain";

import type { AgentContextAssembler, AssembledAgentContext } from "./context-assembler.js";
import type { AgentDiagnosisService, FinalizedDiagnosis } from "./diagnosis-service.js";
import { sealCredentialEnvelope } from "./gateway/credential-envelope.js";
import { decideProviderFallback } from "./provider/fallback.js";
import type {
  ProviderCandidate,
  ProviderFailureKind,
  ProviderRouteDecision,
} from "./provider/types.js";
import type {
  ClaudeAgentRuntimeInput,
  ClaudeAgentRuntimeResult,
} from "./sdk/runtime.js";
import type { AgentAuthContext, AgentToolDefinition } from "./sdk/tools.js";
import { createKaMcpBundle } from "./sdk/tools.js";

export interface AgentOrchestratorRepository {
  startRunForUserMessage(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    kind: AgentTaskKind;
    content: Record<string, unknown>;
    startedAt: Date;
  }): Promise<{ run: { id: string; startedAt: Date }; message: unknown }>;
  completeRun(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    runId: string;
    summary: string;
    assistantContent: Record<string, unknown>;
    finishedAt: Date;
  }): Promise<unknown>;
  failRun(input: {
    workspaceId: string;
    userId: string;
    runId: string;
    summary: string;
    rawLogRef?: string | null | undefined;
    finishedAt: Date;
  }): Promise<unknown>;
}

export interface AgentRouterPort {
  route(input: {
    taskKind: AgentTaskKind;
    preferredProviderId?: string | undefined;
    preferredModel?: string | undefined;
  }): Promise<ProviderRouteDecision>;
}

export interface AgentCredentialResolver {
  resolve(input: {
    workspaceId: string;
    userId: string;
    providerId: string;
  }): Promise<string>;
}

export interface AgentRuntimePort {
  execute(
    input: ClaudeAgentRuntimeInput,
    emit: (event: AgentRunEvent) => void | Promise<void>,
  ): Promise<ClaudeAgentRuntimeResult>;
}

export interface AgentToolCatalog {
  definitions(input: {
    auth: AgentAuthContext;
    taskKind: AgentTaskKind;
  }): Promise<readonly AgentToolDefinition[]>;
}

export interface AgentEventSink {
  append(input: {
    workspaceId: string;
    userId: string;
    runId: string;
    event: AgentRunEvent;
  }): Promise<void>;
}

export interface AgentRunLogStore {
  persistFailure(input: {
    workspaceId: string;
    userId: string;
    runId: string;
    providerId: string | null;
    code: string;
  }): Promise<string | null>;
}

export interface AgentRunInput {
  workspaceId: string;
  userId: string;
  sessionId: string;
  kind: AgentTaskKind;
  prompt: string;
  preferredProviderId?: string | undefined;
  preferredModel?: string | undefined;
  recentlyFailedTargetKeys?: readonly string[] | undefined;
}

export type AgentOrchestratorResult =
  | {
      outcome: "success";
      runId: string;
      providerId: string | null;
      model: string | null;
      usedFallback: boolean;
      assistantContent: Record<string, unknown>;
    }
  | {
      outcome: "failed";
      runId: string;
      providerId: string | null;
      model: string | null;
      code: string;
    };

export interface AgentOrchestratorOptions {
  repository: AgentOrchestratorRepository;
  contextAssembler: Pick<AgentContextAssembler, "assemble">;
  diagnosis: AgentDiagnosisService;
  router: AgentRouterPort;
  credentials: AgentCredentialResolver;
  runtime: AgentRuntimePort;
  tools: AgentToolCatalog;
  eventSink: AgentEventSink;
  runLogs: AgentRunLogStore;
  gateway: {
    baseUrl: string;
    clientKey: string;
    envelopeKey: string;
  };
  runtimeOptions: {
    cwd: string;
    home: string;
    tmpDir: string;
    path: string;
    maxTurns: number;
    maxBudgetUsd: number;
    timeoutMs: number;
    toolTimeoutMs: number;
  };
  now?: (() => Date) | undefined;
}

const CREDENTIAL_TEXT = /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{6,}|\b(?:mul|mcn)_[A-Za-z0-9_-]{3,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+)/i;
const NON_TERMINAL_RUNTIME_EVENTS = new Set<AgentRunEvent["kind"]>([
  "status",
  "delta",
  "tool",
  "usage",
]);

export class AgentOrchestrator {
  private readonly now: () => Date;

  constructor(private readonly options: AgentOrchestratorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async run(input: AgentRunInput): Promise<AgentOrchestratorResult> {
    assertRunInput(input);
    const startedAt = validNow(this.now());
    const started = await this.options.repository.startRunForUserMessage({
      workspaceId: input.workspaceId,
      userId: input.userId,
      sessionId: input.sessionId,
      kind: input.kind,
      content: { text: input.prompt },
      startedAt,
    });
    const runId = started.run.id;
    const publisher = new RunEventPublisher(this.options.eventSink, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId,
    }, this.now);
    let activeProvider: ProviderCandidate | null = null;
    try {
      await publisher.publish("status", { stage: "context_assembling" });
      const context = await this.options.contextAssembler.assemble({
        workspaceId: input.workspaceId,
        userId: input.userId,
        sessionId: input.sessionId,
        asOf: startedAt,
      });
      await publisher.publish("status", { stage: "provider_routing" });
      const route = await this.options.router.route({
        taskKind: input.kind,
        ...(input.preferredProviderId === undefined
          ? {}
          : { preferredProviderId: input.preferredProviderId }),
        ...(input.preferredModel === undefined ? {} : { preferredModel: input.preferredModel }),
      });
      if (route.candidates.length === 0) {
        return input.kind === "diagnosis"
          ? this.completeDiagnosisFallback(input, runId, context, publisher)
          : this.fail(input, runId, null, "provider_unavailable", publisher);
      }
      let usedFallback = false;
      for (let index = 0; index < route.candidates.length; index += 1) {
        const provider = route.candidates[index]!;
        activeProvider = provider;
        await publisher.publish("status", {
          stage: "provider_selected",
          providerId: provider.providerId,
          model: provider.model,
        });
        const attempt = await this.runCandidate(input, runId, context, provider, publisher);
        if (attempt.result.outcome === "success") {
          return input.kind === "diagnosis"
            ? this.completeDiagnosis(
                input,
                runId,
                provider,
                attempt.result,
                context,
                publisher,
                usedFallback,
              )
            : this.completeChat(
                input,
                runId,
                provider,
                attempt.result,
                attempt.events,
                publisher,
                usedFallback,
              );
        }
        const failure = providerFailure(attempt.result.code);
        const fallback = decideProviderFallback({
          candidates: route.candidates,
          currentIndex: index,
          events: attempt.events,
          failure,
        });
        if (fallback.action === "fallback") {
          usedFallback = true;
          await publisher.publish("status", {
            stage: "provider_fallback",
            fromProviderId: provider.providerId,
            toProviderId: fallback.next.providerId,
            reason: failure,
          });
          continue;
        }
        return this.fail(input, runId, provider, attempt.result.code, publisher);
      }
      return this.fail(input, runId, activeProvider, "provider_unavailable", publisher);
    } catch (error) {
      const code = stableFailureCode(error);
      return this.fail(input, runId, activeProvider, code, publisher);
    }
  }

  private async runCandidate(
    input: AgentRunInput,
    runId: string,
    context: AssembledAgentContext,
    provider: ProviderCandidate,
    publisher: RunEventPublisher,
  ): Promise<{ result: ClaudeAgentRuntimeResult; events: AgentRunEvent[] }> {
    const credential = await this.options.credentials.resolve({
      workspaceId: input.workspaceId,
      userId: input.userId,
      providerId: provider.providerId,
    });
    const binding = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId,
      providerId: provider.providerId,
      model: provider.model,
    };
    const credentialEnvelope = sealCredentialEnvelope(
      { ...binding, credential },
      this.options.gateway.envelopeKey,
      { now: validNow(this.now()) },
    );
    const auth = { workspaceId: input.workspaceId, userId: input.userId, runId };
    const definitions = await this.options.tools.definitions({ auth, taskKind: input.kind });
    const attemptEvents: AgentRunEvent[] = [];
    let visibleOutputCommitted = false;
    const result = await this.options.runtime.execute({
      prompt: input.prompt,
      systemPrompt: buildSystemPrompt(input.kind, context),
      provider,
      gateway: {
        baseUrl: this.options.gateway.baseUrl,
        clientKey: this.options.gateway.clientKey,
        credentialEnvelope,
        binding,
      },
      mcp: createKaMcpBundle({ auth, definitions }),
      ...this.options.runtimeOptions,
      ...(input.kind === "diagnosis"
        ? { outputJsonSchema: this.options.diagnosis.outputJsonSchema() }
        : {}),
    }, async (event) => {
      attemptEvents.push(event);
      if (input.kind !== "chat") return;
      if (!visibleOutputCommitted && (event.kind === "delta" || event.kind === "tool")) {
        visibleOutputCommitted = true;
        await publishRuntimeEvents(publisher, attemptEvents);
        return;
      }
      if (visibleOutputCommitted && NON_TERMINAL_RUNTIME_EVENTS.has(event.kind)) {
        await publisher.publish(event.kind, event.payload);
      }
    });
    return { result, events: attemptEvents };
  }

  private async completeChat(
    input: AgentRunInput,
    runId: string,
    provider: ProviderCandidate,
    runtimeResult: Extract<ClaudeAgentRuntimeResult, { outcome: "success" }>,
    attemptEvents: readonly AgentRunEvent[],
    publisher: RunEventPublisher,
    usedFallback: boolean,
  ): Promise<AgentOrchestratorResult> {
    const assistantContent = {
      kind: "chat",
      text: runtimeResult.finalText,
      providerId: provider.providerId,
      model: provider.model,
    };
    await this.options.repository.completeRun({
      workspaceId: input.workspaceId,
      userId: input.userId,
      sessionId: input.sessionId,
      runId,
      summary: "chat_completed",
      assistantContent,
      finishedAt: validNow(this.now()),
    });
    if (!hasVisibleRuntimeOutput(attemptEvents)) {
      if (runtimeResult.finalText !== "") await publisher.publish("delta", { text: runtimeResult.finalText });
      await publishRuntimeEvents(publisher, attemptEvents.filter((event) => event.kind === "usage"));
    }
    await publisher.publish("done", { outcome: "success" });
    return {
      outcome: "success",
      runId,
      providerId: provider.providerId,
      model: provider.model,
      usedFallback,
      assistantContent,
    };
  }

  private async completeDiagnosis(
    input: AgentRunInput,
    runId: string,
    provider: ProviderCandidate,
    runtimeResult: ClaudeAgentRuntimeResult,
    context: AssembledAgentContext,
    publisher: RunEventPublisher,
    usedProviderFallback: boolean,
  ): Promise<AgentOrchestratorResult> {
    const diagnosis = this.options.diagnosis.finalize({
      runtimeResult,
      context,
      recentlyFailedTargetKeys: input.recentlyFailedTargetKeys ?? [],
    });
    await this.persistDiagnosis(input, runId, diagnosis);
    await publisher.publish("delta", { text: diagnosis.markdown });
    await publisher.publish("done", { outcome: "success", fallback: diagnosis.usedFallback });
    return {
      outcome: "success",
      runId,
      providerId: provider.providerId,
      model: provider.model,
      usedFallback: usedProviderFallback || diagnosis.usedFallback,
      assistantContent: diagnosis.assistantContent,
    };
  }

  private async completeDiagnosisFallback(
    input: AgentRunInput,
    runId: string,
    context: AssembledAgentContext,
    publisher: RunEventPublisher,
  ): Promise<AgentOrchestratorResult> {
    const diagnosis = this.options.diagnosis.fallback("capability_missing", context);
    await this.persistDiagnosis(input, runId, diagnosis);
    await publisher.publish("delta", { text: diagnosis.markdown });
    await publisher.publish("done", { outcome: "success", fallback: true });
    return {
      outcome: "success",
      runId,
      providerId: null,
      model: null,
      usedFallback: true,
      assistantContent: diagnosis.assistantContent,
    };
  }

  private async persistDiagnosis(
    input: AgentRunInput,
    runId: string,
    diagnosis: FinalizedDiagnosis,
  ): Promise<void> {
    await this.options.repository.completeRun({
      workspaceId: input.workspaceId,
      userId: input.userId,
      sessionId: input.sessionId,
      runId,
      summary: diagnosis.summary,
      assistantContent: diagnosis.assistantContent,
      finishedAt: validNow(this.now()),
    });
  }

  private async fail(
    input: AgentRunInput,
    runId: string,
    provider: ProviderCandidate | null,
    unsafeCode: string,
    publisher: RunEventPublisher,
  ): Promise<AgentOrchestratorResult> {
    const code = safeCode(unsafeCode);
    const rawLogRef = await this.persistFailureReference(input, runId, provider, code);
    await this.options.repository.failRun({
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId,
      summary: `agent_failed_${code}`,
      rawLogRef,
      finishedAt: validNow(this.now()),
    });
    await publisher.publish("error", { code });
    return {
      outcome: "failed",
      runId,
      providerId: provider?.providerId ?? null,
      model: provider?.model ?? null,
      code,
    };
  }

  private async persistFailureReference(
    input: AgentRunInput,
    runId: string,
    provider: ProviderCandidate | null,
    code: string,
  ): Promise<string | null> {
    try {
      return await this.options.runLogs.persistFailure({
        workspaceId: input.workspaceId,
        userId: input.userId,
        runId,
        providerId: provider?.providerId ?? null,
        code,
      });
    } catch {
      return null;
    }
  }
}

class RunEventPublisher {
  private events: AgentRunEvent[] = [];

  constructor(
    private readonly sink: AgentEventSink,
    private readonly auth: { workspaceId: string; userId: string; runId: string },
    private readonly now: () => Date,
  ) {}

  async publish(kind: AgentRunEvent["kind"], payload: Readonly<Record<string, unknown>>): Promise<void> {
    const event = createAgentRunEvent({
      seq: this.events.length + 1,
      at: validNow(this.now()).toISOString(),
      kind,
      payload,
    });
    const next = appendAgentRunEvent(this.events, event);
    await this.sink.append({ ...this.auth, event });
    this.events = next;
  }
}

async function publishRuntimeEvents(
  publisher: RunEventPublisher,
  events: readonly AgentRunEvent[],
): Promise<void> {
  for (const event of events) {
    if (NON_TERMINAL_RUNTIME_EVENTS.has(event.kind)) {
      await publisher.publish(event.kind, event.payload);
    }
  }
}

function buildSystemPrompt(kind: AgentTaskKind, context: AssembledAgentContext): string {
  const instructions = kind === "diagnosis"
    ? "Return only the requested diagnosis schema. Cite only evidence IDs present in context."
    : "Answer from the supplied context and use only explicitly registered KA tools.";
  return [
    "You are the KA advertising operating assistant.",
    "Never invent account facts, permissions, execution results, or evidence IDs.",
    "All media writes must remain preview-only and require the product confirmation flow.",
    instructions,
    "<ka_context>",
    context.promptContext,
    "</ka_context>",
  ].join("\n");
}

function providerFailure(code: string): ProviderFailureKind {
  if (code === "timeout") return "timeout";
  if (["rate_limited", "rate_limit_error", "overloaded_error"].includes(code)) return "rate_limited";
  if (["server_error", "api_error", "internal_server_error"].includes(code)) return "server_error";
  if (["auth_error", "authentication_failed", "permission_error"].includes(code)) return "auth_error";
  if (["invalid_request", "invalid_request_error"].includes(code)) return "invalid_request";
  return "capability_error";
}

function hasVisibleRuntimeOutput(events: readonly AgentRunEvent[]): boolean {
  return events.some((event) => event.kind === "delta" || event.kind === "tool");
}

function assertRunInput(input: AgentRunInput): void {
  if (
    input.workspaceId.trim() === "" ||
    input.userId.trim() === "" ||
    input.sessionId.trim() === "" ||
    input.prompt.trim() === "" ||
    input.prompt.length > 50_000
  ) {
    throw new Error("Agent Run input is invalid");
  }
  if (CREDENTIAL_TEXT.test(input.prompt)) {
    throw new Error("Agent prompt must not contain credential-shaped text");
  }
}

function stableFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === "CredentialEnvelopeError") return "credential_unavailable";
  return "orchestration_error";
}

function safeCode(value: string): string {
  return /^[a-z0-9_]{1,100}$/.test(value) ? value : "orchestration_error";
}

function validNow(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("Agent clock returned an invalid timestamp");
  return value;
}
