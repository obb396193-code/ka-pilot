import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CapabilityRegistry,
  compileWorkflowGraph,
  planWorkflowAdvance,
  replayWorkflowRun,
  workflowNodeIdempotencyKey,
  type CapabilityDefinition,
  type WorkflowCompileInput,
  type WorkflowRunEvent,
} from "../src/index.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHANGESET_ID = "22222222-2222-4222-8222-222222222222";

function plan() {
  const common = {
    version: "1.0.0",
    requiredPermissions: [] as string[],
    supportsSimulation: true,
    timeoutMs: 10_000,
    maxAttempts: 2,
  };
  const capabilities: CapabilityDefinition[] = [
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
      id: "calculate",
      kind: "compute",
      mode: "read",
      description: "Calculate",
      inputSchema: z.object({ cost: z.number() }).strict(),
      outputSchema: z.object({ bid: z.number() }).strict(),
    },
    {
      ...common,
      id: "change_bid",
      kind: "action",
      mode: "execute",
      description: "Change a bid",
      inputSchema: z.object({ bid: z.number() }).strict(),
      outputSchema: z.object({ changed: z.boolean() }).strict(),
      maxAttempts: 1,
      idempotencyScope: "object",
      requiresConfirmation: true,
    },
  ];
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
          capability: { id: "calculate", version: "1.0.0" },
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
  return compileWorkflowGraph(input, new CapabilityRegistry(capabilities));
}

function at(second: number): string {
  return `2026-08-19T00:00:${String(second).padStart(2, "0")}.000Z`;
}

type EventWithoutMeta = WorkflowRunEvent extends infer Event
  ? Event extends WorkflowRunEvent
    ? Omit<Event, "sequence" | "at">
    : never
  : never;

function event(
  sequence: number,
  value: EventWithoutMeta,
): WorkflowRunEvent {
  return { ...value, sequence, at: at(sequence) } as WorkflowRunEvent;
}

