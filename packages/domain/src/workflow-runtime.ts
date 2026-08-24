import { createHash } from "node:crypto";

import { z } from "zod";

import type { CompiledWorkflowPlan } from "./workflow-graph.js";

export const WORKFLOW_BLOCK_REASONS = [
  "trigger_not_received",
  "data_not_ready",
  "insufficient_sample",
  "cooldown_active",
  "daily_limit_reached",
  "conflict_active",
  "permission_denied",
  "waiting_confirmation",
  "capability_unavailable",
  "version_invalid",
  "manual_pause",
  "condition_false",
] as const;

export type WorkflowBlockReason = (typeof WORKFLOW_BLOCK_REASONS)[number];
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting_confirmation"
  | "paused"
  | "succeeded"
  | "failed"
  | "unknown"
  | "cancelled";
export type WorkflowNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "retry_wait"
  | "waiting_confirmation"
  | "succeeded"
  | "skipped"
  | "failed"
  | "unknown";

const isoTimestampSchema = z.string().datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const codeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,127}$/);
const safeRefSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/);
const eventBase = {
  sequence: z.number().int().positive(),
  at: isoTimestampSchema,
};
const nodeBase = {
  ...eventBase,
  nodeId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
};

export const workflowRunEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...eventBase, kind: z.literal("run_started") }).strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal("run_paused"),
      reasonCode: z.enum(WORKFLOW_BLOCK_REASONS),
    })
    .strict(),
  z.object({ ...eventBase, kind: z.literal("run_resumed") }).strict(),
  z.object({ ...eventBase, kind: z.literal("run_cancelled") }).strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_started"),
      attempt: z.number().int().positive(),
      inputHash: hashSchema,
      idempotencyKey: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_succeeded"),
      attempt: z.number().int().positive(),
      outputRef: safeRefSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_retry_scheduled"),
      attempt: z.number().int().positive(),
      retryAt: isoTimestampSchema,
      errorCode: codeSchema,
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_waiting_confirmation"),
      attempt: z.number().int().positive(),
      changesetId: z.string().uuid(),
      previewHash: hashSchema,
      expiresAt: isoTimestampSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_confirmation_received"),
      previewHash: hashSchema,
      confirmedBy: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_skipped"),
      reasonCode: z.enum(WORKFLOW_BLOCK_REASONS),
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_failed"),
      attempt: z.number().int().positive(),
      errorCode: codeSchema,
    })
    .strict(),
  z
    .object({
      ...nodeBase,
      kind: z.literal("node_unknown"),
      attempt: z.number().int().positive(),
      reconciliationRef: safeRefSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal("run_finished"),
      status: z.enum(["succeeded", "failed", "cancelled"]),
    })
    .strict(),
]);

export type WorkflowRunEvent = z.infer<typeof workflowRunEventSchema>;
export type WorkflowRunEventDraft = WorkflowRunEvent extends infer Event
  ? Event extends WorkflowRunEvent
    ? Omit<Event, "sequence">
    : never
  : never;

export interface WorkflowNodeRunState {
  nodeId: string;
  status: WorkflowNodeStatus;
  attempt: number;
  inputHash?: string;
  idempotencyKey?: string;
  outputRef?: string;
  retryAt?: string;
  errorCode?: string;
  skipReason?: WorkflowBlockReason;
  confirmation?: {
    changesetId: string;
    previewHash: string;
    expiresAt?: string;
    confirmedBy?: string;
  };
  reconciliationRef?: string;
}

export interface WorkflowRunState {
  status: WorkflowRunStatus;
  lastSequence: number;
  lastEventAt?: string;
  pauseReason?: WorkflowBlockReason;
  nodes: Readonly<Record<string, WorkflowNodeRunState>>;
}

export type WorkflowAdvanceDecision =
  | { kind: "start_run" }
  | {
      kind: "run_nodes";
      nodes: readonly {
        nodeId: string;
        attempt: number;
        phase: "invoke" | "execute_confirmed";
      }[];
    }
  | { kind: "waiting_confirmation"; nodeId: string; previewHash: string; changesetId: string }
  | { kind: "paused"; reasonCode: WorkflowBlockReason }
  | { kind: "retry_wait"; retryAt: string }
  | { kind: "wait_for_running" }
  | { kind: "blocked"; reasonCode: WorkflowBlockReason }
  | { kind: "finish_run"; status: "succeeded" }
  | { kind: "terminal"; status: "succeeded" | "failed" | "unknown" | "cancelled" };

