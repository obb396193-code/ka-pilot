import { createAgentRunEvent, type AgentRunEvent } from "@ka/domain";

interface ToolState {
  id: string;
  name: string;
}

export class SdkMessageAdapter {
  private sequence = 0;
  private readonly tools = new Map<number, ToolState>();
  unknownMessageCount = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  adapt(message: unknown): AgentRunEvent[] {
    if (!isRecord(message) || typeof message.type !== "string") {
      this.unknownMessageCount += 1;
      return [];
    }
    if (message.type === "stream_event") return this.adaptStreamEvent(message.event);
    if (message.type === "result") return this.adaptResult(message);
    if (message.type === "assistant" || message.type === "user" || message.type === "system") return [];
    this.unknownMessageCount += 1;
    return [];
  }

  private adaptStreamEvent(value: unknown): AgentRunEvent[] {
    if (!isRecord(value) || typeof value.type !== "string") return [];
    if (value.type === "content_block_delta" && isRecord(value.delta)) {
      if (value.delta.type === "text_delta" && typeof value.delta.text === "string") {
        return [this.event("delta", { text: value.delta.text })];
      }
      return [];
    }
    if (value.type === "content_block_start") return this.toolStart(value);
    if (value.type === "content_block_stop") return this.toolStop(value);
    if (value.type === "message_delta" && isRecord(value.usage)) {
      const payload = usagePayload(value.usage);
      return Object.keys(payload).length === 0 ? [] : [this.event("usage", payload)];
    }
    return [];
  }

  private toolStart(value: Record<string, unknown>): AgentRunEvent[] {
    if (!Number.isSafeInteger(value.index) || !isRecord(value.content_block)) return [];
    const block = value.content_block;
    if (block.type !== "tool_use" || typeof block.id !== "string" || typeof block.name !== "string") {
      return [];
    }
    const toolState = { id: block.id, name: block.name };
    this.tools.set(value.index as number, toolState);
    return [this.event("tool", { phase: "start", ...toolState })];
  }

  private toolStop(value: Record<string, unknown>): AgentRunEvent[] {
    if (!Number.isSafeInteger(value.index)) return [];
    const toolState = this.tools.get(value.index as number);
    if (toolState === undefined) return [];
    this.tools.delete(value.index as number);
    return [this.event("tool", { phase: "stop", ...toolState })];
  }

  private adaptResult(message: Record<string, unknown>): AgentRunEvent[] {
    const subtype = safeCode(message.subtype);
    if (subtype === "success" && message.is_error === false) {
      const usage = isRecord(message.usage) ? usagePayload(message.usage) : {};
      if (isFiniteNonnegative(message.total_cost_usd)) {
        usage.estimatedCostUsd = message.total_cost_usd;
      }
      const events = Object.keys(usage).length === 0 ? [] : [this.event("usage", usage)];
      return [...events, this.event("done", { outcome: "success" })];
    }
    return [this.event("error", { code: subtype })];
  }

  private event(kind: AgentRunEvent["kind"], payload: Record<string, unknown>): AgentRunEvent {
    this.sequence += 1;
    return createAgentRunEvent({
      seq: this.sequence,
      at: this.now().toISOString(),
      kind,
      payload,
    });
  }
}

function usagePayload(usage: Record<string, unknown>): Record<string, number> {
  const mapping: Record<string, string> = {
    input_tokens: "inputCount",
    output_tokens: "outputCount",
    cache_read_input_tokens: "cacheReadCount",
    cache_creation_input_tokens: "cacheWriteCount",
  };
  const result: Record<string, number> = {};
  for (const [source, target] of Object.entries(mapping)) {
    const value = usage[source];
    if (isFiniteNonnegative(value)) result[target] = value;
  }
  return result;
}

function safeCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,100}$/.test(value) ? value : "sdk_error";
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
