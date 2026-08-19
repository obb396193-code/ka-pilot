import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  CapabilityRegistry,
  compileWorkflowGraph,
  type CapabilityDefinition,
  type WorkflowCompileInput,
} from "@ka/domain";

import { WorkflowSimulationRunner } from "../../src/workflows/simulation-runner.js";
import type {
  WorkflowCapabilityInvoker,
  WorkflowPermissionPort,
} from "../../src/workflows/types.js";

const auth = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  simulationId: "33333333-3333-4333-8333-333333333333",
};

function fixture(timeoutMs = 10_000) {
  const common = {
    version: "1.0.0",
    requiredPermissions: ["workflow:run"],
    supportsSimulation: true,
    timeoutMs,
    maxAttempts: 2,
  };
  const definitions: CapabilityDefinition[] = [
    {
      ...common,
      id: "load_metrics",
      kind: "data",
      mode: "read",
      description: "Load metrics",
      inputSchema: z.object({ accountId: z.string() }).strict(),
      outputSchema: z.object({ cost: z.number() }).strict(),
    },
    {
      ...common,
      id: "calculate_bid",
      kind: "compute",
      mode: "read",
      description: "Calculate bid",
      inputSchema: z.object({ cost: z.number() }).strict(),
      outputSchema: z.object({ bid: z.number() }).strict(),
    },
    {
      ...common,
      id: "change_bid",
      kind: "action",
      mode: "execute",
      description: "Preview a bid change",
      inputSchema: z.object({ bid: z.number() }).strict(),
      outputSchema: z.object({ changesetId: z.string(), bid: z.number() }).strict(),
      idempotencyScope: "object",
      requiresConfirmation: true,
    },
  ];
  const registry = new CapabilityRegistry(definitions);
  const input: WorkflowCompileInput = {
    graph: {
      version: "b7-internal-v1",
      nodes: [
        {
          id: "load",
          kind: "data",
          capability: { id: "load_metrics", version: "1.0.0" },
          inputs: { accountId: { source: "parameter", name: "account_id" } },
        },
        {
          id: "calculate",
          kind: "compute",
          capability: { id: "calculate_bid", version: "1.0.0" },
          inputs: { cost: { source: "node_output", nodeId: "load", path: ["cost"] } },
        },
        {
          id: "change",
          kind: "action",
          capability: { id: "change_bid", version: "1.0.0" },
          inputs: { bid: { source: "node_output", nodeId: "calculate", path: ["bid"] } },
          config: { confirmation: "required" },
        },
      ],
      edges: [
        { id: "e1", source: "load", target: "calculate" },
        { id: "e2", source: "calculate", target: "change" },
      ],
    },
    paramsSchema: {
      version: "b7-params-v1",
      parameters: [{ name: "account_id", type: "string", required: true }],
    },
  };
  return { registry, plan: compileWorkflowGraph(input, registry) };
}

function allowAll(): WorkflowPermissionPort {
  return { authorize: vi.fn(async () => ({ allowed: true as const })) };
}

