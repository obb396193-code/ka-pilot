import type { Pool, PoolClient } from "pg";

import {
  workflowRunEventSchema,
  type WorkflowRunEvent,
  type WorkflowRunEventDraft,
  type WorkflowRunStatus,
} from "@ka/domain";

export type WorkflowAssetType = "personal" | "team" | "official_template";
export type WorkflowVersionStatus = "draft" | "published";

export interface WorkflowDefinitionRecord {
  id: string;
  workspaceId: string;
  name: string;
  ownerUserId: string | null;
  assetType: WorkflowAssetType;
  copiedFrom: string | null;
  createdAt: string;
}

export interface WorkflowVersionRecord {
  id: string;
  workspaceId: string;
  definitionId: string;
  version: number;
  graph: unknown;
  paramsSchema: unknown;
  status: WorkflowVersionStatus;
  publishedAt: string | null;
}

export interface WorkflowRunRecord {
  id: string;
  workspaceId: string;
  versionId: string;
  initiatorUserId: string | null;
  credentialOwnerUserId: string | null;
  status: WorkflowRunStatus;
  params: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

export type StoredWorkflowEvent = WorkflowRunEvent & { databaseId: string };

export class WorkflowRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowRepositoryConflictError";
  }
}

interface DefinitionRow {
  id: string;
  workspace_id: string;
  name: string;
  owner: string | null;
  asset_type: WorkflowAssetType;
  copied_from: string | null;
  created_at: Date | string;
}

interface VersionRow {
  id: string;
  workspace_id: string;
  definition_id: string;
  version: number;
  graph: unknown;
  params_schema: unknown;
  status: WorkflowVersionStatus;
  published_at: Date | string | null;
}

interface RunRow {
  id: string;
  workspace_id: string;
  version_id: string;
  initiator: string | null;
  credential_owner_user_id: string | null;
  status: WorkflowRunStatus;
  params: Record<string, unknown> | null;
  started_at: Date | string;
  finished_at: Date | string | null;
}

interface EventRow {
  id: string;
  run_id: string;
  node_id: string | null;
  event: WorkflowRunEvent["kind"];
  detail: {
    schemaVersion?: unknown;
    sequence?: unknown;
    dedupeKey?: unknown;
    payload?: unknown;
  } | null;
  at: Date | string;
}

export class WorkflowRepository {
  constructor(private readonly pool: Pool) {}

  async createDefinition(input: {
    workspaceId: string;
    name: string;
    ownerUserId: string | null;
    assetType: WorkflowAssetType;
    copiedFrom?: string | null;
  }): Promise<WorkflowDefinitionRecord> {
    assertRequired(input.workspaceId, "workspaceId");
    const name = input.name.trim();
    if (name === "" || name.length > 200) throw new Error("workflow name is invalid");
    assertAssetType(input.assetType);
    const copiedFrom = input.copiedFrom ?? null;
    const result = await this.pool.query<DefinitionRow>(
      `INSERT INTO workflow_definitions (workspace_id, name, owner, asset_type, copied_from)
       SELECT $1, $2, $3, $4, $5
       WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = $1)
         AND ($3::uuid IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE id = $3 AND workspace_id = $1
         ))
         AND ($5::uuid IS NULL OR EXISTS (
           SELECT 1 FROM workflow_definitions WHERE id = $5 AND workspace_id = $1
         ))
       RETURNING *`,
      [input.workspaceId, name, input.ownerUserId, input.assetType, copiedFrom],
    );
    const row = result.rows[0];
    if (!row) throw new Error("workflow workspace, owner, or source definition not found");
    return mapDefinition(row);
  }

