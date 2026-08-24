import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CapabilityRegistry,
  compileWorkflowGraph,
  fingerprintWorkflowPlan,
  type CapabilityDefinition,
  type WorkflowCompileInput,
} from "../src/index.js";

function capabilities(): CapabilityRegistry {
  const common = {
    version: "1.0.0",
    requiredPermissions: [] as string[],
    supportsSimulation: true,
    timeoutMs: 10_000,
    maxAttempts: 2,
  };
  const entries: CapabilityDefinition[] = [
    {
      ...common,
      id: "load_metrics",
      kind: "data",
      mode: "read",
      description: "Load trusted metrics",
      inputSchema: z.object({ accountId: z.string() }).strict(),
      outputSchema: z.object({ cost: z.number() }).strict(),
    },
    {
      ...common,
      id: "calculate_gap",
      kind: "compute",
      mode: "read",
      description: "Calculate a deterministic gap",
      inputSchema: z.object({ cost: z.number() }).strict(),
      outputSchema: z.object({ gap: z.number() }).strict(),
    },
    {
      ...common,
      id: "diagnose_account",
      kind: "agent",
      mode: "preview",
      description: "Create a structured diagnosis",
      inputSchema: z.object({ gap: z.number() }).strict(),
      outputSchema: z.object({ action: z.string() }).strict(),
      exposeToAgent: true,
    },
    {
      ...common,
      id: "change_bid",
      kind: "action",
      mode: "execute",
      description: "Preview and confirm a bid change",
      inputSchema: z.object({ accountId: z.string(), action: z.string() }).strict(),
      outputSchema: z.object({ changesetId: z.string() }).strict(),
      idempotencyScope: "object",
      requiresConfirmation: true,
    },
    {
      ...common,
      id: "create_work_item",
      kind: "collaboration",
      mode: "preview",
      description: "Prepare a work item",
      inputSchema: z.object({ changesetId: z.string() }).strict(),
      outputSchema: z.object({ workItemId: z.string() }).strict(),
    },
    {
      ...common,
      id: "finish_workflow",
      kind: "control",
      mode: "read",
      description: "Finish a workflow branch",
      inputSchema: z.object({ workItemId: z.string() }).strict(),
      outputSchema: z.object({ done: z.boolean() }).strict(),
    },
  ];
  return new CapabilityRegistry(entries);
}

