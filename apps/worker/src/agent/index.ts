import { AgentRepository, type createPool } from "@ka/db";

import {
  AgentContextAssembler,
  type ContextObjectResolver,
} from "./context-assembler.js";
import { AgentDiagnosisService } from "./diagnosis-service.js";
import {
  AgentOrchestrator,
  type AgentCredentialResolver,
  type AgentEventSink,
  type AgentRunLogStore,
  type AgentToolCatalog,
} from "./orchestrator.js";
import type { ProviderCapabilityStore } from "./provider/capability-store.js";
import { ProviderRouter } from "./provider/router.js";
import type { ProviderProfile } from "./provider/types.js";
import { ClaudeAgentRuntime } from "./sdk/runtime.js";

type DatabasePool = ReturnType<typeof createPool>;

export interface AgentBackendOptions {
  pool: DatabasePool;
  contextResolver: ContextObjectResolver;
  capabilityStore: ProviderCapabilityStore;
  providerProfiles: readonly ProviderProfile[];
  credentials: AgentCredentialResolver;
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
  runtime?: ClaudeAgentRuntime | undefined;
  diagnosis?: AgentDiagnosisService | undefined;
  now?: (() => Date) | undefined;
}

export function createAgentBackend(options: AgentBackendOptions): AgentOrchestrator {
  const repository = new AgentRepository(options.pool);
  return new AgentOrchestrator({
    repository,
    contextAssembler: new AgentContextAssembler(repository, options.contextResolver),
    diagnosis: options.diagnosis ?? new AgentDiagnosisService(),
    router: new ProviderRouter(options.providerProfiles, options.capabilityStore),
    credentials: options.credentials,
    runtime: options.runtime ?? new ClaudeAgentRuntime(),
    tools: options.tools,
    eventSink: options.eventSink,
    runLogs: options.runLogs,
    gateway: options.gateway,
    runtimeOptions: options.runtimeOptions,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export * from "./context-assembler.js";
export * from "./diagnosis-service.js";
export * from "./operation-port.js";
export * from "./orchestrator.js";
