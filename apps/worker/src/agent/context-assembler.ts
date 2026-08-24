import type {
  AgentContextKind,
  AgentContextRef,
} from "@ka/domain";

type MemoryScope = "user" | "task" | "account";

export interface AgentContextRepository {
  getSession(input: AgentContextAuth): Promise<{
    id: string;
    workspaceId: string;
    userId: string;
    pageContext: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  listMessages(input: AgentContextAuth): Promise<Array<{
    id: number;
    sessionId: string;
    role: "user" | "assistant";
    content: Record<string, unknown>;
    at: Date;
  }>>;
  listContext(input: AgentContextAuth): Promise<Array<{
    id: number;
    sessionId: string;
    objectType: AgentContextKind;
    objectId: string;
    addedBy: "user_select" | "page" | "filter";
  }>>;
  listMemories(input: {
    workspaceId: string;
    userId: string;
    scopes: Array<{ scope: MemoryScope; scopeId: string }>;
    asOf: string;
  }): Promise<Array<{
    id: number;
    workspaceId: string;
    scope: MemoryScope;
    scopeId: string;
    content: string;
    expireAt: string | null;
    createdBy: string;
    createdAt: Date;
  }>>;
}

export interface AgentContextAuth {
  workspaceId: string;
  userId: string;
  sessionId: string;
}

export interface AgentEvidenceFact {
  evidenceId: string;
  label: string;
  displayValue: string;
  value: string | number | boolean | null;
  metricKey?: string | undefined;
  definition?: string | undefined;
  dataCutoffAt: string;
}

export interface AgentContextObject {
  ref: AgentContextRef;
  title: string;
  facts: AgentEvidenceFact[];
}

export interface ContextObjectResolver {
  resolve(input: {
    workspaceId: string;
    userId: string;
    ref: AgentContextRef;
    asOf: Date;
  }): Promise<AgentContextObject>;
}

export interface AssembledAgentContext {
  session: {
    id: string;
    pageContext: Record<string, unknown> | null;
  };
  messages: Array<{
    role: "user" | "assistant";
    content: Record<string, unknown>;
    at: string;
  }>;
  objects: AgentContextObject[];
  memories: Array<{
    scope: MemoryScope;
    scopeId: string;
    content: string;
    expireAt: string | null;
  }>;
  evidenceIds: string[];
  dataCutoffAt: string;
  promptContext: string;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const UNSAFE_KEY = /(?:authorization|api[_-]?key|credential|password|secret|token)/i;
const UNSAFE_TEXT = /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{6,}|\b(?:mul|mcn)_[A-Za-z0-9_-]{3,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+)/i;

export class AgentContextAssembler {
  private readonly maxMessages: number;
  private readonly maxMemories: number;

  constructor(
    private readonly repository: AgentContextRepository,
    private readonly resolver: ContextObjectResolver,
    options: { maxMessages?: number | undefined; maxMemories?: number | undefined } = {},
  ) {
    this.maxMessages = positiveLimit(options.maxMessages ?? 30, "maxMessages");
    this.maxMemories = positiveLimit(options.maxMemories ?? 50, "maxMemories");
  }

