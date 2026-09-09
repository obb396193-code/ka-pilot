import {
  parseAgentContextRefs,
  type AgentContextKind,
  type AgentTaskKind,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;
type AgentMessageRole = "user" | "assistant";
type AgentRunStatus = "running" | "success" | "failed";
type MemoryScope = "user" | "task" | "account";
type ContextSource = "user_select" | "page" | "filter";

export interface AgentSessionRecord {
  id: string;
  workspaceId: string;
  userId: string;
  pageContext: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AgentMessageRecord {
  id: number;
  sessionId: string;
  role: AgentMessageRole;
  content: Record<string, unknown>;
  at: Date;
}

export interface AgentContextItemRecord {
  id: number;
  sessionId: string;
  objectType: AgentContextKind;
  objectId: string;
  addedBy: ContextSource;
}

export interface AgentMemoryRecord {
  id: number;
  workspaceId: string;
  scope: MemoryScope;
  scopeId: string;
  content: string;
  expireAt: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface AgentRunRecord {
  id: string;
  workspaceId: string;
  kind: AgentTaskKind;
  initiator: string;
  status: AgentRunStatus;
  summary: string | null;
  rawLogRef: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

interface SessionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  page_context: Record<string, unknown> | null;
  created_at: Date;
}

interface MessageRow {
  id: string | number;
  session_id: string;
  role: AgentMessageRole;
  content: Record<string, unknown>;
  at: Date;
}

interface ContextRow {
  id: string | number;
  session_id: string;
  object_type: AgentContextKind;
  object_id: string;
  added_by: ContextSource;
}

interface MemoryRow {
  id: string | number;
  workspace_id: string;
  scope: MemoryScope;
  scope_id: string;
  content: string;
  expire_at: string | null;
  created_by: string;
  created_at: Date;
}

interface RunRow {
  id: string;
  workspace_id: string;
  kind: AgentTaskKind;
  initiator: string;
  status: AgentRunStatus;
  summary: string | null;
  raw_log_ref: string | null;
  started_at: Date;
  finished_at: Date | null;
}

const sessionColumns = "id, workspace_id, user_id, page_context, created_at";
const runColumns =
  "id, workspace_id, kind, initiator, status, summary, raw_log_ref, started_at, finished_at";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_SUMMARY_PATTERN = /^[A-Za-z0-9_ .:-]{1,500}$/;
const RAW_LOG_REF_PATTERN = /^(?:agent-log|oss|s3):\/\/[A-Za-z0-9._/-]{1,500}$/;

export class AgentRepository {
  constructor(private readonly pool: Pool) {}

  async createSession(input: {
    workspaceId: string;
    userId: string;
    pageContext?: Record<string, unknown> | null | undefined;
  }): Promise<AgentSessionRecord> {
    await requireActiveUser(this.pool, input.workspaceId, input.userId);
    const pageContext = input.pageContext ?? null;
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO agent_sessions (workspace_id,user_id,page_context)
       VALUES ($1,$2,$3::jsonb) RETURNING ${sessionColumns}`,
      [input.workspaceId, input.userId, pageContext === null ? null : serializeJson(pageContext)],
    );
    return mapSession(requireRow(result.rows[0], "Agent session insert failed"));
  }

  async getSession(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
  }): Promise<AgentSessionRecord> {
    return getOwnedSession(this.pool, input);
  }

  async listMessages(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
  }): Promise<AgentMessageRecord[]> {
    await getOwnedSession(this.pool, input);
    const result = await this.pool.query<MessageRow>(
      `SELECT id,session_id,role,content,at FROM agent_messages
       WHERE session_id=$1 ORDER BY id`,
      [input.sessionId],
    );
    return result.rows.map(mapMessage);
  }

  async addContext(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    context: { kind: AgentContextKind; id: string };
    addedBy: ContextSource;
  }): Promise<AgentContextItemRecord & { idempotent: boolean }> {
    const context = parseAgentContextRefs([input.context])[0]!;
    return withTransaction(this.pool, async (client) => {
      await getOwnedSession(client, input);
      const lockKey = `${input.sessionId}:${context.kind}:${context.id}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockKey]);
      const existing = await client.query<ContextRow>(
        `SELECT id,session_id,object_type,object_id,added_by
         FROM agent_context_items
         WHERE session_id=$1 AND object_type=$2 AND object_id=$3
         ORDER BY id LIMIT 1`,
        [input.sessionId, context.kind, context.id],
      );
      if (existing.rows[0] !== undefined) {
        return { ...mapContext(existing.rows[0]), idempotent: true };
      }
      const inserted = await client.query<ContextRow>(
        `INSERT INTO agent_context_items (session_id,object_type,object_id,added_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id,session_id,object_type,object_id,added_by`,
        [input.sessionId, context.kind, context.id, input.addedBy],
      );
      return { ...mapContext(requireRow(inserted.rows[0], "Agent context insert failed")), idempotent: false };
    });
  }

  async listContext(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
  }): Promise<AgentContextItemRecord[]> {
    await getOwnedSession(this.pool, input);
    const result = await this.pool.query<ContextRow>(
      `SELECT id,session_id,object_type,object_id,added_by
       FROM agent_context_items WHERE session_id=$1 ORDER BY id`,
      [input.sessionId],
    );
    return result.rows.map(mapContext);
  }

  async removeContext(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    contextItemId: number;
  }): Promise<void> {
    const result = await this.pool.query<{ id: string | number }>(
      `DELETE FROM agent_context_items AS context
       USING agent_sessions AS session
       WHERE context.id=$1 AND context.session_id=session.id AND session.id=$2
         AND session.workspace_id=$3 AND session.user_id=$4
       RETURNING context.id`,
      [input.contextItemId, input.sessionId, input.workspaceId, input.userId],
    );
    if (result.rowCount !== 1) throw new Error("Agent context item not found for user");
  }

  async createMemory(input: {
    workspaceId: string;
    userId: string;
    scope: MemoryScope;
    scopeId: string;
    content: string;
    expireAt: string | null;
  }): Promise<AgentMemoryRecord> {
    await requireActiveUser(this.pool, input.workspaceId, input.userId);
    await assertMemoryScope(this.pool, input);
    assertContent(input.content, "Agent memory content");
    if (input.expireAt !== null) assertDate(input.expireAt, "expireAt");
    const result = await this.pool.query<MemoryRow>(
      `INSERT INTO agent_memory
         (workspace_id,scope,scope_id,content,expire_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,workspace_id,scope,scope_id,content,
         to_char(expire_at,'YYYY-MM-DD') AS expire_at,created_by,created_at`,
      [input.workspaceId, input.scope, input.scopeId, input.content, input.expireAt, input.userId],
    );
    return mapMemory(requireRow(result.rows[0], "Agent memory insert failed"));
  }

  async listMemories(input: {
    workspaceId: string;
    userId: string;
    scopes: Array<{ scope: MemoryScope; scopeId: string }>;
    asOf: string;
  }): Promise<AgentMemoryRecord[]> {
    await requireActiveUser(this.pool, input.workspaceId, input.userId);
    assertDate(input.asOf, "asOf");
    for (const scope of input.scopes) {
      if (scope.scope === "user" && scope.scopeId !== input.userId) {
        throw new Error("Requested user memory scope must match the authenticated user");
      }
    }
    if (input.scopes.length === 0) return [];
    const result = await this.pool.query<MemoryRow>(
      `WITH requested(scope,scope_id) AS (
         SELECT * FROM unnest($3::text[],$4::text[])
       )
       SELECT memory.id,memory.workspace_id,memory.scope,memory.scope_id,memory.content,
         to_char(memory.expire_at,'YYYY-MM-DD') AS expire_at,
         memory.created_by,memory.created_at
       FROM agent_memory AS memory
       JOIN requested USING (scope,scope_id)
       WHERE memory.workspace_id=$1
         AND (memory.scope<>'user' OR memory.scope_id=$2)
         AND (memory.expire_at IS NULL OR memory.expire_at >= $5::date)
       ORDER BY memory.id`,
      [
        input.workspaceId,
        input.userId,
        input.scopes.map((scope) => scope.scope),
        input.scopes.map((scope) => scope.scopeId),
        input.asOf,
      ],
    );
    return result.rows.map(mapMemory);
  }

  async startRunForUserMessage(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    kind: AgentTaskKind;
    content: Record<string, unknown>;
    startedAt: Date;
  }): Promise<{ message: AgentMessageRecord; run: AgentRunRecord }> {
    assertDateTime(input.startedAt, "startedAt");
    const content = serializeJson(input.content);
    return withTransaction(this.pool, async (client) => {
      await getOwnedSession(client, input);
      const messageResult = await client.query<MessageRow>(
        `INSERT INTO agent_messages (session_id,role,content,at)
         VALUES ($1,'user',$2::jsonb,$3)
         RETURNING id,session_id,role,content,at`,
        [input.sessionId, content, input.startedAt],
      );
      const runResult = await client.query<RunRow>(
        `INSERT INTO agent_runs (workspace_id,kind,initiator,status,started_at,session_id)
         VALUES ($1,$2,$3,'running',$4,$5) RETURNING ${runColumns}`,
        [input.workspaceId, input.kind, input.userId, input.startedAt, input.sessionId],
      );
      return {
        message: mapMessage(requireRow(messageResult.rows[0], "Agent message insert failed")),
        run: mapRun(requireRow(runResult.rows[0], "Agent run insert failed")),
      };
    });
  }

  async completeRun(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    runId: string;
    summary: string;
    assistantContent: Record<string, unknown>;
    finishedAt: Date;
  }): Promise<AgentRunRecord> {
    assertSafeSummary(input.summary);
    assertDateTime(input.finishedAt, "finishedAt");
    const content = serializeJson(input.assistantContent);
    return withTransaction(this.pool, async (client) => {
      await getOwnedSession(client, input);
      const current = await lockOwnedRun(client, input.workspaceId, input.userId, input.runId, input.sessionId);
      assertRunCompletable(current, input.finishedAt);
      await client.query(
        `INSERT INTO agent_messages (session_id,role,content,at)
         VALUES ($1,'assistant',$2::jsonb,$3)`,
        [input.sessionId, content, input.finishedAt],
      );
      const result = await client.query<RunRow>(
        `UPDATE agent_runs SET status='success',summary=$4,finished_at=$5
         WHERE workspace_id=$1 AND initiator=$2 AND id=$3 AND status='running'
         RETURNING ${runColumns}`,
        [input.workspaceId, input.userId, input.runId, input.summary, input.finishedAt],
      );
      return mapRun(requireRow(result.rows[0], "Agent run is no longer running"));
    });
  }

  async failRun(input: {
    workspaceId: string;
    userId: string;
    runId: string;
    summary: string;
    rawLogRef?: string | null | undefined;
    finishedAt: Date;
  }): Promise<AgentRunRecord> {
    assertSafeSummary(input.summary);
    assertRawLogRef(input.rawLogRef ?? null);
    assertDateTime(input.finishedAt, "finishedAt");
    return withTransaction(this.pool, async (client) => {
      const current = await lockOwnedRun(client, input.workspaceId, input.userId, input.runId);
      assertRunCompletable(current, input.finishedAt);
      const result = await client.query<RunRow>(
        `UPDATE agent_runs
         SET status='failed',summary=$4,raw_log_ref=$5,finished_at=$6
         WHERE workspace_id=$1 AND initiator=$2 AND id=$3 AND status='running'
         RETURNING ${runColumns}`,
        [input.workspaceId, input.userId, input.runId, input.summary, input.rawLogRef ?? null, input.finishedAt],
      );
      return mapRun(requireRow(result.rows[0], "Agent run is no longer running"));
    });
  }
}