  async createDraftVersion(input: {
    workspaceId: string;
    definitionId: string;
    graph: unknown;
    paramsSchema: unknown;
  }): Promise<WorkflowVersionRecord> {
    assertJson(input.graph, "graph");
    assertJson(input.paramsSchema, "paramsSchema");
    return withTransaction(this.pool, async (client) => {
      const definition = await client.query(
        `SELECT id FROM workflow_definitions
         WHERE id = $1 AND workspace_id = $2
         FOR UPDATE`,
        [input.definitionId, input.workspaceId],
      );
      if (definition.rowCount !== 1) throw new Error("workflow definition not found in workspace");
      const result = await client.query<VersionRow>(
        `INSERT INTO workflow_versions (
           workspace_id, definition_id, version, graph, params_schema, status
         )
         SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, $4, 'draft'
         FROM workflow_versions
         WHERE definition_id = $2
         RETURNING *`,
        [input.workspaceId, input.definitionId, input.graph, input.paramsSchema],
      );
      const row = result.rows[0];
      if (!row) throw new Error("failed to create workflow draft version");
      return mapVersion(row);
    });
  }

  async replaceDraftVersion(input: {
    workspaceId: string;
    versionId: string;
    graph: unknown;
    paramsSchema: unknown;
  }): Promise<WorkflowVersionRecord> {
    assertJson(input.graph, "graph");
    assertJson(input.paramsSchema, "paramsSchema");
    const result = await this.pool.query<VersionRow>(
      `UPDATE workflow_versions
       SET graph = $3, params_schema = $4
       WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
       RETURNING *`,
      [input.versionId, input.workspaceId, input.graph, input.paramsSchema],
    );
    const row = result.rows[0];
    if (!row) {
      throw new WorkflowRepositoryConflictError("workflow draft not found or already published");
    }
    return mapVersion(row);
  }

  async publishValidatedDraft(input: {
    workspaceId: string;
    versionId: string;
    expectedGraph: unknown;
    expectedParamsSchema: unknown;
  }): Promise<WorkflowVersionRecord> {
    assertJson(input.expectedGraph, "expectedGraph");
    assertJson(input.expectedParamsSchema, "expectedParamsSchema");
    const result = await this.pool.query<VersionRow>(
      `UPDATE workflow_versions
       SET status = 'published', published_at = now()
       WHERE id = $1
         AND workspace_id = $2
         AND status = 'draft'
         AND graph = $3::jsonb
         AND params_schema IS NOT DISTINCT FROM $4::jsonb
       RETURNING *`,
      [input.versionId, input.workspaceId, input.expectedGraph, input.expectedParamsSchema],
    );
    const row = result.rows[0];
    if (!row) {
      throw new WorkflowRepositoryConflictError(
        "workflow draft changed, is outside the workspace, or is already published",
      );
    }
    return mapVersion(row);
  }

