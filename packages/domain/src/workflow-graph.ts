import { createHash } from "node:crypto";

import { z } from "zod";

import {
  CAPABILITY_KINDS,
  type CapabilityDefinition,
  type CapabilityKind,
  type CapabilityMode,
  type CapabilityRegistry,
} from "./capability-registry.js";

export const INTERNAL_WORKFLOW_GRAPH_VERSION = "b7-internal-v1" as const;
export const INTERNAL_WORKFLOW_PARAMS_VERSION = "b7-params-v1" as const;
export const COMPILED_WORKFLOW_PLAN_VERSION = "b7-compiled-v1" as const;

const safeIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/, "workflow node id must be a safe identifier");
const safeParameterSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, "workflow parameter name must be a safe identifier");
const safePathPartSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "node output path is invalid");

const literalBindingSchema = z
  .object({ source: z.literal("literal"), value: z.unknown() })
  .strict();
const parameterBindingSchema = z
  .object({ source: z.literal("parameter"), name: safeParameterSchema })
  .strict();
const outputBindingSchema = z
  .object({
    source: z.literal("node_output"),
    nodeId: safeIdSchema,
    path: z.array(safePathPartSchema).max(16),
  })
  .strict();
const inputBindingSchema = z.discriminatedUnion("source", [
  literalBindingSchema,
  parameterBindingSchema,
  outputBindingSchema,
]);

