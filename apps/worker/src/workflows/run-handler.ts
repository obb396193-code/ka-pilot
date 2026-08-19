import { createHash } from "node:crypto";

import {
  CapabilityRegistry,
  planWorkflowAdvance,
  replayWorkflowRun,
  workflowNodeIdempotencyKey,
  type CapabilityDefinition,
  type CompiledWorkflowNode,
  type WorkflowInputBinding,
  type WorkflowNodeRunState,
  type WorkflowRunEvent,
  type WorkflowRunEventDraft,
  type WorkflowRunStatus,
} from "@ka/domain";

import type {
  ChangesetActionPort,
  DurableWorkflowCapabilityInvoker,
  DurableWorkflowRunSnapshot,
  WorkflowActionPreviewResult,
  WorkflowAdvanceResult,
  WorkflowInvocationResult,
  WorkflowOutputStore,
  WorkflowRunAuthContext,
  WorkflowRunPermissionPort,
  WorkflowRunRepositoryPort,
} from "./types.js";

export interface DurableWorkflowRunOptions {
  maxStepsPerAdvance?: number;
  maxWallTimeMs?: number;
  maxOutputBytes?: number;
  defaultRetryDelayMs?: number;
  clock?: () => Date;
}

export interface WorkflowRunCommand {
  workspaceId: string;
  runId: string;
  userId: string;
  credentialOwnerUserId: string;
}

export interface WorkflowConfirmationCommand extends WorkflowRunCommand {
  nodeId: string;
  previewHash: string;
}

