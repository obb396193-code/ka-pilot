import { createHash } from "node:crypto";

import {
  CapabilityRegistry,
  type CapabilityDefinition,
  type CompiledWorkflowNode,
  type WorkflowInputBinding,
} from "@ka/domain";

import type {
  WorkflowCapabilityInvoker,
  WorkflowPermissionPort,
  WorkflowSimulationInput,
  WorkflowSimulationNodeResult,
  WorkflowSimulationResult,
} from "./types.js";

export interface WorkflowSimulationOptions {
  totalTimeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 100_000;

class MissingParameterError extends Error {}
class UnknownParameterError extends Error {}
class DependencyOutputError extends Error {}
class InvocationTimeoutError extends Error {}

export class WorkflowSimulationRunner {
  private readonly totalTimeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly invoker: WorkflowCapabilityInvoker,
    private readonly permissions: WorkflowPermissionPort,
    options: WorkflowSimulationOptions = {},
  ) {
    this.totalTimeoutMs = boundedInteger(
      options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
      "totalTimeoutMs",
      1,
      900_000,
    );
    this.maxOutputBytes = boundedInteger(
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      "maxOutputBytes",
      100,
      10_000_000,
    );
  }

  async simulate(input: WorkflowSimulationInput): Promise<WorkflowSimulationResult> {
    assertSimulationInput(input);
    const startedAt = Date.now();
    const outputs = new Map<string, unknown>();
    const results = new Map<string, WorkflowSimulationNodeResult>();
    let params: Readonly<Record<string, unknown>>;
    try {
      params = resolveParameters(input.plan.parameters, input.params);
    } catch (error) {
      if (!(error instanceof UnknownParameterError)) throw error;
      return {
        planFingerprint: input.plan.fingerprint,
        status: "blocked",
        nodes: input.plan.topologicalOrder.map((nodeId) => ({
          nodeId,
          status: "blocked",
          errorCode: "unknown_parameter",
        })),
      };
    }

    for (const nodeId of input.plan.topologicalOrder) {
      const node = input.plan.nodes[nodeId];
      if (!node) throw new Error(`Compiled workflow is missing node ${nodeId}`);
      if (hasBlockedDependency(input.plan.incoming[nodeId] ?? [], results)) {
        results.set(nodeId, { nodeId, status: "blocked", errorCode: "dependency_blocked" });
        continue;
      }
      if (Date.now() - startedAt >= this.totalTimeoutMs) {
        results.set(nodeId, { nodeId, status: "blocked", errorCode: "timeout" });
        continue;
      }
      results.set(
        nodeId,
        await this.simulateNode(input, node, params, outputs, startedAt),
      );
    }

    const nodes = input.plan.topologicalOrder.map((nodeId) => results.get(nodeId)!).filter(Boolean);
    const blocked = nodes.some((node) => !["ready", "would_wait_confirmation"].includes(node.status));
    const wouldWait = nodes.some((node) => node.status === "would_wait_confirmation");
    return {
      planFingerprint: input.plan.fingerprint,
      status: blocked ? "blocked" : wouldWait ? "would_wait_confirmation" : "ready",
      nodes,
    };
  }

  private async simulateNode(
    input: WorkflowSimulationInput,
    node: CompiledWorkflowNode,
    params: Readonly<Record<string, unknown>>,
    outputs: Map<string, unknown>,
    startedAt: number,
  ): Promise<WorkflowSimulationNodeResult> {
    const prepared = await this.prepareNode(input, node, params, outputs);
    if (!prepared.ok) return prepared.result;
    return this.invokePreparedNode(input, node, prepared, outputs, startedAt);
  }

  private async prepareNode(
    input: WorkflowSimulationInput,
    node: CompiledWorkflowNode,
    params: Readonly<Record<string, unknown>>,
    outputs: Map<string, unknown>,
  ): Promise<PreparedSimulationNode> {
    const capability = resolveSimulationCapability(this.registry, node);
    if (!capability) return blocked(node.id, "capability_unavailable");
    if (!capability.supportsSimulation) return blocked(node.id, "simulation_not_supported");
    const permission = await this.permissions.authorize({ auth: input.auth, nodeId: node.id, capability });
    if (!permission.allowed) {
      return blocked(
        node.id,
        permission.reason,
        permission.reason === "permission_denied" ? "permission_denied" : "blocked",
      );
    }
    const resolved = resolveSimulationInputs(node, params, outputs);
    if (!resolved.ok) return resolved;
    const parsedInput = capability.inputSchema.safeParse(resolved.values);
    if (!parsedInput.success) return blocked(node.id, "input_invalid");
    return { ok: true, capability, values: parsedInput.data };
  }

  private async invokePreparedNode(
    input: WorkflowSimulationInput,
    node: CompiledWorkflowNode,
    prepared: Extract<PreparedSimulationNode, { ok: true }>,
    outputs: Map<string, unknown>,
    startedAt: number,
  ): Promise<WorkflowSimulationNodeResult> {
    const { capability, values } = prepared;
    const inputHash = hashCanonical(values);
    const idempotencyKey = simulationIdempotencyKey(
      input.auth.simulationId,
      input.plan.fingerprint,
      node.id,
      capability.version,
      inputHash,
    );
    const mode = capability.mode === "execute" ? "preview" : capability.mode;
    const remainingMs = this.totalTimeoutMs - (Date.now() - startedAt);
    const timeoutMs = Math.max(1, Math.min(capability.timeoutMs, remainingMs));

    try {
      const output = await invokeWithTimeout(
        this.invoker,
        {
          auth: input.auth,
          capability,
          mode,
          values,
          idempotencyKey,
        },
        timeoutMs,
      );
      if (jsonBytes(output) > this.maxOutputBytes) {
        return { nodeId: node.id, status: "blocked", errorCode: "output_too_large", idempotencyKey };
      }
      const parsedOutput = capability.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        return { nodeId: node.id, status: "blocked", errorCode: "output_invalid", idempotencyKey };
      }
      outputs.set(node.id, parsedOutput.data);
      return {
        nodeId: node.id,
        status: capability.mode === "execute" ? "would_wait_confirmation" : "ready",
        output: parsedOutput.data,
        idempotencyKey,
      };
    } catch (error) {
      return {
        nodeId: node.id,
        status: "blocked",
        errorCode: error instanceof InvocationTimeoutError ? "timeout" : "capability_error",
        idempotencyKey,
      };
    }
  }
}