export function replayWorkflowRun(
  plan: CompiledWorkflowPlan,
  rawEvents: readonly WorkflowRunEvent[],
): WorkflowRunState {
  const state: MutableRunState = {
    status: "queued",
    lastSequence: 0,
    nodes: Object.fromEntries(
      plan.topologicalOrder.map((nodeId) => [nodeId, { nodeId, status: "pending", attempt: 0 }]),
    ),
  };
  for (const rawEvent of rawEvents) {
    const event = workflowRunEventSchema.parse(rawEvent);
    assertEventOrder(state, event);
    applyEvent(plan, state, event);
    state.lastSequence = event.sequence;
    state.lastEventAt = event.at;
    refreshReadyNodes(plan, state);
  }
  return freezeState(state);
}

type MutableRunState = {
  status: WorkflowRunStatus;
  lastSequence: number;
  lastEventAt?: string;
  pauseReason?: WorkflowBlockReason;
  nodes: Record<string, WorkflowNodeRunState>;
};

function assertEventOrder(state: MutableRunState, event: WorkflowRunEvent): void {
  if (event.sequence !== state.lastSequence + 1) {
    throw new Error(`Workflow event sequence must be ${state.lastSequence + 1}`);
  }
  if (state.lastEventAt && event.at < state.lastEventAt) {
    throw new Error("Workflow event timestamp cannot move backwards");
  }
}

function applyEvent(
  plan: CompiledWorkflowPlan,
  state: MutableRunState,
  event: WorkflowRunEvent,
): void {
  if (!("nodeId" in event)) return applyRunEvent(state, event);

  const node = state.nodes[event.nodeId];
  const compiled = plan.nodes[event.nodeId];
  if (!node || !compiled) throw new Error(`Workflow event references unknown node ${event.nodeId}`);
  applyNodeEvent(state, node, compiled.capability.maxAttempts, compiled.capability.mode, event);
}

function applyRunEvent(
  state: MutableRunState,
  event: Exclude<WorkflowRunEvent, { nodeId: string }>,
): void {
  if (event.kind === "run_started") return startRun(state);
  if (event.kind === "run_paused") return pauseRun(state, event.reasonCode);
  if (event.kind === "run_resumed") return resumeRun(state);
  if (event.kind === "run_cancelled") return cancelRun(state);
  finishRun(state, event.status);
}

function applyNodeEvent(
  state: MutableRunState,
  node: WorkflowNodeRunState,
  maxAttempts: number,
  mode: string,
  event: Extract<WorkflowRunEvent, { nodeId: string }>,
): void {
  if (event.kind === "node_started") return startNode(node, event);
  if (event.kind === "node_succeeded") return succeedNode(node, event);
  if (event.kind === "node_retry_scheduled") return scheduleRetry(node, maxAttempts, event);
  if (event.kind === "node_waiting_confirmation") return waitForConfirmation(state, node, mode, event);
  if (event.kind === "node_confirmation_received") return confirmNode(state, node, event);
  if (event.kind === "node_skipped") return skipNode(node, event.reasonCode);
  if (event.kind === "node_failed") return failNode(state, node, event);
  unknownNode(state, node, event);
}

function startRun(state: MutableRunState): void {
  if (state.status !== "queued") illegal("run_started", state.status);
  state.status = "running";
}

function pauseRun(state: MutableRunState, reason: WorkflowBlockReason): void {
  if (state.status !== "running") illegal("run_paused", state.status);
  if (Object.values(state.nodes).some((node) => node.status === "running")) {
    throw new Error("Cannot pause a workflow while a node effect is running");
  }
  state.status = "paused";
  state.pauseReason = reason;
}

function resumeRun(state: MutableRunState): void {
  if (state.status !== "paused") illegal("run_resumed", state.status);
  state.status = "running";
  delete state.pauseReason;
}

function cancelRun(state: MutableRunState): void {
  if (isTerminal(state.status)) illegal("run_cancelled", state.status);
  if (Object.values(state.nodes).some((node) => node.status === "running")) {
    throw new Error("Cannot cancel while a node effect is running");
  }
  state.status = "cancelled";
}

function finishRun(
  state: MutableRunState,
  status: "succeeded" | "failed" | "cancelled",
): void {
  if (status === "succeeded") {
    if (!Object.values(state.nodes).every((node) => node.status === "succeeded" || node.status === "skipped")) {
      throw new Error("Cannot finish workflow successfully before every node is terminal");
    }
  } else if (status !== state.status) {
    throw new Error(`run_finished ${status} does not match current status ${state.status}`);
  }
  state.status = status;
}