async function getOwnedSession(
  client: Queryable,
  input: { workspaceId: string; userId: string; sessionId: string },
): Promise<AgentSessionRecord> {
  const result = await client.query<SessionRow>(
    `SELECT ${sessionColumns} FROM agent_sessions
     WHERE workspace_id=$1 AND user_id=$2 AND id=$3`,
    [input.workspaceId, input.userId, input.sessionId],
  );
  if (result.rows[0] === undefined) throw new Error("Agent session not found for user");
  return mapSession(result.rows[0]);
}

async function lockOwnedRun(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  runId: string,
  expectedSessionId: string | null = null,
): Promise<AgentRunRecord> {
  const result = await client.query<RunRow>(
    `SELECT ${runColumns} FROM agent_runs
     WHERE workspace_id=$1 AND initiator=$2 AND id=$3
       AND ($4::uuid IS NULL OR session_id=$4) FOR UPDATE`,
    [workspaceId, userId, runId, expectedSessionId],
  );
  if (result.rows[0] === undefined) throw new Error("Agent run not found for user");
  return mapRun(result.rows[0]);
}

async function requireActiveUser(client: Queryable, workspaceId: string, userId: string): Promise<void> {
  const result = await client.query(
    "SELECT 1 FROM users WHERE workspace_id=$1 AND id=$2 AND is_active=true",
    [workspaceId, userId],
  );
  if (result.rowCount !== 1) throw new Error("Active user not found in workspace");
}

