import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import {
  WorkflowRepository,
  WorkflowRepositoryConflictError,
} from "../src/workflow-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

const graph = {
  version: "b7-internal-v1",
  nodes: [
    {
      id: "load",
      kind: "data",
      capability: { id: "load_metrics", version: "1.0.0" },
      inputs: { accountId: { source: "parameter", name: "account_id" } },
    },
  ],
  edges: [],
};
const paramsSchema = {
  version: "b7-params-v1",
  parameters: [{ name: "account_id", type: "string", required: true }],
};

describe("WorkflowRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const repository = new WorkflowRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;
  let credentialOwnerUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`workflow-a-${suffix}`, `workflow-b-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const users = await pool.query<{ id: string; workspace_id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $3, '发起人'), ($1, $4, '凭证所有者'), ($2, $5, '其他租户')
       RETURNING id, workspace_id`,
      [workspaceId, otherWorkspaceId, `init-${suffix}`, `owner-${suffix}`, `other-${suffix}`],
    );
    userId = users.rows[0]!.id;
    credentialOwnerUserId = users.rows[1]!.id;
    otherUserId = users.rows[2]!.id;
  });

  it("allocates draft versions serially under concurrent creation", async () => {
    const definition = await repository.createDefinition({
      workspaceId,
      name: "新户冷启动观察流",
      ownerUserId: userId,
      assetType: "personal",
    });

    const versions = await Promise.all([
      repository.createDraftVersion({ workspaceId, definitionId: definition.id, graph, paramsSchema }),
      repository.createDraftVersion({ workspaceId, definitionId: definition.id, graph, paramsSchema }),
    ]);

    expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);
    expect(versions.every((version) => version.workspaceId === workspaceId)).toBe(true);
  });

  it("publishes only the exact validated draft snapshot and keeps it immutable", async () => {
    const definition = await repository.createDefinition({
      workspaceId,
      name: "垃圾计划清理流",
      ownerUserId: userId,
      assetType: "team",
    });
    const draft = await repository.createDraftVersion({
      workspaceId,
      definitionId: definition.id,
      graph,
      paramsSchema,
    });
    const updatedGraph = { ...graph, nodes: [{ ...graph.nodes[0]!, ui: { position: { x: 1, y: 2 } } }] };
    await repository.replaceDraftVersion({
      workspaceId,
      versionId: draft.id,
      graph: updatedGraph,
      paramsSchema,
    });

    await expect(
      repository.publishValidatedDraft({
        workspaceId,
        versionId: draft.id,
        expectedGraph: graph,
        expectedParamsSchema: paramsSchema,
      }),
    ).rejects.toBeInstanceOf(WorkflowRepositoryConflictError);

    const published = await repository.publishValidatedDraft({
      workspaceId,
      versionId: draft.id,
      expectedGraph: updatedGraph,
      expectedParamsSchema: paramsSchema,
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    await expect(
      repository.replaceDraftVersion({
        workspaceId,
        versionId: draft.id,
        graph,
        paramsSchema,
      }),
    ).rejects.toBeInstanceOf(WorkflowRepositoryConflictError);
    expect(await repository.getVersion(otherWorkspaceId, draft.id)).toBeNull();
  });

  it("creates a run only from an exact published version with same-workspace actors", async () => {
    const published = await createPublished(repository, workspaceId, userId);
    const run = await repository.createRun({
      workspaceId,
      versionId: published.id,
      initiatorUserId: userId,
      credentialOwnerUserId,
      params: { account_id: "account-1" },
    });
    expect(run).toMatchObject({
      workspaceId,
      versionId: published.id,
      initiatorUserId: userId,
      credentialOwnerUserId,
      status: "queued",
      params: { account_id: "account-1" },
    });
    expect((await repository.getRun(workspaceId, run.id))?.versionId).toBe(published.id);
    expect(await repository.getRun(otherWorkspaceId, run.id)).toBeNull();

    await expect(
      repository.createRun({
        workspaceId,
        versionId: published.id,
        initiatorUserId: userId,
        credentialOwnerUserId: otherUserId,
        params: {},
      }),
    ).rejects.toThrow("actors");

    const definition = await repository.createDefinition({
      workspaceId,
      name: "未发布流程",
      ownerUserId: userId,
      assetType: "personal",
    });
    const draft = await repository.createDraftVersion({ workspaceId, definitionId: definition.id, graph, paramsSchema });
    await expect(
      repository.createRun({
        workspaceId,
        versionId: draft.id,
        initiatorUserId: userId,
        credentialOwnerUserId,
        params: {},
      }),
    ).rejects.toThrow("published version");
  });

  it("serializes event sequence and deduplicates append keys", async () => {
    const published = await createPublished(repository, workspaceId, userId);
    const run = await repository.createRun({
      workspaceId,
      versionId: published.id,
      initiatorUserId: userId,
      credentialOwnerUserId,
      params: { account_id: "account-1" },
    });
    const executorToken = (await repository.claimExecutor({workspaceId,runId:run.id,leaseMs:60000}))!;
    const started = await repository.appendEvent({
      executorToken,
      workspaceId,
      runId: run.id,
      dedupeKey: "run-started",
      event: { kind: "run_started", at: "2026-08-19T00:00:01.000Z" },
    });
    const duplicate = await repository.appendEvent({
      executorToken,
      workspaceId,
      runId: run.id,
      dedupeKey: "run-started",
      event: { kind: "run_started", at: "2026-08-19T00:00:01.000Z" },
    });
    expect(duplicate).toEqual(started);

    const appended = await Promise.all([
      repository.appendEvent({
        workspaceId,
        runId: run.id,
        dedupeKey: "skip-a",
        executorToken,
        event: {
          kind: "node_skipped",
          at: "2026-08-19T00:00:02.000Z",
          nodeId: "branch_a",
          reasonCode: "condition_false",
        },
      }),
      repository.appendEvent({
        workspaceId,
        runId: run.id,
        dedupeKey: "skip-b",
        executorToken,
        event: {
          kind: "node_skipped",
          at: "2026-08-19T00:00:02.000Z",
          nodeId: "branch_b",
          reasonCode: "condition_false",
        },
      }),
    ]);
    expect(appended.map((entry) => entry.sequence).sort()).toEqual([2, 3]);
    expect((await repository.listEvents(workspaceId, run.id)).map((entry) => entry.sequence)).toEqual([1, 2, 3]);

    await expect(
      repository.appendEvent({
        workspaceId,
        runId: run.id,
        dedupeKey: "run-started",
        executorToken,
        event: { kind: "run_cancelled", at: "2026-08-19T00:00:03.000Z" },
      }),
    ).rejects.toBeInstanceOf(WorkflowRepositoryConflictError);
    await expect(
      repository.appendEvent({
        workspaceId: otherWorkspaceId,
        runId: run.id,
        dedupeKey: "cross-tenant",
        executorToken,
        event: { kind: "run_cancelled", at: "2026-08-19T00:00:03.000Z" },
      }),
    ).rejects.toThrow("lease");
  });

  it("compare-and-sets run status without accepting stale writers", async () => {
    const published = await createPublished(repository, workspaceId, userId);
    const run = await repository.createRun({
      workspaceId,
      versionId: published.id,
      initiatorUserId: userId,
      credentialOwnerUserId,
      params: {},
    });
    const executorToken = (await repository.claimExecutor({workspaceId,runId:run.id,leaseMs:60000}))!;
    expect(
      await repository.compareAndSetRunStatus({
        executorToken,
        workspaceId,
        runId: run.id,
        expected: "queued",
        next: "running",
      }),
    ).toBe(true);
    expect(
      await repository.compareAndSetRunStatus({
        workspaceId,
        runId: run.id,
        expected: "queued",
        next: "cancelled",
        executorToken,
      }),
    ).toBe(false);
    expect((await repository.getRun(workspaceId, run.id))?.status).toBe("running");
  });

  it("rejects values that JSON serialization would silently erase or coerce", async () => {
    const definition = await repository.createDefinition({
      workspaceId,
      name: "非法图保护",
      ownerUserId: userId,
      assetType: "personal",
    });
    await expect(
      repository.createDraftVersion({
        workspaceId,
        definitionId: definition.id,
        graph: { unsafe: () => "hidden" },
        paramsSchema,
      }),
    ).rejects.toThrow("JSON serializable");
    await expect(
      repository.createDraftVersion({
        workspaceId,
        definitionId: definition.id,
        graph: { value: Number.POSITIVE_INFINITY },
        paramsSchema,
      }),
    ).rejects.toThrow("finite JSON numbers");
  });
});

async function createPublished(
  repository: WorkflowRepository,
  workspaceId: string,
  ownerUserId: string,
) {
  const definition = await repository.createDefinition({
    workspaceId,
    name: `测试流程-${randomUUID()}`,
    ownerUserId,
    assetType: "personal",
  });
  const draft = await repository.createDraftVersion({
    workspaceId,
    definitionId: definition.id,
    graph,
    paramsSchema,
  });
  return repository.publishValidatedDraft({
    workspaceId,
    versionId: draft.id,
    expectedGraph: graph,
    expectedParamsSchema: paramsSchema,
  });
}