const nodeSchema = z
  .object({
    id: safeIdSchema,
    kind: z.enum(CAPABILITY_KINDS),
    capability: z
      .object({
        id: z.string().min(1).max(64),
        version: z.string().min(1).max(64),
      })
      .strict(),
    inputs: z.record(z.string().min(1).max(128), inputBindingSchema),
    config: z
      .object({
        confirmation: z.literal("required").optional(),
        timeoutMs: z.number().int().min(1).max(900_000).optional(),
        maxAttempts: z.number().int().min(1).max(10).optional(),
      })
      .strict()
      .optional(),
    ui: z
      .object({
        position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
        label: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const edgeSchema = z
  .object({
    id: safeIdSchema,
    source: safeIdSchema,
    target: safeIdSchema,
  })
  .strict();

const graphSchema = z
  .object({
    version: z.literal(INTERNAL_WORKFLOW_GRAPH_VERSION),
    nodes: z.array(nodeSchema).min(1).max(100),
    edges: z.array(edgeSchema).max(200),
  })
  .strict();

const parameterSchema = z
  .object({
    name: safeParameterSchema,
    type: z.enum(["string", "number", "boolean", "object", "array"]),
    required: z.boolean(),
    default: z.unknown().optional(),
  })
  .strict();

const compileInputSchema = z
  .object({
    graph: graphSchema,
    paramsSchema: z
      .object({
        version: z.literal(INTERNAL_WORKFLOW_PARAMS_VERSION),
        parameters: z.array(parameterSchema).max(100),
      })
      .strict(),
  })
  .strict();

export type WorkflowInputBinding = z.infer<typeof inputBindingSchema>;
export type WorkflowParameter = z.infer<typeof parameterSchema>;
export type WorkflowCompileInput = z.input<typeof compileInputSchema>;

export interface CompiledCapabilityReference {
  id: string;
  version: string;
  kind: CapabilityKind;
  mode: CapabilityMode;
  timeoutMs: number;
  maxAttempts: number;
  supportsSimulation: boolean;
  requiresConfirmation: boolean;
  requiredPermissions: readonly string[];
}

export interface CompiledWorkflowNode {
  id: string;
  kind: CapabilityKind;
  capability: CompiledCapabilityReference;
  inputs: Readonly<Record<string, WorkflowInputBinding>>;
}

export interface CompiledWorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface CompiledWorkflowPlan {
  version: typeof COMPILED_WORKFLOW_PLAN_VERSION;
  graphVersion: typeof INTERNAL_WORKFLOW_GRAPH_VERSION;
  paramsVersion: typeof INTERNAL_WORKFLOW_PARAMS_VERSION;
  parameters: readonly WorkflowParameter[];
  nodes: Readonly<Record<string, CompiledWorkflowNode>>;
  edges: readonly CompiledWorkflowEdge[];
  incoming: Readonly<Record<string, readonly string[]>>;
  outgoing: Readonly<Record<string, readonly string[]>>;
  topologicalOrder: readonly string[];
  fingerprint: string;
}

type ParsedInput = z.infer<typeof compileInputSchema>;
type ParsedNode = ParsedInput["graph"]["nodes"][number];
type ParsedEdge = ParsedInput["graph"]["edges"][number];

export function compileWorkflowGraph(
  input: unknown,
  registry: CapabilityRegistry,
): CompiledWorkflowPlan {
  const parsed = compileInputSchema.parse(input);
  const parameters = validateParameters(parsed.paramsSchema.parameters);
  const nodeMap = uniqueNodes(parsed.graph.nodes);
  const graph = buildGraph(nodeMap, parsed.graph.edges);
  const topologicalOrder = stableTopologicalOrder(nodeMap, graph.incoming, graph.outgoing);
  assertConnected(topologicalOrder, graph.incoming, graph.outgoing);
  const ancestors = buildAncestors(topologicalOrder, graph.incoming);

  const compiledNodes: Record<string, CompiledWorkflowNode> = {};
  for (const nodeId of topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) throw new Error(`Missing workflow node ${nodeId}`);
    const capability = registry.resolve(node.capability.id, node.capability.version);
    compiledNodes[nodeId] = compileNode(node, capability, parameters, ancestors.get(nodeId));
  }

  const planWithoutFingerprint = {
    version: COMPILED_WORKFLOW_PLAN_VERSION,
    graphVersion: INTERNAL_WORKFLOW_GRAPH_VERSION,
    paramsVersion: INTERNAL_WORKFLOW_PARAMS_VERSION,
    parameters,
    nodes: compiledNodes,
    edges: graph.edges,
    incoming: graph.incoming,
    outgoing: graph.outgoing,
    topologicalOrder,
  };
  const fingerprint = hashCanonical(planWithoutFingerprint);
  return Object.freeze({ ...planWithoutFingerprint, fingerprint });
}

function validateParameters(input: readonly WorkflowParameter[]): readonly WorkflowParameter[] {
  const names = new Set<string>();
  return input.map((parameter) => {
    if (names.has(parameter.name)) {
      throw new Error(`Duplicate workflow parameter ${parameter.name}`);
    }
    names.add(parameter.name);
    if (Object.prototype.hasOwnProperty.call(parameter, "default")) {
      assertJsonValue(parameter.default, `workflow parameter default ${parameter.name}`);
      if (!matchesParameterType(parameter.default, parameter.type)) {
        throw new Error(`Invalid workflow parameter default for ${parameter.name}`);
      }
    }
    return Object.freeze({ ...parameter });
  });
}

function matchesParameterType(value: unknown, type: WorkflowParameter["type"]): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function uniqueNodes(nodes: readonly ParsedNode[]): Map<string, ParsedNode> {
  const result = new Map<string, ParsedNode>();
  for (const node of nodes) {
    if (result.has(node.id)) throw new Error(`Duplicate workflow node ${node.id}`);
    result.set(node.id, node);
  }
  return result;
}

function buildGraph(nodes: Map<string, ParsedNode>, edges: readonly ParsedEdge[]) {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  const edgeIds = new Set<string>();
  const dependencies = new Set<string>();
  for (const id of nodes.keys()) {
    incoming[id] = [];
    outgoing[id] = [];
  }
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate workflow edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodes.has(edge.source)) throw new Error(`Workflow edge has unknown source ${edge.source}`);
    if (!nodes.has(edge.target)) throw new Error(`Workflow edge has unknown target ${edge.target}`);
    if (edge.source === edge.target) throw new Error(`Workflow edge ${edge.id} is a self-loop`);
    const dependency = `${edge.source}\u0000${edge.target}`;
    if (dependencies.has(dependency)) {
      throw new Error(`Duplicate workflow dependency ${edge.source} -> ${edge.target}`);
    }
    dependencies.add(dependency);
    incoming[edge.target]!.push(edge.source);
    outgoing[edge.source]!.push(edge.target);
  }
  for (const values of [...Object.values(incoming), ...Object.values(outgoing)]) values.sort();
  const sortedEdges = [...edges].sort((left, right) => {
    return `${left.source}\u0000${left.target}\u0000${left.id}`.localeCompare(
      `${right.source}\u0000${right.target}\u0000${right.id}`,
    );
  });
  return { incoming, outgoing, edges: sortedEdges };
}

function stableTopologicalOrder(
  nodes: Map<string, ParsedNode>,
  incoming: Readonly<Record<string, readonly string[]>>,
  outgoing: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const degree = new Map([...nodes.keys()].map((id) => [id, incoming[id]?.length ?? 0]));
  const ready = [...degree.entries()].filter(([, value]) => value === 0).map(([id]) => id).sort();
  const result: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    result.push(current);
    for (const next of outgoing[current] ?? []) {
      const remaining = (degree.get(next) ?? 0) - 1;
      degree.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (result.length !== nodes.size) throw new Error("Workflow graph contains a cycle");
  return result;
}

function assertConnected(
  order: readonly string[],
  incoming: Readonly<Record<string, readonly string[]>>,
  outgoing: Readonly<Record<string, readonly string[]>>,
): void {
  const first = order[0];
  if (!first) throw new Error("Workflow graph requires a node");
  const seen = new Set([first]);
  const queue = [first];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const adjacent of [...(incoming[current] ?? []), ...(outgoing[current] ?? [])]) {
      if (seen.has(adjacent)) continue;
      seen.add(adjacent);
      queue.push(adjacent);
    }
  }
  if (seen.size !== order.length) throw new Error("Workflow graph contains a disconnected island");
}