async function assertMemoryScope(
  client: Queryable,
  input: { workspaceId: string; userId: string; scope: MemoryScope; scopeId: string },
): Promise<void> {
  if (input.scope === "user") {
    if (input.scopeId !== input.userId) throw new Error("User memory scope must match creator");
    return;
  }
  const table = input.scope === "task" ? "tasks" : "accounts";
  const idColumn = input.scope === "task" ? "task_id" : "account_id";
  const result = await client.query(
    `SELECT 1 FROM ${table} WHERE workspace_id=$1 AND ${idColumn}=$2`,
    [input.workspaceId, input.scopeId],
  );
  if (result.rowCount !== 1) throw new Error(`${input.scope} memory scope not found in workspace`);
}

function assertRunCompletable(run: AgentRunRecord, finishedAt: Date): void {
  if (run.status !== "running") throw new Error("Agent run must be running");
  if (finishedAt < run.startedAt) throw new Error("Agent run cannot finish before it started");
}

function assertSafeSummary(summary: string): void {
  if (!SAFE_SUMMARY_PATTERN.test(summary) || /(?:token|secret|apikey|authorization|Bearer)/i.test(summary)) {
    throw new Error("Agent Run requires a safe summary without stack traces or credentials");
  }
}

function assertRawLogRef(reference: string | null): void {
  if (reference !== null && !RAW_LOG_REF_PATTERN.test(reference)) {
    throw new Error("Agent raw log must use a restricted reference");
  }
}