  async assemble(input: AgentContextAuth & { asOf: Date }): Promise<AssembledAgentContext> {
    assertDate(input.asOf);
    const auth = pickAuth(input);
    const [session, messages, contextItems] = await Promise.all([
      this.repository.getSession(auth),
      this.repository.listMessages(auth),
      this.repository.listContext(auth),
    ]);
    const refs = contextItems.map((item): AgentContextRef => ({
      kind: item.objectType,
      id: item.objectId,
    }));
    const [objects, memories] = await Promise.all([
      Promise.all(refs.map((ref) => this.resolver.resolve({
        workspaceId: input.workspaceId,
        userId: input.userId,
        ref,
        asOf: input.asOf,
      }))),
      this.repository.listMemories({
        workspaceId: input.workspaceId,
        userId: input.userId,
        scopes: memoryScopes(input.userId, refs),
        asOf: input.asOf.toISOString().slice(0, 10),
      }),
    ]);
    validateObjects(objects, refs);
    const boundedMessages = messages.slice(-this.maxMessages).map((message) => ({
      role: message.role,
      content: safeJsonClone(message.content, "message content"),
      at: validDate(message.at, "message timestamp").toISOString(),
    }));
    const boundedMemories = memories.slice(-this.maxMemories).map((memory) => ({
      scope: memory.scope,
      scopeId: safeText(memory.scopeId, "memory scope id", 200),
      content: safeText(memory.content, "memory content", 10_000),
      expireAt: memory.expireAt,
    }));
    const pageContext = session.pageContext === null
      ? null
      : safeJsonClone(session.pageContext, "page context");
    const dataCutoffAt = conservativeCutoff(objects, input.asOf);
    const evidenceIds = objects.flatMap((object) => object.facts.map((fact) => fact.evidenceId));
    const promptPayload = {
      session: { id: session.id, pageContext },
      messages: boundedMessages,
      selectedObjects: objects,
      memories: boundedMemories,
      dataCutoffAt,
    };
    const promptContext = JSON.stringify(promptPayload);
    if (promptContext.length > 500_000) throw new Error("Assembled Agent context exceeds the safety limit");
    return {
      session: { id: session.id, pageContext },
      messages: boundedMessages,
      objects: structuredClone(objects),
      memories: boundedMemories,
      evidenceIds,
      dataCutoffAt,
      promptContext,
    };
  }
}

function memoryScopes(userId: string, refs: readonly AgentContextRef[]): Array<{
  scope: MemoryScope;
  scopeId: string;
}> {
  const scopes: Array<{ scope: MemoryScope; scopeId: string }> = [
    { scope: "user", scopeId: userId },
  ];
  const seen = new Set([`user:${userId}`]);
  for (const ref of refs) {
    if (ref.kind !== "task" && ref.kind !== "account") continue;
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({ scope: ref.kind, scopeId: ref.id });
  }
  return scopes;
}

function validateObjects(objects: readonly AgentContextObject[], refs: readonly AgentContextRef[]): void {
  if (objects.length !== refs.length) throw new Error("Context resolver returned an incomplete object set");
  const evidenceIds = new Set<string>();
  objects.forEach((object, objectIndex) => {
    const expected = refs[objectIndex]!;
    if (object.ref.kind !== expected.kind || object.ref.id !== expected.id) {
      throw new Error("Context resolver changed the selected object identity");
    }
    safeText(object.title, "context object title", 200);
    object.facts.forEach((fact) => validateFact(fact, evidenceIds));
  });
}

function validateFact(fact: AgentEvidenceFact, evidenceIds: Set<string>): void {
  assertEvidenceIdentity(fact.evidenceId, evidenceIds);
  evidenceIds.add(fact.evidenceId);
  safeText(fact.label, "fact label", 200);
  safeText(fact.displayValue, "fact display value", 500);
  assertNumericFact(fact.value, fact.definition);
  if (fact.metricKey !== undefined) safeText(fact.metricKey, "metric key", 100);
  if (fact.definition !== undefined) safeText(fact.definition, "metric definition", 1_000);
  if (!Number.isFinite(Date.parse(fact.dataCutoffAt))) {
    throw new Error("Agent fact dataCutoffAt must be a valid timestamp");
  }
}

function assertEvidenceIdentity(evidenceId: string, evidenceIds: ReadonlySet<string>): void {
  if (!SAFE_ID.test(evidenceId)) throw new Error("Agent evidence id is invalid");
  if (evidenceIds.has(evidenceId)) throw new Error(`Duplicate Agent evidence id: ${evidenceId}`);
}

function assertNumericFact(value: AgentEvidenceFact["value"], definition: string | undefined): void {
  if (typeof value !== "number") return;
  if (definition?.trim() === undefined) {
    throw new Error("Numeric Agent facts require a metric definition");
  }
  if (!Number.isFinite(value)) throw new Error("Agent numeric fact must be finite");
}

function conservativeCutoff(objects: readonly AgentContextObject[], fallback: Date): string {
  const cutoffs = objects.flatMap((object) => object.facts.map((fact) => Date.parse(fact.dataCutoffAt)));
  return cutoffs.length === 0 ? fallback.toISOString() : new Date(Math.min(...cutoffs)).toISOString();
}

function safeJsonClone<T extends Record<string, unknown>>(value: T, label: string): T {
  inspectJson(value, label, new WeakSet<object>(), 0);
  return structuredClone(value);
}

function inspectJson(value: unknown, label: string, seen: WeakSet<object>, depth: number): void {
  if (depth > 12) throw new Error(`${label} exceeds the nesting limit`);
  if (value === null) return;
  if (inspectJsonPrimitive(value, label)) return;
  if (typeof value !== "object") throw new Error(`${label} must contain JSON values only`);
  if (seen.has(value)) throw new Error(`${label} must not contain circular values`);
  seen.add(value);
  if (Array.isArray(value)) inspectJsonArray(value, label, seen, depth);
  else inspectJsonRecord(value, label, seen, depth);
  seen.delete(value);
}

function inspectJsonPrimitive(value: unknown, label: string): boolean {
  if (typeof value === "string") {
    safeText(value, label, 100_000);
    return true;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${label} has a non-finite number`);
  return typeof value === "number" || typeof value === "boolean";
}

function inspectJsonArray(value: readonly unknown[], label: string, seen: WeakSet<object>, depth: number): void {
  value.forEach((item) => inspectJson(item, label, seen, depth + 1));
}

function inspectJsonRecord(
  value: object,
  label: string,
  seen: WeakSet<object>,
  depth: number,
): void {
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_KEY.test(key)) throw new Error(`${label} contains a credential-shaped key`);
    inspectJson(nested, label, seen, depth + 1);
  }
}

function safeText(value: string, label: string, maxLength: number): string {
  if (value.trim() === "" || value.length > maxLength || UNSAFE_TEXT.test(value)) {
    throw new Error(`${label} is unsafe or invalid`);
  }
  return value;
}

function positiveLimit(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function assertDate(value: Date): void {
  validDate(value, "Agent context asOf");
}

function validDate(value: Date, field: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return value;
}

function pickAuth(input: AgentContextAuth): AgentContextAuth {
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    sessionId: input.sessionId,
  };
}