const DEFAULT_MAX_STEPS = 50;
const DEFAULT_MAX_WALL_TIME_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 100_000;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{1,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

class InvocationTimeoutError extends Error {}

export class DurableWorkflowRunHandler {
  private readonly maxSteps: number;
  private readonly maxWallTimeMs: number;
  private readonly maxOutputBytes: number;
  private readonly defaultRetryDelayMs: number;
  private readonly clock: () => Date;

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly repository: WorkflowRunRepositoryPort,
    private readonly invoker: DurableWorkflowCapabilityInvoker,
    private readonly actions: ChangesetActionPort,
    private readonly permissions: WorkflowRunPermissionPort,
    private readonly outputs: WorkflowOutputStore,
    options: DurableWorkflowRunOptions = {},
  ) {
    this.maxSteps = boundedInteger(options.maxStepsPerAdvance ?? DEFAULT_MAX_STEPS, "maxSteps", 1, 500);
    this.maxWallTimeMs = boundedInteger(
      options.maxWallTimeMs ?? DEFAULT_MAX_WALL_TIME_MS,
      "maxWallTimeMs",
      1,
      900_000,
    );
    this.maxOutputBytes = boundedInteger(
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      "maxOutputBytes",
      100,
      10_000_000,
    );
    this.defaultRetryDelayMs = boundedInteger(
      options.defaultRetryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      "defaultRetryDelayMs",
      1,
      3_600_000,
    );
    this.clock = options.clock ?? (() => new Date());
  }

  async advance(command: WorkflowRunCommand): Promise<WorkflowAdvanceResult> {
    const snapshot = await this.loadAuthorized(command);
    const auth = authContext(command);
    const events = [...await this.repository.listEvents(command.workspaceId, command.runId)];
    let storedStatus = snapshot.status;
    const startedAt = this.clock().getTime();
    let effects = 0;

    while (true) {
      const state = replayWorkflowRun(snapshot.plan, events);
      if (state.status !== "queued") {
        if (effects >= this.maxSteps) {
          return { kind: "yielded", runStatus: "running", reason: "step_limit" };
        }
        if (this.clock().getTime() - startedAt >= this.maxWallTimeMs) {
          return { kind: "yielded", runStatus: "running", reason: "time_limit" };
        }
      }
      if (storedStatus === "queued" && state.status === "running") {
        storedStatus = await this.moveStatus(snapshot, storedStatus, "running");
      }
      const now = eventTime(this.clock(), events);
      let decision = planWorkflowAdvance(state, now);
      if (decision.kind === "wait_for_running") {
        const recovering = Object.values(state.nodes)
          .filter((node) => node.status === "running")
          .sort((left, right) => left.nodeId.localeCompare(right.nodeId))[0];
        if (!recovering) return { kind: "blocked", runStatus: state.status, reasonCode: "data_not_ready" };
        decision = {
          kind: "run_nodes",
          nodes: [{ nodeId: recovering.nodeId, attempt: recovering.attempt, phase: "invoke" }],
        };
      }

      if (decision.kind === "start_run") {
        await this.append(events, snapshot, "run_started", { kind: "run_started", at: now });
        storedStatus = await this.moveStatus(snapshot, storedStatus, "running");
        continue;
      }
      if (decision.kind === "run_nodes") {
        const next = decision.nodes[0];
        if (!next) return { kind: "blocked", runStatus: state.status, reasonCode: "data_not_ready" };
        await this.runNode(snapshot, auth, events, state.nodes[next.nodeId], next.attempt, next.phase);
        effects += 1;
        continue;
      }
      if (decision.kind === "finish_run") {
        await this.append(events, snapshot, "run_finished_succeeded", {
          kind: "run_finished",
          status: "succeeded",
          at: now,
        });
        storedStatus = await this.moveStatus(snapshot, storedStatus, "succeeded");
        return { kind: "terminal", runStatus: "succeeded" };
      }
      if (decision.kind === "terminal") {
        if (storedStatus !== decision.status) {
          storedStatus = await this.moveStatus(snapshot, storedStatus, decision.status);
        }
        return { kind: "terminal", runStatus: decision.status };
      }
      if (decision.kind === "waiting_confirmation") {
        storedStatus = await this.moveStatus(snapshot, storedStatus, "waiting_confirmation");
        return {
          kind: "waiting_confirmation",
          runStatus: "waiting_confirmation",
          nodeId: decision.nodeId,
        };
      }
      if (decision.kind === "paused") {
        return { kind: "paused", runStatus: "paused", reasonCode: decision.reasonCode };
      }
      if (decision.kind === "retry_wait") {
        return { kind: "retry_wait", runStatus: "running", retryAt: decision.retryAt };
      }
      return { kind: "blocked", runStatus: state.status, reasonCode: decision.reasonCode };
    }
  }

  async confirm(command: WorkflowConfirmationCommand): Promise<void> {
    const snapshot = await this.loadAuthorized(command);
    const events = [...await this.repository.listEvents(command.workspaceId, command.runId)];
    const state = replayWorkflowRun(snapshot.plan, events);
    const node = state.nodes[command.nodeId];
    if (state.status !== "waiting_confirmation" || node?.status !== "waiting_confirmation" || !node.confirmation) {
      throw new Error("workflow confirmation is not currently available");
    }
    if (node.confirmation.previewHash !== command.previewHash) {
      throw new Error("workflow confirmation preview hash does not match");
    }
    const at = eventTime(this.clock(), events);
    if (node.confirmation.expiresAt && at >= node.confirmation.expiresAt) {
      throw new Error("workflow confirmation has expired");
    }
    await this.append(events, snapshot, `node_${node.nodeId}_confirmation`, {
      kind: "node_confirmation_received",
      nodeId: node.nodeId,
      previewHash: command.previewHash,
      confirmedBy: command.userId,
      at,
    });
    await this.moveStatus(snapshot, snapshot.status, "running");
  }

  async pause(command: WorkflowRunCommand): Promise<void> {
    await this.control(command, "pause");
  }

  async resume(command: WorkflowRunCommand): Promise<void> {
    await this.control(command, "resume");
  }

  async cancel(command: WorkflowRunCommand): Promise<void> {
    await this.control(command, "cancel");
  }

  private async control(command: WorkflowRunCommand, action: "pause" | "resume" | "cancel"): Promise<void> {
    const snapshot = await this.loadAuthorized(command);
    const events = [...await this.repository.listEvents(command.workspaceId, command.runId)];
    const state = replayWorkflowRun(snapshot.plan, events);
    const at = eventTime(this.clock(), events);
    if (action === "pause") {
      if (state.status !== "running") throw new Error("workflow is not running");
      await this.append(events, snapshot, "run_paused_manual", {
        kind: "run_paused",
        reasonCode: "manual_pause",
        at,
      });
      await this.moveStatus(snapshot, snapshot.status, "paused");
      return;
    }
    if (action === "resume") {
      if (state.status !== "paused") throw new Error("workflow is not paused");
      await this.append(events, snapshot, "run_resumed_manual", { kind: "run_resumed", at });
      await this.moveStatus(snapshot, snapshot.status, "running");
      return;
    }
    if (["succeeded", "failed", "unknown", "cancelled"].includes(state.status)) {
      throw new Error("workflow is already terminal");
    }
    await this.append(events, snapshot, "run_cancelled_manual", { kind: "run_cancelled", at });
    await this.moveStatus(snapshot, snapshot.status, "cancelled");
  }

  private async runNode(
    snapshot: DurableWorkflowRunSnapshot,
    auth: WorkflowRunAuthContext,
    events: WorkflowRunEvent[],
    prior: WorkflowNodeRunState | undefined,
    attempt: number,
    phase: "invoke" | "execute_confirmed",
  ): Promise<void> {
    const node = snapshot.plan.nodes[prior?.nodeId ?? ""];
    if (!node || !prior) throw new Error("compiled workflow node is unavailable");
    let capability: CapabilityDefinition;
    try {
      capability = this.registry.resolve(node.capability.id, node.capability.version);
      assertCapabilityMatchesPlan(node, capability);
    } catch {
      await this.startAndFail(snapshot, events, node, prior, attempt, "capability_unavailable");
      return;
    }

    let values: Record<string, unknown>;
    try {
      values = await resolveNodeInputs(snapshot, node.inputs, events, this.outputs);
    } catch {
      await this.startAndFail(snapshot, events, node, prior, attempt, "input_unavailable");
      return;
    }
    const parsed = capability.inputSchema.safeParse(values);
    if (!parsed.success) {
      await this.startAndFail(snapshot, events, node, prior, attempt, "input_invalid");
      return;
    }
    const inputHash = hashCanonical(parsed.data);
    const idempotencyKey = workflowNodeIdempotencyKey({
      runId: snapshot.runId,
      nodeId: node.id,
      attempt,
      capabilityVersion: capability.version,
      inputHash,
    });
    if ((prior.status === "running" || phase === "execute_confirmed") &&
      (prior.inputHash !== inputHash || prior.idempotencyKey !== idempotencyKey)) {
      await this.fail(events, snapshot, node.id, attempt, "input_changed");
      return;
    }

    const permission = await this.permissions.authorize({ auth, nodeId: node.id, capability });
    if (!permission.allowed) {
      await this.startAndFail(snapshot, events, node, prior, attempt, permission.reason);
      return;
    }
    if (phase === "execute_confirmed") {
      await this.executeConfirmed(snapshot, auth, events, node, capability, prior, parsed.data, idempotencyKey);
      return;
    }
    if (prior.status !== "running") {
      await this.append(events, snapshot, `node_${node.id}_attempt_${attempt}_started`, {
        kind: "node_started",
        nodeId: node.id,
        attempt,
        inputHash,
        idempotencyKey,
        at: eventTime(this.clock(), events),
      });
    }
    if (capability.mode === "execute") {
      await this.previewAction(snapshot, auth, events, node, capability, attempt, parsed.data, idempotencyKey);
    } else {
      await this.invokeCapability(snapshot, auth, events, node, capability, attempt, parsed.data, idempotencyKey);
    }
  }

  private async invokeCapability(
    snapshot: DurableWorkflowRunSnapshot,
    auth: WorkflowRunAuthContext,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    attempt: number,
    values: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<void> {
    let result: WorkflowInvocationResult;
    try {
      result = await withTimeout(
        (signal) => this.invoker.invoke({
          auth,
          capability,
          mode: capability.mode as "read" | "preview",
          values,
          idempotencyKey,
          signal,
        }),
        capability.timeoutMs,
      );
    } catch (error) {
      result = {
        kind: "retryable_failure",
        errorCode: error instanceof InvocationTimeoutError ? "capability_timeout" : "capability_error",
      };
    }
    await this.completeInvocation(snapshot, events, node, capability, attempt, idempotencyKey, result);
  }

  private async previewAction(
    snapshot: DurableWorkflowRunSnapshot,
    auth: WorkflowRunAuthContext,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    attempt: number,
    values: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<void> {
    let result: WorkflowActionPreviewResult;
    try {
      result = await withTimeout(
        (signal) => this.actions.preview({ auth, capability, values, idempotencyKey, signal }),
        capability.timeoutMs,
      );
    } catch (error) {
      result = {
        kind: "retryable_failure",
        errorCode: error instanceof InvocationTimeoutError ? "preview_timeout" : "preview_error",
      };
    }
    if (result.kind === "ready") {
      if (!UUID.test(result.changesetId) || !HASH.test(result.previewHash)) {
        await this.fail(events, snapshot, node.id, attempt, "preview_invalid");
        return;
      }
      await this.append(events, snapshot, `node_${node.id}_attempt_${attempt}_waiting`, {
        kind: "node_waiting_confirmation",
        nodeId: node.id,
        attempt,
        changesetId: result.changesetId,
        previewHash: result.previewHash,
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
        at: eventTime(this.clock(), events),
      });
      return;
    }
    await this.completeFailure(snapshot, events, node, capability, attempt, result);
  }

  private async executeConfirmed(
    snapshot: DurableWorkflowRunSnapshot,
    auth: WorkflowRunAuthContext,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    prior: WorkflowNodeRunState,
    values: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<void> {
    const confirmation = prior.confirmation;
    if (!confirmation?.confirmedBy || capability.mode !== "execute") {
      await this.fail(events, snapshot, node.id, prior.attempt, "confirmation_missing");
      return;
    }
    const confirmedBy = confirmation.confirmedBy;
    try {
      const result = await withTimeout(
        (signal) => this.actions.executeConfirmed({
          auth,
          capability,
          values,
          idempotencyKey,
          changesetId: confirmation.changesetId,
          previewHash: confirmation.previewHash,
          confirmedBy,
          signal,
        }),
        capability.timeoutMs,
      );
      if (result.kind === "succeeded") {
        await this.succeed(snapshot, events, node, capability, prior.attempt, idempotencyKey, result.output);
      } else if (result.kind === "permanent_failure") {
        await this.fail(events, snapshot, node.id, prior.attempt, safeErrorCode(result.errorCode));
      } else {
        await this.unknown(
          events,
          snapshot,
          node.id,
          prior.attempt,
          safeReconciliationRef(result.reconciliationRef),
        );
      }
    } catch {
      await this.unknown(events, snapshot, node.id, prior.attempt);
    }
  }

  private async completeInvocation(
    snapshot: DurableWorkflowRunSnapshot,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    attempt: number,
    idempotencyKey: string,
    result: WorkflowInvocationResult,
  ): Promise<void> {
    if (result.kind === "succeeded") {
      await this.succeed(snapshot, events, node, capability, attempt, idempotencyKey, result.output);
      return;
    }
    await this.completeFailure(snapshot, events, node, capability, attempt, result);
  }

  private async completeFailure(
    snapshot: DurableWorkflowRunSnapshot,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    attempt: number,
    result: { kind: "retryable_failure"; errorCode: string; retryAfterMs?: number } |
      { kind: "permanent_failure"; errorCode: string },
  ): Promise<void> {
    const errorCode = safeErrorCode(result.errorCode);
    if (result.kind === "retryable_failure" && attempt < capability.maxAttempts) {
      const delay = boundedRetry(result.retryAfterMs ?? this.defaultRetryDelayMs);
      const at = eventTime(this.clock(), events);
      const retryAt = new Date(new Date(at).getTime() + delay).toISOString();
      await this.append(events, snapshot, `node_${node.id}_attempt_${attempt}_retry`, {
        kind: "node_retry_scheduled",
        nodeId: node.id,
        attempt,
        retryAt,
        errorCode,
        at,
      });
      return;
    }
    await this.fail(events, snapshot, node.id, attempt, errorCode);
  }

  private async succeed(
    snapshot: DurableWorkflowRunSnapshot,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    capability: CapabilityDefinition,
    attempt: number,
    idempotencyKey: string,
    output: unknown,
  ): Promise<void> {
    let outputBytes: number;
    try {
      assertNoCredentialShape(output);
      outputBytes = jsonBytes(output);
    } catch {
      await this.recordOutputFailure(events, snapshot, node, attempt, "output_invalid");
      return;
    }
    if (outputBytes > this.maxOutputBytes) {
      await this.recordOutputFailure(events, snapshot, node, attempt, "output_too_large");
      return;
    }
    const parsed = capability.outputSchema.safeParse(output);
    if (!parsed.success) {
      await this.recordOutputFailure(events, snapshot, node, attempt, "output_invalid");
      return;
    }
    let ref: string;
    try {
      ({ ref } = await this.outputs.putOnce({
        workspaceId: snapshot.workspaceId,
        runId: snapshot.runId,
        nodeId: node.id,
        attempt,
        idempotencyKey,
        value: parsed.data,
      }));
    } catch {
      await this.recordOutputFailure(events, snapshot, node, attempt, "output_store_error");
      return;
    }
    await this.append(events, snapshot, `node_${node.id}_attempt_${attempt}_succeeded`, {
      kind: "node_succeeded",
      nodeId: node.id,
      attempt,
      outputRef: ref,
      at: eventTime(this.clock(), events),
    });
  }

  private async startAndFail(
    snapshot: DurableWorkflowRunSnapshot,
    events: WorkflowRunEvent[],
    node: CompiledWorkflowNode,
    prior: WorkflowNodeRunState,
    attempt: number,
    errorCode: string,
  ): Promise<void> {
    if (prior.status !== "running" && !prior.confirmation?.confirmedBy) {
      const inputHash = hashCanonical({ invalid: safeErrorCode(errorCode) });
      const idempotencyKey = workflowNodeIdempotencyKey({
        runId: snapshot.runId,
        nodeId: node.id,
        attempt,
        capabilityVersion: node.capability.version,
        inputHash,
      });
      await this.append(events, snapshot, `node_${node.id}_attempt_${attempt}_started`, {
        kind: "node_started",
        nodeId: node.id,
        attempt,
        inputHash,
        idempotencyKey,
        at: eventTime(this.clock(), events),
      });
    }
    await this.fail(events, snapshot, node.id, attempt, safeErrorCode(errorCode));
  }

  private async recordOutputFailure(
    events: WorkflowRunEvent[],
    snapshot: DurableWorkflowRunSnapshot,
    node: CompiledWorkflowNode,
    attempt: number,
    errorCode: string,
  ): Promise<void> {
    if (node.capability.mode === "execute") {
      await this.unknown(events, snapshot, node.id, attempt, `reconcile/${node.id}`);
      return;
    }
    await this.fail(events, snapshot, node.id, attempt, errorCode);
  }

  private async fail(
    events: WorkflowRunEvent[],
    snapshot: DurableWorkflowRunSnapshot,
    nodeId: string,
    attempt: number,
    errorCode: string,
  ): Promise<void> {
    await this.append(events, snapshot, `node_${nodeId}_attempt_${attempt}_failed`, {
      kind: "node_failed",
      nodeId,
      attempt,
      errorCode: safeErrorCode(errorCode),
      at: eventTime(this.clock(), events),
    });
  }

  private async unknown(
    events: WorkflowRunEvent[],
    snapshot: DurableWorkflowRunSnapshot,
    nodeId: string,
    attempt: number,
    reconciliationRef?: string,
  ): Promise<void> {
    await this.append(events, snapshot, `node_${nodeId}_attempt_${attempt}_unknown`, {
      kind: "node_unknown",
      nodeId,
      attempt,
      ...(reconciliationRef ? { reconciliationRef } : {}),
      at: eventTime(this.clock(), events),
    });
  }

  private async append(
    events: WorkflowRunEvent[],
    snapshot: DurableWorkflowRunSnapshot,
    dedupeKey: string,
    event: WorkflowRunEventDraft,
  ): Promise<void> {
    const stored = await this.repository.appendEvent({
      workspaceId: snapshot.workspaceId,
      runId: snapshot.runId,
      dedupeKey,
      event,
    });
    if (stored.sequence !== events.length + 1) {
      throw new Error("workflow event stream changed concurrently");
    }
    events.push(stored);
  }

  private async moveStatus(
    snapshot: DurableWorkflowRunSnapshot,
    current: WorkflowRunStatus,
    next: WorkflowRunStatus,
  ): Promise<WorkflowRunStatus> {
    if (current === next) return next;
    const changed = await this.repository.compareAndSetStatus({
      workspaceId: snapshot.workspaceId,
      runId: snapshot.runId,
      expected: current,
      next,
    });
    if (!changed) throw new Error("workflow run status changed concurrently");
    return next;
  }

  private async loadAuthorized(command: WorkflowRunCommand): Promise<DurableWorkflowRunSnapshot> {
    assertCommand(command);
    const snapshot = await this.repository.loadRun(command.workspaceId, command.runId);
    if (!snapshot ||
      snapshot.workspaceId !== command.workspaceId ||
      snapshot.runId !== command.runId ||
      snapshot.initiatorUserId !== command.userId ||
      snapshot.credentialOwnerUserId !== command.credentialOwnerUserId) {
      throw new Error("workflow run access denied");
    }
    return snapshot;
  }
}

async function resolveNodeInputs(
  snapshot: DurableWorkflowRunSnapshot,
  bindings: Readonly<Record<string, WorkflowInputBinding>>,
  events: readonly WorkflowRunEvent[],
  outputs: WorkflowOutputStore,
): Promise<Record<string, unknown>> {
  const params = resolveParameters(snapshot);
  const state = replayWorkflowRun(snapshot.plan, events);
  const result: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(bindings)) {
    if (binding.source === "literal") {
      result[key] = binding.value;
    } else if (binding.source === "parameter") {
      if (!(binding.name in params)) throw new Error("required workflow parameter is missing");
      result[key] = params[binding.name];
    } else {
      const ref = state.nodes[binding.nodeId]?.outputRef;
      if (!ref) throw new Error("workflow dependency output is unavailable");
      let value = await outputs.get({ workspaceId: snapshot.workspaceId, ref });
      for (const part of binding.path) {
        if (value === null || typeof value !== "object" || !(part in value)) {
          throw new Error("workflow dependency output path is unavailable");
        }
        value = (value as Record<string, unknown>)[part];
      }
      result[key] = value;
    }
  }
  return result;
}

function resolveParameters(snapshot: DurableWorkflowRunSnapshot): Record<string, unknown> {
  const allowed = new Set(snapshot.plan.parameters.map((parameter) => parameter.name));
  if (Object.keys(snapshot.params).some((name) => !allowed.has(name))) {
    throw new Error("workflow contains an unknown parameter");
  }
  const result = { ...snapshot.params };
  for (const parameter of snapshot.plan.parameters) {
    if (!(parameter.name in result) && Object.prototype.hasOwnProperty.call(parameter, "default")) {
      result[parameter.name] = parameter.default;
    }
  }
  return result;
}

function assertCapabilityMatchesPlan(
  node: CompiledWorkflowNode,
  capability: CapabilityDefinition,
): void {
  if (capability.id !== node.capability.id ||
    capability.version !== node.capability.version ||
    capability.kind !== node.capability.kind ||
    capability.mode !== node.capability.mode) {
    throw new Error("capability registry entry drifted from the compiled workflow plan");
  }
}

function authContext(command: WorkflowRunCommand): WorkflowRunAuthContext {
  return {
    workspaceId: command.workspaceId,
    runId: command.runId,
    userId: command.userId,
    credentialOwnerUserId: command.credentialOwnerUserId,
  };
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new InvocationTimeoutError("workflow capability timed out"));
      }, timeoutMs);
    });
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function eventTime(now: Date, events: readonly WorkflowRunEvent[]): string {
  const candidate = now.toISOString();
  const previous = events.at(-1)?.at;
  return previous && candidate < previous ? previous : candidate;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function jsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("workflow output is not JSON serializable");
  return Buffer.byteLength(serialized);
}

function safeErrorCode(value: string): string {
  return SAFE_ERROR_CODE.test(value) && !/^(?:sk|ak|token|bearer|api_key)_/i.test(value)
    ? value
    : "capability_error";
}

function safeReconciliationRef(value: string | undefined): string | undefined {
  return value?.startsWith("reconcile/") ? value : undefined;
}

function assertNoCredentialShape(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error("workflow output exceeds depth limit");
  if (typeof value === "string") {
    if (/^(?:bearer\s+|sk[-_]|ak[-_]|api[_-]?key[:=])/i.test(value.trim())) {
      throw new Error("workflow output contains credential-shaped text");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child) => assertNoCredentialShape(child, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/(?:authorization|api[_-]?key|credential|password|secret|token)/i.test(key)) {
      throw new Error("workflow output contains a credential-shaped key");
    }
    assertNoCredentialShape(child, depth + 1);
  }
}

function boundedRetry(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 3_600_000 ? value : DEFAULT_RETRY_DELAY_MS;
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertCommand(command: WorkflowRunCommand): void {
  for (const value of [command.workspaceId, command.runId, command.userId, command.credentialOwnerUserId]) {
    if (!UUID.test(value)) throw new Error("workflow run command is invalid");
  }
}