  async getVersion(workspaceId: string, versionId: string): Promise<WorkflowVersionRecord | null> {
    const result = await this.pool.query<VersionRow>(
      `SELECT version.*
       FROM workflow_versions AS version
       JOIN workflow_definitions AS definition ON definition.id = version.definition_id
       WHERE version.id = $1
         AND version.workspace_id = $2
         AND definition.workspace_id = $2`,
      [versionId, workspaceId],
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async getPublishedVersion(
    workspaceId: string,
    versionId: string,
  ): Promise<WorkflowVersionRecord | null> {
    const version = await this.getVersion(workspaceId, versionId);
    return version?.status === "published" ? version : null;
  }

  async createRun(input: {
    workspaceId: string;
    versionId: string;
    initiatorUserId: string;
    credentialOwnerUserId: string;
    params: Record<string, unknown>;
  }): Promise<WorkflowRunRecord> {
    assertJson(input.params, "params");
    const result = await this.pool.query<RunRow>(
      `INSERT INTO workflow_runs (
         workspace_id, version_id, initiator, credential_owner_user_id, status, params
       )
       SELECT $1, version.id, $3, $4, 'queued', $5
       FROM workflow_versions AS version
       JOIN workflow_definitions AS definition ON definition.id = version.definition_id
       WHERE version.id = $2
         AND version.workspace_id = $1
         AND definition.workspace_id = $1
         AND version.status = 'published'
         AND EXISTS (SELECT 1 FROM users WHERE id = $3 AND workspace_id = $1)
         AND EXISTS (SELECT 1 FROM users WHERE id = $4 AND workspace_id = $1)
       RETURNING *`,
      [
        input.workspaceId,
        input.versionId,
        input.initiatorUserId,
        input.credentialOwnerUserId,
        input.params,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("published version and same-workspace actors are required");
    return mapRun(row);
  }

  async getRun(workspaceId: string, runId: string): Promise<WorkflowRunRecord | null> {
    const result = await this.pool.query<RunRow>(
      `SELECT run.*
       FROM workflow_runs AS run
       JOIN workflow_versions AS version ON version.id = run.version_id
       JOIN workflow_definitions AS definition ON definition.id = version.definition_id
       WHERE run.id = $1
         AND run.workspace_id = $2
         AND version.workspace_id = $2
         AND definition.workspace_id = $2`,
      [runId, workspaceId],
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  }

  async appendEvent(input: {
    workspaceId: string;
    runId: string;
    dedupeKey: string;
    event: WorkflowRunEventDraft;
  }): Promise<StoredWorkflowEvent> {
    assertDedupeKey(input.dedupeKey);
    return withTransaction(this.pool, async (client) => {
      const run = await client.query(
        `SELECT id FROM workflow_runs
         WHERE id = $1 AND workspace_id = $2
         FOR UPDATE`,
        [input.runId, input.workspaceId],
      );
      if (run.rowCount !== 1) throw new Error("workflow run not found in workspace");

      const duplicate = await client.query<EventRow>(
        `SELECT * FROM workflow_run_events
         WHERE run_id = $1 AND detail->>'dedupeKey' = $2
         ORDER BY id LIMIT 1`,
        [input.runId, input.dedupeKey],
      );
      if (duplicate.rows[0]) {
        const stored = mapEvent(duplicate.rows[0]);
        if (!sameEventDraft(stored, input.event)) {
          throw new WorkflowRepositoryConflictError(
            `workflow event dedupe key ${input.dedupeKey} conflicts`,
          );
        }
        return stored;
      }

      const previous = await client.query<{ sequence: string | null }>(
        `SELECT detail->>'sequence' AS sequence
         FROM workflow_run_events
         WHERE run_id = $1
         ORDER BY id DESC LIMIT 1`,
        [input.runId],
      );
      const sequence = Number(previous.rows[0]?.sequence ?? 0) + 1;
      const parsed = workflowRunEventSchema.parse({ ...input.event, sequence });
      const payload = eventPayload(parsed);
      const nodeId = "nodeId" in parsed ? parsed.nodeId : null;
      const result = await client.query<EventRow>(
        `INSERT INTO workflow_run_events (run_id, node_id, event, detail, at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.runId,
          nodeId,
          parsed.kind,
          {
            schemaVersion: "b7-event-v1",
            sequence,
            dedupeKey: input.dedupeKey,
            payload,
          },
          parsed.at,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("failed to append workflow event");
      return mapEvent(row);
    });
  }

  async listEvents(workspaceId: string, runId: string): Promise<StoredWorkflowEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT event.*
       FROM workflow_run_events AS event
       JOIN workflow_runs AS run ON run.id = event.run_id
       WHERE event.run_id = $1 AND run.workspace_id = $2
       ORDER BY event.id`,
      [runId, workspaceId],
    );
    return result.rows.map(mapEvent);
  }

  async compareAndSetRunStatus(input: {
    workspaceId: string;
    runId: string;
    expected: WorkflowRunStatus;
    next: WorkflowRunStatus;
  }): Promise<boolean> {
    assertRunStatus(input.expected);
    assertRunStatus(input.next);
    const terminal = ["succeeded", "failed", "unknown", "cancelled"].includes(input.next);
    const result = await this.pool.query(
      `UPDATE workflow_runs
       SET status = $4,
           finished_at = CASE WHEN $5::boolean THEN now() ELSE NULL END
       WHERE id = $1 AND workspace_id = $2 AND status = $3`,
      [input.runId, input.workspaceId, input.expected, input.next, terminal],
    );
    return result.rowCount === 1;
  }
}

function mapDefinition(row: DefinitionRow): WorkflowDefinitionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    ownerUserId: row.owner,
    assetType: row.asset_type,
    copiedFrom: row.copied_from,
    createdAt: isoTimestamp(row.created_at),
  };
}

function mapVersion(row: VersionRow): WorkflowVersionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    definitionId: row.definition_id,
    version: row.version,
    graph: row.graph,
    paramsSchema: row.params_schema,
    status: row.status,
    publishedAt: row.published_at === null ? null : isoTimestamp(row.published_at),
  };
}

function mapRun(row: RunRow): WorkflowRunRecord {
  assertRunStatus(row.status);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    versionId: row.version_id,
    initiatorUserId: row.initiator,
    credentialOwnerUserId: row.credential_owner_user_id,
    status: row.status,
    params: row.params ?? {},
    startedAt: isoTimestamp(row.started_at),
    finishedAt: row.finished_at === null ? null : isoTimestamp(row.finished_at),
  };
}

function mapEvent(row: EventRow): StoredWorkflowEvent {
  const detail = row.detail;
  if (
    detail?.schemaVersion !== "b7-event-v1" ||
    typeof detail.sequence !== "number" ||
    !isPlainObject(detail.payload)
  ) {
    throw new Error(`workflow event ${row.id} has an unsupported detail schema`);
  }
  const event = workflowRunEventSchema.parse({
    kind: row.event,
    sequence: detail.sequence,
    at: isoTimestamp(row.at),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    ...detail.payload,
  });
  return { ...event, databaseId: String(row.id) };
}

function eventPayload(event: WorkflowRunEvent): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).filter(([key]) => !["kind", "sequence", "at", "nodeId"].includes(key)),
  );
}

