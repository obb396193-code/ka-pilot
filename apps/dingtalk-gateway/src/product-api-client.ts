import { z } from "zod";

import type { RoutedIntent } from "./intent-router.js";
import type { ProductCommandContext, ProductCommandPort } from "./types.js";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
});

const sessionSchema = z.object({ id: z.string().min(1) });
const structuredQuerySchema = z.record(z.string(), z.unknown());

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface WorkItemReply {
  target: "dingtalk_group" | "dingtalk_dm" | "web_session";
  target_id: string;
  content: string;
}

export interface ProductApiClientOptions {
  baseUrl: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  sessionTtlMs?: number;
  bearerToken?: string;
  now?: () => number;
}

type CachedSession = { id: string; expiresAt: number };

function renderData(data: unknown): string {
  if (typeof data === "string") {
    return data.slice(0, 5_000);
  }
  return JSON.stringify(data, null, 2).slice(0, 5_000);
}

export class ProductApiClient implements ProductCommandPort {
  private readonly baseUrl: URL;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly sessionTtlMs: number;
  private readonly bearerToken: string | undefined;
  private readonly now: () => number;
  private readonly sessions = new Map<string, CachedSession>();

  constructor(options: ProductApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    if (!new Set(["http:", "https:"]).has(this.baseUrl.protocol)) {
      throw new Error("KA API base URL must use HTTP or HTTPS");
    }
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.sessionTtlMs = options.sessionTtlMs ?? 20 * 60 * 1_000;
    this.bearerToken = options.bearerToken;
    this.now = options.now ?? Date.now;
  }

  async execute(
    intent: Extract<RoutedIntent, { kind: "query" | "create_task" }>,
    context: ProductCommandContext,
  ): Promise<{ text: string }> {
    if (intent.input.trim() === "") {
      throw new Error("Command input cannot be empty");
    }
    if (intent.kind === "create_task") {
      const data = await this.post(
        "/api/v1/tasks",
        {
          idempotency_key: `dingtalk:${context.eventId}`,
          draft: { task_name: intent.input.trim() },
        },
        context,
      );
      return { text: `任务草稿已创建：${renderData(data)}` };
    }

    const sessionId = await this.getSession(context);
    const structured = structuredQuerySchema.parse(
      await this.post(
        `/api/v1/agent/sessions/${encodeURIComponent(sessionId)}/query`,
        { natural_language: intent.input.trim() },
        context,
      ),
    );
    const result = await this.post("/api/v1/query", structured, context);
    return { text: renderData(result) };
  }

  async replyToWorkItem(workItemId: string, reply: WorkItemReply): Promise<void> {
    await this.post(
      `/api/v1/work-items/${encodeURIComponent(workItemId)}/reply`,
      reply,
    );
  }

  private async getSession(context: ProductCommandContext): Promise<string> {
    const key = `${context.workspaceId}:${context.userId}:${context.conversationId}`;
    const cached = this.sessions.get(key);
    if (cached && cached.expiresAt > this.now()) {
      return cached.id;
    }
    const session = sessionSchema.parse(
      await this.post(
        "/api/v1/agent/sessions",
        {
          page_context: {
            source: "dingtalk",
            conversation_id: context.conversationId,
          },
        },
        context,
      ),
    );
    this.sessions.set(key, { id: session.id, expiresAt: this.now() + this.sessionTtlMs });
    return session.id;
  }

  private async post(
    path: string,
    body: unknown,
    context?: ProductCommandContext,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.bearerToken) {
      headers.authorization = `Bearer ${this.bearerToken}`;
    }
    if (context) {
      headers["x-ka-workspace-id"] = context.workspaceId;
      headers["x-ka-actor-id"] = context.userId;
    }
    try {
      const response = await this.fetchFn(new URL(path, this.baseUrl).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = envelopeSchema.parse(await response.json());
      if (!response.ok || !payload.ok) {
        throw new Error(`KA API request failed with HTTP ${response.status}: ${renderData(payload.error)}`);
      }
      return payload.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
