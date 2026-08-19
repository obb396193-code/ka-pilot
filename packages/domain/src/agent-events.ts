export type AgentRunEventKind = "status" | "delta" | "tool" | "usage" | "done" | "error";

export interface AgentRunEvent {
  seq: number;
  at: string;
  kind: AgentRunEventKind;
  payload: Readonly<Record<string, unknown>>;
}

const VISIBLE_EVENT_KINDS = new Set<AgentRunEventKind>(["delta", "tool", "done", "error"]);
const TERMINAL_EVENT_KINDS = new Set<AgentRunEventKind>(["done", "error"]);
const UNSAFE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "credential",
  "credentials",
  "secret",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "rawlog",
  "raw_log",
  "rawtrace",
  "raw_trace",
]);
const UNSAFE_TEXT =
  /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{6,}|\b(?:mul|mcn)_[A-Za-z0-9_-]{3,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+)/i;

export function createAgentRunEvent(input: AgentRunEvent): AgentRunEvent {
  if (!Number.isSafeInteger(input.seq) || input.seq <= 0) {
    throw new Error("Agent run event sequence must be a positive safe integer");
  }
  const timestamp = Date.parse(input.at);
  if (!Number.isFinite(timestamp)) {
    throw new Error("Agent run event timestamp must be valid");
  }
  assertSafePayload(input.payload);
  return {
    seq: input.seq,
    at: new Date(timestamp).toISOString(),
    kind: input.kind,
    payload: structuredClone(input.payload),
  };
}

export function appendAgentRunEvent(
  existing: readonly AgentRunEvent[],
  next: AgentRunEvent,
): AgentRunEvent[] {
  const previous = existing.at(-1);
  const expectedSequence = (previous?.seq ?? 0) + 1;
  if (next.seq !== expectedSequence) {
    throw new Error(`Agent run event sequence must be ${expectedSequence}`);
  }
  if (previous !== undefined && TERMINAL_EVENT_KINDS.has(previous.kind)) {
    throw new Error("Cannot append an Agent run event after a terminal event");
  }
  if (previous !== undefined && Date.parse(next.at) < Date.parse(previous.at)) {
    throw new Error("Agent run event timestamp cannot move backwards");
  }
  return [...existing, createAgentRunEvent(next)];
}

export function isVisibleAgentRunEvent(event: AgentRunEvent): boolean {
  return VISIBLE_EVENT_KINDS.has(event.kind);
}

export function hasVisibleAgentOutput(events: readonly AgentRunEvent[]): boolean {
  return events.some(isVisibleAgentRunEvent);
}

function assertSafePayload(payload: Readonly<Record<string, unknown>>): void {
  inspectValue(payload, new WeakSet<object>());
}

function inspectValue(value: unknown, seen: WeakSet<object>): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Unsafe Agent event payload: non-finite number");
  }
  if (typeof value === "string" && UNSAFE_TEXT.test(value)) {
    throw new Error("Unsafe Agent event payload: credential-shaped text");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return;
  }
  if (typeof value !== "object") {
    throw new Error("Unsafe Agent event payload: only JSON values are allowed");
  }
  if (seen.has(value)) {
    throw new Error("Unsafe Agent event payload: circular value");
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => inspectValue(item, seen));
    seen.delete(value);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key.toLowerCase())) {
      throw new Error(`Unsafe Agent event payload key: ${key}`);
    }
    inspectValue(nested, seen);
  }
  seen.delete(value);
}