function buildAncestors(
  order: readonly string[],
  incoming: Readonly<Record<string, readonly string[]>>,
): Map<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const nodeId of order) {
    const ancestors = new Set<string>();
    for (const parent of incoming[nodeId] ?? []) {
      ancestors.add(parent);
      for (const ancestor of result.get(parent) ?? []) ancestors.add(ancestor);
    }
    result.set(nodeId, ancestors);
  }
  return result;
}

function compileNode(
  node: ParsedNode,
  capability: CapabilityDefinition,
  parameters: readonly WorkflowParameter[],
  ancestors: ReadonlySet<string> | undefined,
): CompiledWorkflowNode {
  assertNodeCapability(node, capability);
  const { timeoutMs, maxAttempts } = resolveNodeLimits(node, capability);
  validateBindings(node, capability, new Set(parameters.map((item) => item.name)), ancestors);
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    capability: Object.freeze({
      id: capability.id,
      version: capability.version,
      kind: capability.kind,
      mode: capability.mode,
      timeoutMs,
      maxAttempts,
      supportsSimulation: capability.supportsSimulation,
      requiresConfirmation: capability.requiresConfirmation === true,
      requiredPermissions: Object.freeze([...capability.requiredPermissions]),
    }),
    inputs: Object.freeze({ ...node.inputs }),
  });
}

function assertNodeCapability(node: ParsedNode, capability: CapabilityDefinition): void {
  if (node.kind !== capability.kind) {
    throw new Error(`Workflow node ${node.id} kind does not match its capability`);
  }
  if (capability.mode === "execute" && node.config?.confirmation !== "required") {
    throw new Error(`Workflow node ${node.id} execute capability requires confirmation`);
  }
}

function resolveNodeLimits(
  node: ParsedNode,
  capability: CapabilityDefinition,
): { timeoutMs: number; maxAttempts: number } {
  const timeoutMs = node.config?.timeoutMs ?? capability.timeoutMs;
  const maxAttempts = node.config?.maxAttempts ?? capability.maxAttempts;
  if (timeoutMs > capability.timeoutMs) {
    throw new Error(`Workflow node ${node.id} timeout exceeds capability limit`);
  }
  if (maxAttempts > capability.maxAttempts) {
    throw new Error(`Workflow node ${node.id} maxAttempts exceeds capability limit`);
  }
  return { timeoutMs, maxAttempts };
}

function validateBindings(
  node: ParsedNode,
  capability: CapabilityDefinition,
  parameters: ReadonlySet<string>,
  ancestors: ReadonlySet<string> | undefined,
): void {
  if (!(capability.inputSchema instanceof z.ZodObject)) {
    throw new Error(`Capability ${capability.id} inputSchema must be an object schema`);
  }
  const shape = capability.inputSchema.shape;
  for (const key of Object.keys(node.inputs)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) throw new Error(`Unknown capability input ${key} on node ${node.id}`);
    const binding = node.inputs[key];
    if (!binding) continue;
    validateBinding(node.id, key, binding, fieldSchema, parameters, ancestors);
  }
  validateRequiredBindings(node, shape);
}

function validateBinding(
  nodeId: string,
  key: string,
  binding: WorkflowInputBinding,
  fieldSchema: z.ZodType,
  parameters: ReadonlySet<string>,
  ancestors: ReadonlySet<string> | undefined,
): void {
  if (binding.source === "parameter" && !parameters.has(binding.name)) {
    throw new Error(`Unknown workflow parameter ${binding.name}`);
  }
  if (binding.source === "node_output" && !ancestors?.has(binding.nodeId)) {
    throw new Error(`Node output ${binding.nodeId} is not upstream of ${nodeId}`);
  }
  if (binding.source !== "literal") return;
  assertJsonValue(binding.value, `literal input ${nodeId}.${key}`);
  if (!fieldSchema.safeParse(binding.value).success) {
    throw new Error(`Invalid literal for capability input ${nodeId}.${key}`);
  }
}

function validateRequiredBindings(
  node: ParsedNode,
  shape: Record<string, z.ZodType>,
): void {
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (!(key in node.inputs) && !fieldSchema.safeParse(undefined).success) {
      throw new Error(`Missing capability input ${key} on node ${node.id}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value: unknown, label: string, depth = 0): void {
  if (depth > 32) throw new Error(`${label} exceeds JSON depth limit`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain finite JSON numbers`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertJsonValue(item, label, depth + 1));
    return;
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => assertJsonValue(item, label, depth + 1));
    return;
  }
  throw new Error(`${label} must be JSON serializable`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function fingerprintWorkflowPlan(plan: CompiledWorkflowPlan): string {
  const content = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "fingerprint"),
  );
  return hashCanonical(content);
}
