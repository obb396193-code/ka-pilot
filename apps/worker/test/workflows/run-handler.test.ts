import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  CapabilityRegistry,
  compileWorkflowGraph,
  workflowNodeIdempotencyKey,
  type CapabilityDefinition,
  type WorkflowCompileInput,
  type WorkflowRunEvent,
  type WorkflowRunEventDraft,
  type WorkflowRunStatus,
} from "@ka/domain";

import { DurableWorkflowRunHandler } from "../../src/workflows/run-handler.js";
import type {
  ChangesetActionPort,
  DurableWorkflowCapabilityInvoker,
  DurableWorkflowRunSnapshot,
  WorkflowOutputStore,
  WorkflowRunPermissionPort,
  WorkflowRunRepositoryPort,
} from "../../src/workflows/types.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CREDENTIAL_OWNER_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const CHANGESET_ID = "55555555-5555-4555-8555-555555555555";
const PREVIEW_HASH = "a".repeat(64);

const command = {
  workspaceId: WORKSPACE_ID,
  runId: RUN_ID,
  userId: USER_ID,
  credentialOwnerUserId: CREDENTIAL_OWNER_ID,
};

function capabilities(includeAction = false): CapabilityDefinition[] {
  const common = {
    version: "1.0.0",
    kind: "data" as const,
    mode: "read" as const,
    requiredPermissions: ["workflow:run"],
    supportsSimulation: true,
    timeoutMs: 1_000,
    maxAttempts: 2,
  };
  const result: CapabilityDefinition[] = [
    {
      ...common,
      id: "load_metrics",
      description: "Load metrics",
      inputSchema: z.object({ accountId: z.string() }).strict(),
      outputSchema: z.object({ cost: z.number() }).strict(),
    },
    {
      ...common,
      id: "calculate_bid",
      kind: "compute",
      description: "Calculate bid",
      inputSchema: z.object({ cost: z.number() }).strict(),
      outputSchema: z.object({ bid: z.number() }).strict(),
    },
  ];
  if (includeAction) {
    result.push({
      ...common,
      id: "change_bid",
      kind: "action",
      mode: "execute",
      description: "Change a bid",
      inputSchema: z.object({ bid: z.number() }).strict(),
      outputSchema: z.object({ changed: z.boolean(), note: z.string().optional() }).strict(),
      maxAttempts: 1,
      idempotencyScope: "object",
      requiresConfirmation: true,
    });
  }
  return result;
}

function fixture(includeAction = false) {
  const definitions = capabilities(includeAction);
  const registry = new CapabilityRegistry(definitions);
  const nodes: WorkflowCompileInput["graph"]["nodes"] = [
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
  ];
  const edges: WorkflowCompileInput["graph"]["edges"] = [
    { id: "load_to_calculate", source: "load", target: "calculate" },
  ];
  if (includeAction) {
    nodes.push({
      id: "change",
      kind: "action",
      capability: { id: "change_bid", version: "1.0.0" },
      inputs: { bid: { source: "node_output", nodeId: "calculate", path: ["bid"] } },
      config: { confirmation: "required" },
    });
    edges.push({ id: "calculate_to_change", source: "calculate", target: "change" });
  }
  const plan = compileWorkflowGraph({
    graph: { version: "b7-internal-v1", nodes, edges },
    paramsSchema: {
      version: "b7-params-v1",
      parameters: [{ name: "account_id", type: "string", required: true }],
    },
  }, registry);
  const snapshot: DurableWorkflowRunSnapshot = {
    runId: RUN_ID,
    workspaceId: WORKSPACE_ID,
    initiatorUserId: USER_ID,
    credentialOwnerUserId: CREDENTIAL_OWNER_ID,
    status: "queued",
    params: { account_id: "account-1" },
    plan,
  };
  return { registry, snapshot };
}