function validInput(): WorkflowCompileInput {
  return {
    graph: {
      version: "b7-internal-v1",
      nodes: [
        {
          id: "load",
          kind: "data",
          capability: { id: "load_metrics", version: "1.0.0" },
          inputs: { accountId: { source: "parameter", name: "account_id" } },
          ui: { position: { x: 10, y: 20 }, label: "读取数据" },
        },
        {
          id: "gap",
          kind: "compute",
          capability: { id: "calculate_gap", version: "1.0.0" },
          inputs: { cost: { source: "node_output", nodeId: "load", path: ["cost"] } },
        },
        {
          id: "diagnose",
          kind: "agent",
          capability: { id: "diagnose_account", version: "1.0.0" },
          inputs: { gap: { source: "node_output", nodeId: "gap", path: ["gap"] } },
        },
        {
          id: "change",
          kind: "action",
          capability: { id: "change_bid", version: "1.0.0" },
          inputs: {
            accountId: { source: "parameter", name: "account_id" },
            action: { source: "node_output", nodeId: "diagnose", path: ["action"] },
          },
          config: { confirmation: "required", timeoutMs: 8_000, maxAttempts: 1 },
        },
        {
          id: "collaborate",
          kind: "collaboration",
          capability: { id: "create_work_item", version: "1.0.0" },
          inputs: {
            changesetId: { source: "node_output", nodeId: "change", path: ["changesetId"] },
          },
        },
        {
          id: "finish",
          kind: "control",
          capability: { id: "finish_workflow", version: "1.0.0" },
          inputs: {
            workItemId: {
              source: "node_output",
              nodeId: "collaborate",
              path: ["workItemId"],
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "load", target: "gap" },
        { id: "e2", source: "gap", target: "diagnose" },
        { id: "e3", source: "diagnose", target: "change" },
        { id: "e4", source: "change", target: "collaborate" },
        { id: "e5", source: "collaborate", target: "finish" },
      ],
    },
    paramsSchema: {
      version: "b7-params-v1",
      parameters: [{ name: "account_id", type: "string", required: true }],
    },
  };
}

describe("compileWorkflowGraph", () => {
  it("compiles a six-kind DAG with pinned capabilities and stable order", () => {
    const plan = compileWorkflowGraph(validInput(), capabilities());

    expect(plan.version).toBe("b7-compiled-v1");
    expect(plan.topologicalOrder).toEqual([
      "load",
      "gap",
      "diagnose",
      "change",
      "collaborate",
      "finish",
    ]);
    expect(plan.nodes.change!.capability).toMatchObject({
      id: "change_bid",
      version: "1.0.0",
      mode: "execute",
      requiresConfirmation: true,
    });
    expect(plan.nodes.load).not.toHaveProperty("ui");
    expect(plan.fingerprint).toBe(fingerprintWorkflowPlan(plan));
  });

  it("excludes React Flow presentation data from the execution fingerprint", () => {
    const first = validInput();
    const second = structuredClone(first);
    second.graph.nodes[0]!.ui = { position: { x: 999, y: -25 }, label: "另一个标题" };

    expect(compileWorkflowGraph(first, capabilities()).fingerprint).toBe(
      compileWorkflowGraph(second, capabilities()).fingerprint,
    );
  });

  it.each([
    ["unknown top-level field", (input: ReturnType<typeof validInput>) => Object.assign(input, { sql: "select 1" }), "Unrecognized key"],
    ["unknown graph field", (input: ReturnType<typeof validInput>) => Object.assign(input.graph, { shell: "rm" }), "Unrecognized key"],
    ["unknown node field", (input: ReturnType<typeof validInput>) => Object.assign(input.graph.nodes[0]!, { url: "https://example.test" }), "Unrecognized key"],
    ["unsafe node id", (input: ReturnType<typeof validInput>) => { input.graph.nodes[0]!.id = "../load"; }, "node id"],
    ["duplicate node id", (input: ReturnType<typeof validInput>) => { input.graph.nodes[1]!.id = "load"; }, "Duplicate workflow node"],
    ["missing edge endpoint", (input: ReturnType<typeof validInput>) => { input.graph.edges[0]!.target = "missing"; }, "unknown target"],
    ["self loop", (input: ReturnType<typeof validInput>) => { input.graph.edges[0]!.target = "load"; }, "self-loop"],
    ["capability version drift", (input: ReturnType<typeof validInput>) => { input.graph.nodes[0]!.capability.version = "2.0.0"; }, "Unknown capability version"],
    ["kind mismatch", (input: ReturnType<typeof validInput>) => { input.graph.nodes[0]!.kind = "agent"; }, "kind does not match"],
    ["missing confirmation policy", (input: ReturnType<typeof validInput>) => { delete input.graph.nodes[3]!.config; }, "confirmation"],
    ["unknown parameter", (input: ReturnType<typeof validInput>) => { input.graph.nodes[0]!.inputs.accountId = { source: "parameter", name: "missing" }; }, "Unknown workflow parameter"],
    ["non-upstream output", (input: ReturnType<typeof validInput>) => { input.graph.nodes[1]!.inputs.cost = { source: "node_output", nodeId: "finish", path: ["done"] }; }, "upstream"],
    ["unknown input key", (input: ReturnType<typeof validInput>) => { Object.assign(input.graph.nodes[0]!.inputs, { extra: { source: "literal", value: 1 } }); }, "Unknown capability input"],
    ["bad literal", (input: ReturnType<typeof validInput>) => { input.graph.nodes[0]!.inputs.accountId = { source: "literal", value: 12 }; }, "Invalid literal"],
  ] as const)("rejects %s", (_name, mutate, message) => {
    const input = validInput();
    mutate(input);
    expect(() => compileWorkflowGraph(input, capabilities())).toThrow(message);
  });

  it("rejects cycles and disconnected workflow islands", () => {
    const cycle = validInput();
    cycle.graph.edges.push({ id: "e6", source: "finish", target: "load" });
    expect(() => compileWorkflowGraph(cycle, capabilities())).toThrow("cycle");

    const island = validInput();
    island.graph.edges = island.graph.edges.filter((edge) => edge.id !== "e5");
    expect(() => compileWorkflowGraph(island, capabilities())).toThrow("disconnected");
  });

  it("rejects duplicate edges and oversized graphs before execution", () => {
    const duplicateEdge = validInput();
    duplicateEdge.graph.edges.push({ id: "e6", source: "load", target: "gap" });
    expect(() => compileWorkflowGraph(duplicateEdge, capabilities())).toThrow(
      "Duplicate workflow dependency",
    );

    const tooMany = validInput();
    tooMany.graph.nodes = Array.from({ length: 101 }, (_, index) => ({
      id: `node_${index}`,
      kind: "data" as const,
      capability: { id: "load_metrics", version: "1.0.0" },
      inputs: { accountId: { source: "literal" as const, value: "account" } },
    }));
    tooMany.graph.edges = [];
    expect(() => compileWorkflowGraph(tooMany, capabilities())).toThrow();
  });

  it("validates parameter defaults and duplicate parameter names", () => {
    const invalidDefault = validInput();
    invalidDefault.paramsSchema.parameters[0] = {
      name: "account_id",
      type: "number",
      required: true,
      default: "not-a-number",
    };
    expect(() => compileWorkflowGraph(invalidDefault, capabilities())).toThrow(
      "parameter default",
    );

    const duplicate = validInput();
    duplicate.paramsSchema.parameters.push({
      name: "account_id",
      type: "string",
      required: false,
    });
    expect(() => compileWorkflowGraph(duplicate, capabilities())).toThrow(
      "Duplicate workflow parameter",
    );
  });
});