describe("workflow run replay", () => {
  it("advances a fixed plan through confirmation to success", () => {
    const workflow = plan();
    expect(planWorkflowAdvance(replayWorkflowRun(workflow, []), at(0))).toEqual({
      kind: "start_run",
    });

    const events: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, {
        kind: "node_started",
        nodeId: "load",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_load",
      }),
      event(3, { kind: "node_succeeded", nodeId: "load", attempt: 1, outputRef: "artifact/load" }),
      event(4, {
        kind: "node_started",
        nodeId: "calculate",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_calculate",
      }),
      event(5, { kind: "node_succeeded", nodeId: "calculate", attempt: 1, outputRef: "artifact/calculate" }),
      event(6, {
        kind: "node_started",
        nodeId: "change",
        attempt: 1,
        inputHash: HASH_B,
        idempotencyKey: "wfnode_change",
      }),
      event(7, {
        kind: "node_waiting_confirmation",
        nodeId: "change",
        attempt: 1,
        changesetId: CHANGESET_ID,
        previewHash: HASH_B,
      }),
    ];
    let state = replayWorkflowRun(workflow, events);
    expect(state.status).toBe("waiting_confirmation");
    expect(planWorkflowAdvance(state, at(8))).toMatchObject({
      kind: "waiting_confirmation",
      nodeId: "change",
      previewHash: HASH_B,
    });

    events.push(
      event(8, {
        kind: "node_confirmation_received",
        nodeId: "change",
        previewHash: HASH_B,
        confirmedBy: USER_ID,
      }),
    );
    state = replayWorkflowRun(workflow, events);
    expect(planWorkflowAdvance(state, at(9))).toEqual({
      kind: "run_nodes",
      nodes: [{ nodeId: "change", attempt: 1, phase: "execute_confirmed" }],
    });

    events.push(
      event(9, { kind: "node_succeeded", nodeId: "change", attempt: 1, outputRef: "execution/change" }),
    );
    state = replayWorkflowRun(workflow, events);
    expect(planWorkflowAdvance(state, at(10))).toEqual({
      kind: "finish_run",
      status: "succeeded",
    });

    events.push(event(10, { kind: "run_finished", status: "succeeded" }));
    state = replayWorkflowRun(workflow, events);
    expect(state.status).toBe("succeeded");
    expect(planWorkflowAdvance(state, at(11))).toEqual({
      kind: "terminal",
      status: "succeeded",
    });
  });

  it("schedules a bounded retry and never reruns successful nodes", () => {
    const workflow = plan();
    const events: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, {
        kind: "node_started",
        nodeId: "load",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_load_1",
      }),
      event(3, {
        kind: "node_retry_scheduled",
        nodeId: "load",
        attempt: 1,
        retryAt: at(8),
        errorCode: "upstream_timeout",
      }),
    ];

    expect(planWorkflowAdvance(replayWorkflowRun(workflow, events), at(7))).toEqual({
      kind: "retry_wait",
      retryAt: at(8),
    });
    expect(planWorkflowAdvance(replayWorkflowRun(workflow, events), at(8))).toEqual({
      kind: "run_nodes",
      nodes: [{ nodeId: "load", attempt: 2, phase: "invoke" }],
    });

    events.push(
      { ...event(4, {
        kind: "node_started",
        nodeId: "load",
        attempt: 2,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_load_2",
      }), at: at(8) },
      { ...event(5, { kind: "node_succeeded", nodeId: "load", attempt: 2, outputRef: "artifact/load" }), at: at(9) },
    );
    expect(planWorkflowAdvance(replayWorkflowRun(workflow, events), at(9))).toEqual({
      kind: "run_nodes",
      nodes: [{ nodeId: "calculate", attempt: 1, phase: "invoke" }],
    });

    expect(() =>
      replayWorkflowRun(workflow, [
        ...events.slice(0, 4),
        { ...event(5, {
          kind: "node_retry_scheduled",
          nodeId: "load",
          attempt: 2,
          retryAt: at(9),
          errorCode: "still_failing",
        }), at: at(9) },
      ]),
    ).toThrow("maximum attempts");
  });

  it("pauses and resumes without losing node state", () => {
    const workflow = plan();
    const paused = replayWorkflowRun(workflow, [
      event(1, { kind: "run_started" }),
      event(2, { kind: "run_paused", reasonCode: "manual_pause" }),
    ]);
    expect(planWorkflowAdvance(paused, at(3))).toEqual({
      kind: "paused",
      reasonCode: "manual_pause",
    });

    const resumed = replayWorkflowRun(workflow, [
      event(1, { kind: "run_started" }),
      event(2, { kind: "run_paused", reasonCode: "manual_pause" }),
      event(3, { kind: "run_resumed" }),
    ]);
    expect(planWorkflowAdvance(resumed, at(4))).toEqual({
      kind: "run_nodes",
      nodes: [{ nodeId: "load", attempt: 1, phase: "invoke" }],
    });
  });

  it("makes permanent failure and ambiguous execution terminal", () => {
    const workflow = plan();
    const prefix: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, {
        kind: "node_started",
        nodeId: "load",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_load",
      }),
    ];
    const failed = replayWorkflowRun(workflow, [
      ...prefix,
      event(3, { kind: "node_failed", nodeId: "load", attempt: 1, errorCode: "invalid_source" }),
    ]);
    expect(failed.status).toBe("failed");
    expect(planWorkflowAdvance(failed, at(4))).toEqual({ kind: "terminal", status: "failed" });

    const actionPrefix: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, { kind: "node_skipped", nodeId: "load", reasonCode: "condition_false" }),
      event(3, { kind: "node_skipped", nodeId: "calculate", reasonCode: "condition_false" }),
      event(4, {
        kind: "node_started",
        nodeId: "change",
        attempt: 1,
        inputHash: HASH_B,
        idempotencyKey: "wfnode_change",
      }),
      event(5, {
        kind: "node_unknown",
        nodeId: "change",
        attempt: 1,
        reconciliationRef: "reconcile/change",
      }),
    ];
    const unknown = replayWorkflowRun(workflow, actionPrefix);
    expect(unknown.status).toBe("unknown");
    expect(planWorkflowAdvance(unknown, at(6))).toEqual({
      kind: "terminal",
      status: "unknown",
    });
  });

  it("rejects stale sequences, illegal transitions, and confirmation mismatch", () => {
    const workflow = plan();
    expect(() => replayWorkflowRun(workflow, [event(2, { kind: "run_started" })])).toThrow(
      "sequence",
    );
    expect(() =>
      replayWorkflowRun(workflow, [
        event(1, { kind: "run_started" }),
        event(1, { kind: "run_paused", reasonCode: "manual_pause" }),
      ]),
    ).toThrow("sequence");
    expect(() =>
      replayWorkflowRun(workflow, [
        event(1, { kind: "run_started" }),
        event(2, { kind: "node_succeeded", nodeId: "load", attempt: 1 }),
      ]),
    ).toThrow("illegal transition");

    const waiting: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, { kind: "node_skipped", nodeId: "load", reasonCode: "condition_false" }),
      event(3, { kind: "node_skipped", nodeId: "calculate", reasonCode: "condition_false" }),
      event(4, {
        kind: "node_started",
        nodeId: "change",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_change",
      }),
      event(5, {
        kind: "node_waiting_confirmation",
        nodeId: "change",
        attempt: 1,
        changesetId: CHANGESET_ID,
        previewHash: HASH_A,
      }),
      event(6, {
        kind: "node_confirmation_received",
        nodeId: "change",
        previewHash: HASH_B,
        confirmedBy: USER_ID,
      }),
    ];
    expect(() => replayWorkflowRun(workflow, waiting)).toThrow("preview hash");
  });

  it("compares confirmation timestamps by instant instead of ISO string ordering", () => {
    const workflow = plan();
    const events: WorkflowRunEvent[] = [
      event(1, { kind: "run_started" }),
      event(2, { kind: "node_skipped", nodeId: "load", reasonCode: "condition_false" }),
      event(3, { kind: "node_skipped", nodeId: "calculate", reasonCode: "condition_false" }),
      event(4, {
        kind: "node_started",
        nodeId: "change",
        attempt: 1,
        inputHash: HASH_A,
        idempotencyKey: "wfnode_change",
      }),
      event(5, {
        kind: "node_waiting_confirmation",
        nodeId: "change",
        attempt: 1,
        changesetId: CHANGESET_ID,
        previewHash: HASH_A,
        expiresAt: "2026-08-20T08:30:00+08:00",
      }),
      {
        ...event(6, {
          kind: "node_confirmation_received",
          nodeId: "change",
          previewHash: HASH_A,
          confirmedBy: USER_ID,
        }),
        at: "2026-08-20T00:31:00Z",
      },
    ];

    expect(() => replayWorkflowRun(workflow, events)).toThrow("expired");
  });

  it("derives stable node idempotency keys from the full invocation identity", () => {
    const input = {
      runId: "33333333-3333-4333-8333-333333333333",
      nodeId: "load",
      attempt: 1,
      capabilityVersion: "1.0.0",
      inputHash: HASH_A,
    };
    const first = workflowNodeIdempotencyKey(input);
    expect(first).toMatch(/^wfnode_[a-f0-9]{64}$/);
    expect(workflowNodeIdempotencyKey(input)).toBe(first);
    expect(workflowNodeIdempotencyKey({ ...input, attempt: 2 })).not.toBe(first);
  });
});