class MemoryRepository implements WorkflowRunRepositoryPort {
  private token: string | null = null;
  private effects = new Map<string, {status:"pending"|"done"|"failed"|"unknown";result:unknown}>();
  async claimExecutor() { if (this.token) return null; this.token = randomUUID(); return this.token; }
  async renewExecutor(input: Parameters<WorkflowRunRepositoryPort["renewExecutor"]>[0]) { if (this.token !== input.executorToken) throw new Error("lease"); }
  async releaseExecutor(input: Parameters<WorkflowRunRepositoryPort["releaseExecutor"]>[0]) { if (this.token !== input.executorToken) return false; this.token=null; return true; }
  async reserveEffect(input: Parameters<WorkflowRunRepositoryPort["reserveEffect"]>[0]) {
    const key = `${input.nodeId}/${input.attempt}/${input.phase}`;
    const prior = this.effects.get(key);
    if (prior) return { acquired:false,...prior };
    const value = {status:"pending" as const,result:null}; this.effects.set(key,value); return {acquired:true,...value};
  }
  async finishEffect(input: Parameters<WorkflowRunRepositoryPort["finishEffect"]>[0]) {
    this.effects.set(`${input.nodeId}/${input.attempt}/${input.phase}`,{status:input.status,result:input.result});
  }
  readonly events: WorkflowRunEvent[] = [];
  private readonly dedupe = new Map<string, WorkflowRunEvent>();

  constructor(readonly snapshot: DurableWorkflowRunSnapshot) {}

  async loadRun(workspaceId: string, runId: string) {
    return workspaceId === this.snapshot.workspaceId && runId === this.snapshot.runId
      ? { ...this.snapshot }
      : null;
  }

  async listEvents(workspaceId: string, runId: string) {
    if (workspaceId !== this.snapshot.workspaceId || runId !== this.snapshot.runId) return [];
    return [...this.events];
  }

  async appendEvent(input: {
    workspaceId: string;
    runId: string;
    dedupeKey: string;
    event: WorkflowRunEventDraft;
  }) {
    const prior = this.dedupe.get(input.dedupeKey);
    if (prior) return prior;
    const event = { ...input.event, sequence: this.events.length + 1 } as WorkflowRunEvent;
    this.events.push(event);
    this.dedupe.set(input.dedupeKey, event);
    return event;
  }

  async compareAndSetStatus(input: {
    workspaceId: string;
    runId: string;
    expected: WorkflowRunStatus;
    next: WorkflowRunStatus;
  }) {
    if (input.workspaceId !== this.snapshot.workspaceId || input.runId !== this.snapshot.runId ||
      this.snapshot.status !== input.expected) return false;
    this.snapshot.status = input.next;
    return true;
  }

  seed(event: WorkflowRunEventDraft): void {
    this.events.push({ ...event, sequence: this.events.length + 1 } as WorkflowRunEvent);
  }
}

class MemoryOutputStore implements WorkflowOutputStore {
  readonly values = new Map<string, unknown>();
  async putOnce(input: {
    workspaceId: string;
    runId: string;
    nodeId: string;
    attempt: number;
    idempotencyKey: string;
    value: unknown;
  }) {
    const ref = `workflow-output/${input.runId}/${input.nodeId}/${input.attempt}`;
    if (!this.values.has(ref)) this.values.set(ref, input.value);
    return { ref };
  }
  async get(input: { workspaceId: string; ref: string }) {
    if (!this.values.has(input.ref)) throw new Error("missing output");
    return this.values.get(input.ref);
  }
}

function allowAll(): WorkflowRunPermissionPort {
  return { authorize: vi.fn(async () => ({ allowed: true as const })) };
}

function noActions(): ChangesetActionPort {
  return {
    preview: vi.fn(async () => ({ kind: "permanent_failure" as const, errorCode: "unexpected" })),
    executeConfirmed: vi.fn(async () => ({ kind: "permanent_failure" as const, errorCode: "unexpected" })),
  };
}

function successfulInvoker(): DurableWorkflowCapabilityInvoker {
  return {
    invoke: vi.fn(async ({ capability, values }) => capability.id === "load_metrics"
      ? { kind: "succeeded" as const, output: { cost: values.accountId === "account-1" ? 100 : 0 } }
      : { kind: "succeeded" as const, output: { bid: (values.cost as number) / 10 } }),
  };
}