function startNode(
  node: WorkflowNodeRunState,
  event: Extract<WorkflowRunEvent, { kind: "node_started" }>,
): void {
  const fromRetry = node.status === "retry_wait";
  if (node.status !== "ready" && !fromRetry) illegal(event.kind, node.status);
  if (node.confirmation?.confirmedBy) {
    throw new Error("Confirmed execute node resumes without a second node_started event");
  }
  const expectedAttempt = node.attempt + 1;
  if (event.attempt !== expectedAttempt) {
    throw new Error(`Workflow node attempt must be ${expectedAttempt}`);
  }
  if (fromRetry && node.retryAt && event.at < node.retryAt) {
    throw new Error("Workflow node retry started before retryAt");
  }
  node.status = "running";
  node.attempt = event.attempt;
  node.inputHash = event.inputHash;
  node.idempotencyKey = event.idempotencyKey;
  delete node.retryAt;
  delete node.errorCode;
}

function succeedNode(
  node: WorkflowNodeRunState,
  event: Extract<WorkflowRunEvent, { kind: "node_succeeded" }>,
): void {
  const confirmedExecute = node.status === "ready" && node.confirmation?.confirmedBy;
  if (node.status !== "running" && !confirmedExecute) illegal(event.kind, node.status);
  assertAttempt(node, event.attempt);
  node.status = "succeeded";
  if (event.outputRef) node.outputRef = event.outputRef;
}

function scheduleRetry(
  node: WorkflowNodeRunState,
  maxAttempts: number,
  event: Extract<WorkflowRunEvent, { kind: "node_retry_scheduled" }>,
): void {
  if (node.status !== "running") illegal(event.kind, node.status);
  assertAttempt(node, event.attempt);
  if (node.attempt >= maxAttempts) {
    throw new Error(`Workflow node ${node.nodeId} reached maximum attempts`);
  }
  if (event.retryAt < event.at) throw new Error("Workflow retryAt cannot be before the event");
  node.status = "retry_wait";
  node.retryAt = event.retryAt;
  node.errorCode = event.errorCode;
}

function waitForConfirmation(
  state: MutableRunState,
  node: WorkflowNodeRunState,
  mode: string,
  event: Extract<WorkflowRunEvent, { kind: "node_waiting_confirmation" }>,
): void {
  if (node.status !== "running") illegal(event.kind, node.status);
  assertAttempt(node, event.attempt);
  if (mode !== "execute") throw new Error("Only execute nodes can wait for confirmation");
  if (event.expiresAt && isAtOrAfter(event.at, event.expiresAt)) {
    throw new Error("Workflow confirmation expiry must be after the event");
  }
  node.status = "waiting_confirmation";
  node.confirmation = {
    changesetId: event.changesetId,
    previewHash: event.previewHash,
    ...(event.expiresAt ? { expiresAt: event.expiresAt } : {}),
  };
  state.status = "waiting_confirmation";
}

function confirmNode(
  state: MutableRunState,
  node: WorkflowNodeRunState,
  event: Extract<WorkflowRunEvent, { kind: "node_confirmation_received" }>,
): void {
  if (node.status !== "waiting_confirmation" || !node.confirmation) {
    illegal(event.kind, node.status);
  }
  if (node.confirmation.previewHash !== event.previewHash) {
    throw new Error("Workflow confirmation preview hash does not match");
  }
  if (node.confirmation.expiresAt && isAtOrAfter(event.at, node.confirmation.expiresAt)) {
    throw new Error("Workflow confirmation has expired");
  }
  node.confirmation.confirmedBy = event.confirmedBy;
  node.status = "ready";
  state.status = "running";
}

function isAtOrAfter(candidate: string, boundary: string): boolean {
  return Date.parse(candidate) >= Date.parse(boundary);
}

function skipNode(node: WorkflowNodeRunState, reason: WorkflowBlockReason): void {
  if (node.status !== "ready" && node.status !== "pending") illegal("node_skipped", node.status);
  node.status = "skipped";
  node.skipReason = reason;
}

function failNode(
  state: MutableRunState,
  node: WorkflowNodeRunState,
  event: Extract<WorkflowRunEvent, { kind: "node_failed" }>,
): void {
  const confirmedExecute = node.status === "ready" && node.confirmation?.confirmedBy;
  if (node.status !== "running" && !confirmedExecute) illegal(event.kind, node.status);
  assertAttempt(node, event.attempt);
  node.status = "failed";
  node.errorCode = event.errorCode;
  state.status = "failed";
}

function unknownNode(
  state: MutableRunState,
  node: WorkflowNodeRunState,
  event: Extract<WorkflowRunEvent, { kind: "node_unknown" }>,
): void {
  const confirmedExecute = node.status === "ready" && node.confirmation?.confirmedBy;
  if (node.status !== "running" && !confirmedExecute) illegal(event.kind, node.status);
  assertAttempt(node, event.attempt);
  node.status = "unknown";
  if (event.reconciliationRef) node.reconciliationRef = event.reconciliationRef;
  state.status = "unknown";
}