describe("WorkflowSimulationRunner", () => {
  it("resolves dependency bindings and previews execute nodes without execute mode", async () => {
    const { registry, plan } = fixture();
    const modes: string[] = [];
    let executeCalls = 0;
    const invoker: WorkflowCapabilityInvoker = {
      invoke: vi.fn(async ({ capability, mode, values }) => {
        modes.push(mode);
        if ((mode as string) === "execute") executeCalls += 1;
        if (capability.id === "load_metrics") return { cost: values.accountId === "a-1" ? 100 : 0 };
        if (capability.id === "calculate_bid") return { bid: (values.cost as number) / 10 };
        return { changesetId: "preview-1", bid: values.bid };
      }),
    };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll()).simulate({
      auth,
      plan,
      params: { account_id: "a-1" },
    });

    expect(result.status).toBe("would_wait_confirmation");
    expect(result.nodes.map((node) => [node.nodeId, node.status])).toEqual([
      ["load", "ready"],
      ["calculate", "ready"],
      ["change", "would_wait_confirmation"],
    ]);
    expect(result.nodes[1]?.output).toEqual({ bid: 10 });
    expect(modes).toEqual(["read", "read", "preview"]);
    expect(executeCalls).toBe(0);
  });

  it("reports missing parameters without invoking any capability", async () => {
    const { registry, plan } = fixture();
    const invoker: WorkflowCapabilityInvoker = { invoke: vi.fn() };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll()).simulate({
      auth,
      plan,
      params: {},
    });

    expect(result.status).toBe("blocked");
    expect(result.nodes[0]).toMatchObject({ status: "missing_data", errorCode: "missing_parameter" });
    expect(invoker.invoke).not.toHaveBeenCalled();
  });

  it("fails closed on unknown parameters without exposing their values", async () => {
    const { registry, plan } = fixture();
    const invoker: WorkflowCapabilityInvoker = { invoke: vi.fn() };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll()).simulate({
      auth,
      plan,
      params: { account_id: "a-1", injected: "sk-live-should-never-appear" },
    });

    expect(result.status).toBe("blocked");
    expect(result.nodes[0]).toMatchObject({ status: "blocked", errorCode: "unknown_parameter" });
    expect(JSON.stringify(result)).not.toContain("sk-live-should-never-appear");
    expect(invoker.invoke).not.toHaveBeenCalled();
  });

  it("fails closed on permission denial and exact capability unavailability", async () => {
    const { registry, plan } = fixture();
    const invoker: WorkflowCapabilityInvoker = { invoke: vi.fn() };
    const denied: WorkflowPermissionPort = {
      authorize: async () => ({ allowed: false, reason: "permission_denied" }),
    };
    const deniedResult = await new WorkflowSimulationRunner(registry, invoker, denied).simulate({
      auth,
      plan,
      params: { account_id: "a-1" },
    });
    expect(deniedResult.nodes[0]).toMatchObject({ status: "permission_denied" });
    expect(invoker.invoke).not.toHaveBeenCalled();

    const unavailableResult = await new WorkflowSimulationRunner(
      new CapabilityRegistry(),
      invoker,
      allowAll(),
    ).simulate({ auth, plan, params: { account_id: "a-1" } });
    expect(unavailableResult.nodes[0]).toMatchObject({
      status: "blocked",
      errorCode: "capability_unavailable",
    });
  });

  it("blocks invalid outputs and never passes them downstream", async () => {
    const { registry, plan } = fixture();
    const invoker: WorkflowCapabilityInvoker = {
      invoke: vi.fn(async ({ capability }) =>
        capability.id === "load_metrics" ? { cost: "not-a-number" } : { bid: 1 }),
    };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll()).simulate({
      auth,
      plan,
      params: { account_id: "a-1" },
    });

    expect(result.nodes[0]).toMatchObject({ status: "blocked", errorCode: "output_invalid" });
    expect(result.nodes[1]).toMatchObject({ status: "blocked", errorCode: "dependency_blocked" });
    expect(invoker.invoke).toHaveBeenCalledTimes(1);
  });

  it("times out with a stable safe error and does not reveal the thrown secret", async () => {
    const { registry, plan } = fixture(5);
    const invoker: WorkflowCapabilityInvoker = {
      invoke: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error("sk-live-should-never-appear");
      }),
    };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll(), {
      totalTimeoutMs: 100,
    }).simulate({ auth, plan, params: { account_id: "a-1" } });

    expect(result.nodes[0]).toMatchObject({ status: "blocked", errorCode: "timeout" });
    expect(JSON.stringify(result)).not.toContain("sk-live-should-never-appear");
  });

  it("caps output bytes before storing simulation results", async () => {
    const { registry, plan } = fixture();
    const invoker: WorkflowCapabilityInvoker = {
      invoke: vi.fn(async ({ capability }) =>
        capability.id === "load_metrics"
          ? { cost: 100, padding: "x".repeat(2_000) }
          : { bid: 1 }),
    };
    const result = await new WorkflowSimulationRunner(registry, invoker, allowAll(), {
      maxOutputBytes: 1_000,
    }).simulate({ auth, plan, params: { account_id: "a-1" } });

    expect(result.nodes[0]).toMatchObject({ status: "blocked", errorCode: "output_too_large" });
    expect(result.nodes[0]).not.toHaveProperty("output");
  });
});