function sameEventDraft(stored: StoredWorkflowEvent, draft: WorkflowRunEventDraft): boolean {
  const storedDraft = Object.fromEntries(
    Object.entries(stored).filter(([key]) => !["databaseId", "sequence"].includes(key)),
  );
  return canonicalJson(storedDraft) === canonicalJson(draft);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function assertRunStatus(value: string): asserts value is WorkflowRunStatus {
  if (![
    "queued",
    "running",
    "waiting_confirmation",
    "paused",
    "succeeded",
    "failed",
    "unknown",
    "cancelled",
  ].includes(value)) {
    throw new Error(`invalid workflow run status ${value}`);
  }
}

function assertAssetType(value: string): asserts value is WorkflowAssetType {
  if (!["personal", "team", "official_template"].includes(value)) {
    throw new Error("workflow assetType is invalid");
  }
}

function assertRequired(value: string, field: string): void {
  if (value.trim() === "") throw new Error(`${field} is required`);
}

function assertDedupeKey(value: string): void {
  if (!/^[a-z][a-z0-9_-]{1,127}$/.test(value)) {
    throw new Error("workflow event dedupeKey is invalid");
  }
}

function assertJson(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
  depth = 0,
): void {
  if (depth > 32) throw new Error(`${label} exceeds JSON depth limit`);
  if (isJsonScalar(value, label)) return;
  assertJsonContainer(value, label, seen, depth);
}

function isJsonScalar(
  value: unknown,
  label: string,
): value is null | string | boolean | number {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) throw new Error(`${label} must contain finite JSON numbers`);
  return true;
}

function assertJsonContainer(
  value: unknown,
  label: string,
  seen: Set<object>,
  depth: number,
): void {
  if (value === null || typeof value !== "object") {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (seen.has(value)) throw new Error(`${label} must not contain cycles`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child) => assertJson(child, label, seen, depth + 1));
  } else {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} must contain plain JSON objects`);
    }
    Object.values(value).forEach((child) => assertJson(child, label, seen, depth + 1));
  }
  seen.delete(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("database returned an invalid timestamp");
  return date.toISOString();
}

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}