function assertAttempt(node: WorkflowNodeRunState, attempt: number): void {
  if (node.attempt !== attempt) {
    throw new Error(`Workflow node event attempt ${attempt} does not match ${node.attempt}`);
  }
}

function illegal(event: string, status: string): never {
  throw new Error(`Workflow event ${event} is an illegal transition from ${status}`);
}

function refreshReadyNodes(plan: CompiledWorkflowPlan, state: MutableRunState): void {
  for (const nodeId of plan.topologicalOrder) {
    const node = state.nodes[nodeId];
    if (!node || node.status !== "pending") continue;
    const dependencies = plan.incoming[nodeId] ?? [];
    if (dependencies.every((id) => {
      const status = state.nodes[id]?.status;
      return status === "succeeded" || status === "skipped";
    })) {
      node.status = "ready";
    }
  }
}

function freezeState(state: MutableRunState): WorkflowRunState {
  const nodes = Object.fromEntries(
    Object.entries(state.nodes).map(([id, node]) => [
      id,
      Object.freeze({
        ...node,
        ...(node.confirmation
          ? { confirmation: Object.freeze({ ...node.confirmation }) }
          : {}),
      }),
    ]),
  );
  return Object.freeze({ ...state, nodes: Object.freeze(nodes) });
}

function isTerminal(status: WorkflowRunStatus): boolean {
  return ["succeeded", "failed", "unknown", "cancelled"].includes(status);
}

export function planWorkflowAdvance(
  state: WorkflowRunState,
  now: string,
): WorkflowAdvanceDecision {
  isoTimestampSchema.parse(now);
  const runDecision = planRunStatusDecision(state);
  if (runDecision) return runDecision;

  const runnable = Object.values(state.nodes)
    .filter((node) => node.status === "ready" || (node.status === "retry_wait" && (node.retryAt ?? "") <= now))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((node) => ({
      nodeId: node.nodeId,
      attempt: node.confirmation?.confirmedBy ? node.attempt : node.attempt + 1,
      phase: node.confirmation?.confirmedBy ? "execute_confirmed" as const : "invoke" as const,
    }));
  if (runnable.length > 0) return { kind: "run_nodes", nodes: runnable };
  if (Object.values(state.nodes).some((node) => node.status === "running")) return { kind: "wait_for_running" };
  const retryAt = Object.values(state.nodes)
    .filter((node) => node.status === "retry_wait" && node.retryAt)
    .map((node) => node.retryAt as string)
    .sort()[0];
  if (retryAt) return { kind: "retry_wait", retryAt };
  if (Object.values(state.nodes).every((node) => node.status === "succeeded" || node.status === "skipped")) {
    return { kind: "finish_run", status: "succeeded" };
  }
  return { kind: "blocked", reasonCode: "data_not_ready" };
}

function planRunStatusDecision(state: WorkflowRunState): WorkflowAdvanceDecision | null {
  if (isTerminal(state.status)) {
    return { kind: "terminal", status: state.status as "succeeded" | "failed" | "unknown" | "cancelled" };
  }
  if (state.status === "queued") return { kind: "start_run" };
  if (state.status === "paused") {
    return { kind: "paused", reasonCode: state.pauseReason ?? "manual_pause" };
  }
  if (state.status !== "waiting_confirmation") return null;
  const waiting = Object.values(state.nodes).find((node) => node.status === "waiting_confirmation");
  if (!waiting?.confirmation) return { kind: "blocked", reasonCode: "waiting_confirmation" };
  return {
    kind: "waiting_confirmation",
    nodeId: waiting.nodeId,
    previewHash: waiting.confirmation.previewHash,
    changesetId: waiting.confirmation.changesetId,
  };
}

export interface NodeInvocationIdentity {
  runId: string;
  nodeId: string;
  attempt: number;
  capabilityVersion: string;
  inputHash: string;
}

export function workflowNodeIdempotencyKey(input: NodeInvocationIdentity): string {
  z.string().uuid().parse(input.runId);
  z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).parse(input.nodeId);
  z.number().int().positive().parse(input.attempt);
  z.string().min(1).max(64).parse(input.capabilityVersion);
  hashSchema.parse(input.inputHash);
  const content = [
    "b7-node-idempotency-v1",
    input.runId,
    input.nodeId,
    String(input.attempt),
    input.capabilityVersion,
    input.inputHash,
  ].join("\u0000");
  return `wfnode_${createHash("sha256").update(content).digest("hex")}`;
}