function createHandler(input: {
  includeAction?: boolean;
  invoker?: DurableWorkflowCapabilityInvoker;
  actions?: ChangesetActionPort;
  permissions?: WorkflowRunPermissionPort;
  options?: ConstructorParameters<typeof DurableWorkflowRunHandler>[6];
}) {
  const { registry, snapshot } = fixture(input.includeAction);
  const repository = new MemoryRepository(snapshot);
  const outputs = new MemoryOutputStore();
  const invoker = input.invoker ?? successfulInvoker();
  const actions = input.actions ?? noActions();
  const handler = new DurableWorkflowRunHandler(
    registry,
    repository,
    invoker,
    actions,
    input.permissions ?? allowAll(),
    outputs,
    input.options,
  );
  return { handler, repository, outputs, invoker, actions };
}

describe("DurableWorkflowRunHandler", () => {
  it("executes a linear DAG, persists outputs, and reaches succeeded", async () => {
    const setup = createHandler({});
    const result = await setup.handler.advance(command);

    expect(result).toEqual({ kind: "terminal", runStatus: "succeeded" });
    expect(setup.repository.events.map((event) => event.kind)).toEqual([
      "run_started",
      "node_started",
      "node_succeeded",
      "node_started",
      "node_succeeded",
      "run_finished",
    ]);
    expect(setup.outputs.values.get(`workflow-output/${RUN_ID}/calculate/1`)).toEqual({ bid: 10 });
  });

  it("waits for both parents before executing a fan-in node", async () => {
    const common = {
      version: "1.0.0",
      kind: "data" as const,
      mode: "read" as const,
      description: "Fan in fixture",
      requiredPermissions: [] as string[],
      supportsSimulation: true,
      timeoutMs: 1_000,
      maxAttempts: 1,
    };
    const definitions: CapabilityDefinition[] = [
      {
        ...common,
        id: "load_value",
        inputSchema: z.object({ value: z.number() }).strict(),
        outputSchema: z.object({ value: z.number() }).strict(),
      },
      {
        ...common,
        id: "sum_values",
        kind: "compute",
        inputSchema: z.object({ left: z.number(), right: z.number() }).strict(),
        outputSchema: z.object({ total: z.number() }).strict(),
      },
    ];
    const registry = new CapabilityRegistry(definitions);
    const plan = compileWorkflowGraph({
      graph: {
        version: "b7-internal-v1",
        nodes: [
          { id: "left", kind: "data", capability: { id: "load_value", version: "1.0.0" }, inputs: { value: { source: "literal", value: 2 } } },
          { id: "right", kind: "data", capability: { id: "load_value", version: "1.0.0" }, inputs: { value: { source: "literal", value: 3 } } },
          {
            id: "sum",
            kind: "compute",
            capability: { id: "sum_values", version: "1.0.0" },
            inputs: {
              left: { source: "node_output", nodeId: "left", path: ["value"] },
              right: { source: "node_output", nodeId: "right", path: ["value"] },
            },
          },
        ],
        edges: [
          { id: "left_to_sum", source: "left", target: "sum" },
          { id: "right_to_sum", source: "right", target: "sum" },
        ],
      },
      paramsSchema: { version: "b7-params-v1", parameters: [] },
    }, registry);
    const repository = new MemoryRepository({
      runId: RUN_ID,
      workspaceId: WORKSPACE_ID,
      initiatorUserId: USER_ID,
      credentialOwnerUserId: CREDENTIAL_OWNER_ID,
      status: "queued",
      params: {},
      plan,
    });
    const outputs = new MemoryOutputStore();
    const invoker: DurableWorkflowCapabilityInvoker = {
      invoke: vi.fn(async ({ capability, values }) => capability.id === "load_value"
        ? { kind: "succeeded" as const, output: { value: values.value } }
        : { kind: "succeeded" as const, output: { total: (values.left as number) + (values.right as number) } }),
    };
    const handler = new DurableWorkflowRunHandler(
      registry,
      repository,
      invoker,
      noActions(),
      allowAll(),
      outputs,
    );

    expect(await handler.advance(command)).toEqual({ kind: "terminal", runStatus: "succeeded" });
    expect([...outputs.values.values()]).toContainEqual({ total: 5 });
    expect(invoker.invoke).toHaveBeenCalledTimes(3);
  });

  it("yields at the step limit and a new handler skips the already succeeded node", async () => {
    const setup = createHandler({ options: { maxStepsPerAdvance: 1 } });
    expect(await setup.handler.advance(command)).toEqual({
      kind: "yielded",
      runStatus: "running",
      reason: "step_limit",
    });
    expect(setup.invoker.invoke).toHaveBeenCalledTimes(1);

    const resumed = new DurableWorkflowRunHandler(
      new CapabilityRegistry(capabilities()),
      setup.repository,
      setup.invoker,
      setup.actions,
      allowAll(),
      setup.outputs,
    );
    expect(await resumed.advance(command)).toEqual({ kind: "terminal", runStatus: "succeeded" });
    expect(setup.invoker.invoke).toHaveBeenCalledTimes(2);
  });

  it("yields safely when the wall-time budget is exhausted before another effect", async () => {
    let tick = 0;
    const setup = createHandler({
      options: {
        maxWallTimeMs: 1,
        clock: () => new Date(`2026-08-20T00:00:00.00${tick++}Z`),
      },
    });
    expect(await setup.handler.advance(command)).toEqual({
      kind: "yielded",
      runStatus: "running",
      reason: "time_limit",
    });
    expect(setup.invoker.invoke).not.toHaveBeenCalled();
  });

  it("replays an in-flight read with the same idempotency key after a process crash", async () => {
    const setup = createHandler({});
    setup.repository.snapshot.status = "running";
    const at = "2026-08-20T00:00:00.000Z";
    const inputHash = createHash("sha256").update(JSON.stringify({ accountId: "account-1" })).digest("hex");
    const idempotencyKey = workflowNodeIdempotencyKey({
      runId: RUN_ID,
      nodeId: "load",
      attempt: 1,
      capabilityVersion: "1.0.0",
      inputHash,
    });
    setup.repository.seed({ kind: "run_started", at });
    setup.repository.seed({
      kind: "node_started",
      nodeId: "load",
      attempt: 1,
      inputHash,
      idempotencyKey,
      at,
    });

    await setup.handler.advance(command);
    expect(setup.invoker.invoke).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey }));
    expect(setup.repository.events.filter((event) => event.kind === "node_started")).toHaveLength(2);
  });

  it("retries read failures within bounds and stores only safe error codes", async () => {
    let now = new Date("2026-08-20T00:00:00.000Z");
    const invoker: DurableWorkflowCapabilityInvoker = {
      invoke: vi.fn()
        .mockResolvedValueOnce({
          kind: "retryable_failure",
          errorCode: "sk-live-secret-should-not-appear",
          retryAfterMs: 10,
        })
        .mockResolvedValueOnce({ kind: "permanent_failure", errorCode: "upstream_unavailable" }),
    };
    const setup = createHandler({
      invoker,
      options: { clock: () => now, defaultRetryDelayMs: 10 },
    });
    expect((await setup.handler.advance(command)).kind).toBe("retry_wait");
    expect(JSON.stringify(setup.repository.events)).not.toContain("sk-live-secret-should-not-appear");

    now = new Date("2026-08-20T00:00:01.000Z");
    expect(await setup.handler.advance(command)).toEqual({ kind: "terminal", runStatus: "failed" });
    expect(invoker.invoke).toHaveBeenCalledTimes(2);
  });

  it("routes execute through preview and resumes only after matching confirmation", async () => {
    const actions: ChangesetActionPort = {
      preview: vi.fn(async () => ({ kind: "ready" as const, changesetId: CHANGESET_ID, previewHash: PREVIEW_HASH })),
      executeConfirmed: vi.fn(async () => ({ kind: "succeeded" as const, output: { changed: true } })),
    };
    const setup = createHandler({ includeAction: true, actions });
    expect(await setup.handler.advance(command)).toEqual({
      kind: "waiting_confirmation",
      runStatus: "waiting_confirmation",
      nodeId: "change",
    });
    expect(actions.preview).toHaveBeenCalledTimes(1);
    expect(actions.executeConfirmed).not.toHaveBeenCalled();
    expect(setup.invoker.invoke).toHaveBeenCalledTimes(2);

    await expect(setup.handler.confirm({
      ...command,
      nodeId: "change",
      previewHash: "b".repeat(64),
    })).rejects.toThrow("preview hash");
    await setup.handler.confirm({ ...command, nodeId: "change", previewHash: PREVIEW_HASH });
    expect(await setup.handler.advance(command)).toEqual({ kind: "terminal", runStatus: "succeeded" });
    expect(actions.executeConfirmed).toHaveBeenCalledWith(expect.objectContaining({
      changesetId: CHANGESET_ID,
      previewHash: PREVIEW_HASH,
      confirmedBy: USER_ID,
    }));
  });

  it("rejects expired confirmation and makes ambiguous execute UNKNOWN without retry", async () => {
    let now = new Date("2026-08-20T00:00:00.000Z");
    const actions: ChangesetActionPort = {
      preview: vi.fn(async () => ({
        kind: "ready" as const,
        changesetId: CHANGESET_ID,
        previewHash: PREVIEW_HASH,
        expiresAt: "2026-08-20T00:00:01.000Z",
      })),
      executeConfirmed: vi.fn(async () => ({
        kind: "unknown" as const,
        reconciliationRef: "reconcile/change-1",
      })),
    };
    const setup = createHandler({ includeAction: true, actions, options: { clock: () => now } });
    await setup.handler.advance(command);
    now = new Date("2026-08-20T00:00:02.000Z");
    await expect(setup.handler.confirm({
      ...command,
      nodeId: "change",
      previewHash: PREVIEW_HASH,
    })).rejects.toThrow("expired");

    now = new Date("2026-08-20T00:00:00.500Z");
    await setup.handler.confirm({ ...command, nodeId: "change", previewHash: PREVIEW_HASH });
    now = new Date("2026-08-20T00:00:02.000Z");
    expect(await setup.handler.advance(command)).toEqual({ kind: "terminal", runStatus: "failed" });
    expect(actions.executeConfirmed).not.toHaveBeenCalled();
    expect(setup.repository.events.filter((event) => event.kind === "node_retry_scheduled")).toHaveLength(0);
  });

  it("rejects credential-shaped text even when it is embedded after a harmless prefix", async () => {
    const actions: ChangesetActionPort = {
      preview: vi.fn(async () => ({
        kind: "ready" as const,
        changesetId: CHANGESET_ID,
        previewHash: PREVIEW_HASH,
      })),
      executeConfirmed: vi.fn(async () => ({
        kind: "succeeded" as const,
        output: { changed: true, note: "upstream error: Bearer secret-value" },
      })),
    };
    const setup = createHandler({ includeAction: true, actions });
    await setup.handler.advance(command);
    await setup.handler.confirm({ ...command, nodeId: "change", previewHash: PREVIEW_HASH });

    expect(await setup.handler.advance(command)).toEqual({ kind: "terminal", runStatus: "unknown" });
    expect(JSON.stringify(setup.repository.events)).not.toContain("secret-value");
    expect(JSON.stringify([...setup.outputs.values.values()])).not.toContain("secret-value");
  });

  it("supports pause, resume, and cancellation", async () => {
    const setup = createHandler({});
    setup.repository.snapshot.status = "running";
    setup.repository.seed({ kind: "run_started", at: "2026-08-20T00:00:00.000Z" });
    await setup.handler.pause(command);
    expect(setup.repository.snapshot.status).toBe("paused");
    await setup.handler.resume(command);
    expect(setup.repository.snapshot.status).toBe("running");
    await setup.handler.cancel(command);
    expect(setup.repository.snapshot.status).toBe("cancelled");

    await expect(setup.handler.advance({ ...command, userId: "66666666-6666-4666-8666-666666666666" }))
      .rejects.toThrow("access denied");
  });

  it("fails closed before effects for wrong workspace, credential owner, or permission", async () => {
    const denied: WorkflowRunPermissionPort = {
      authorize: vi.fn(async () => ({ allowed: false as const, reason: "permission_denied" as const })),
    };
    const setup = createHandler({ permissions: denied });
    await expect(setup.handler.advance({
      ...command,
      workspaceId: "77777777-7777-4777-8777-777777777777",
    })).rejects.toThrow("access denied");
    await expect(setup.handler.advance({
      ...command,
      credentialOwnerUserId: "77777777-7777-4777-8777-777777777777",
    })).rejects.toThrow("access denied");
    expect(setup.repository.events).toHaveLength(0);

    expect(await setup.handler.advance(command)).toEqual({ kind: "terminal", runStatus: "failed" });
    expect(setup.invoker.invoke).not.toHaveBeenCalled();
    expect(setup.repository.events.at(-1)).toMatchObject({
      kind: "node_failed",
      errorCode: "permission_denied",
    });
  });
});