function assertContent(content: string, field: string): void {
  if (content.trim() === "" || content.length > 10_000) throw new Error(`${field} is invalid`);
}

function assertDate(value: string, field: string): void {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!DATE_PATTERN.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
}

function assertDateTime(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`${field} must be a valid timestamp`);
}

function serializeJson(value: Record<string, unknown>): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Agent JSON content must be serializable");
  return serialized;
}

function mapSession(row: SessionRow): AgentSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    pageContext: row.page_context,
    createdAt: row.created_at,
  };
}

function mapMessage(row: MessageRow): AgentMessageRecord {
  return { id: Number(row.id), sessionId: row.session_id, role: row.role, content: row.content, at: row.at };
}

function mapContext(row: ContextRow): AgentContextItemRecord {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    objectType: row.object_type,
    objectId: row.object_id,
    addedBy: row.added_by,
  };
}

function mapMemory(row: MemoryRow): AgentMemoryRecord {
  return {
    id: Number(row.id),
    workspaceId: row.workspace_id,
    scope: row.scope,
    scopeId: row.scope_id,
    content: row.content,
    expireAt: row.expire_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapRun(row: RunRow): AgentRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    initiator: row.initiator,
    status: row.status,
    summary: row.summary,
    rawLogRef: row.raw_log_ref,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function requireRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) throw new Error(message);
  return row;
}

async function withTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
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
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}