type PreparedSimulationNode =
  | { ok: true; capability: CapabilityDefinition; values: Record<string, unknown> }
  | { ok: false; result: WorkflowSimulationNodeResult };

function blocked(
  nodeId: string,
  errorCode: NonNullable<WorkflowSimulationNodeResult["errorCode"]>,
  status: WorkflowSimulationNodeResult["status"] = "blocked",
): Extract<PreparedSimulationNode, { ok: false }> {
  return { ok: false, result: { nodeId, status, errorCode } };
}

function resolveSimulationCapability(
  registry: CapabilityRegistry,
  node: CompiledWorkflowNode,
): CapabilityDefinition | null {
  try {
    const capability = registry.resolve(node.capability.id, node.capability.version);
    assertCapabilityMatchesPlan(node, capability);
    return capability;
  } catch {
    return null;
  }
}

function resolveSimulationInputs(
  node: CompiledWorkflowNode,
  params: Readonly<Record<string, unknown>>,
  outputs: ReadonlyMap<string, unknown>,
): { ok: true; values: Record<string, unknown> } | Extract<PreparedSimulationNode, { ok: false }> {
  try {
    return { ok: true, values: resolveNodeInputs(node.inputs, params, outputs) };
  } catch (error) {
    return error instanceof MissingParameterError
      ? blocked(node.id, "missing_parameter", "missing_data")
      : blocked(node.id, "dependency_blocked");
  }
}

function resolveParameters(
  definitions: readonly { name: string; type: string; required: boolean; default?: unknown }[],
  supplied: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const allowed = new Set(definitions.map((definition) => definition.name));
  for (const key of Object.keys(supplied)) {
    if (!allowed.has(key)) throw new UnknownParameterError(key);
  }
  const result: Record<string, unknown> = { ...supplied };
  for (const definition of definitions) {
    if (!(definition.name in result) && Object.prototype.hasOwnProperty.call(definition, "default")) {
      result[definition.name] = definition.default;
    }
  }
  return result;
}

function resolveNodeInputs(
  bindings: Readonly<Record<string, WorkflowInputBinding>>,
  params: Readonly<Record<string, unknown>>,
  outputs: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bindings).map(([key, binding]) => [
      key,
      resolveBinding(binding, params, outputs),
    ]),
  );
}

function resolveBinding(
  binding: WorkflowInputBinding,
  params: Readonly<Record<string, unknown>>,
  outputs: ReadonlyMap<string, unknown>,
): unknown {
  if (binding.source === "literal") return binding.value;
  if (binding.source === "parameter") {
    if (!(binding.name in params)) throw new MissingParameterError(binding.name);
    return params[binding.name];
  }
  if (!outputs.has(binding.nodeId)) throw new DependencyOutputError(binding.nodeId);
  let current = outputs.get(binding.nodeId);
  for (const part of binding.path) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      throw new DependencyOutputError(`${binding.nodeId}.${binding.path.join(".")}`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function hasBlockedDependency(
  dependencies: readonly string[],
  results: ReadonlyMap<string, WorkflowSimulationNodeResult>,
): boolean {
  return dependencies.some((nodeId) => {
    const status = results.get(nodeId)?.status;
    return status !== "ready" && status !== "would_wait_confirmation";
  });
}

function assertCapabilityMatchesPlan(
  node: CompiledWorkflowNode,
  capability: { id: string; version: string; kind: string; mode: string },
): void {
  if (
    capability.id !== node.capability.id ||
    capability.version !== node.capability.version ||
    capability.kind !== node.capability.kind ||
    capability.mode !== node.capability.mode
  ) {
    throw new Error("Capability registry entry drifted from the compiled workflow plan");
  }
}

async function invokeWithTimeout(
  invoker: WorkflowCapabilityInvoker,
  input: Omit<Parameters<WorkflowCapabilityInvoker["invoke"]>[0], "signal">,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new InvocationTimeoutError("workflow simulation capability timed out"));
      }, timeoutMs);
    });
    return await Promise.race([
      invoker.invoke({ ...input, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function jsonBytes(value: unknown): number {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("capability output is not JSON serializable");
  }
  if (serialized === undefined) throw new Error("capability output is not JSON serializable");
  return Buffer.byteLength(serialized);
}

function simulationIdempotencyKey(
  simulationId: string,
  fingerprint: string,
  nodeId: string,
  capabilityVersion: string,
  inputHash: string,
): string {
  return `wfsim_${createHash("sha256")
    .update(["b7-simulation-v1", simulationId, fingerprint, nodeId, capabilityVersion, inputHash].join("\u0000"))
    .digest("hex")}`;
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

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertSimulationInput(input: WorkflowSimulationInput): void {
  for (const [name, value] of [
    ["workspaceId", input.auth.workspaceId],
    ["userId", input.auth.userId],
    ["simulationId", input.auth.simulationId],
  ] as const) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new Error(`${name} is invalid`);
  }
  if (input.plan.topologicalOrder.length > 100) throw new Error("workflow plan exceeds node limit");
}
