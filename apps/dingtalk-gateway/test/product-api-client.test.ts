import { describe, expect, it, vi } from "vitest";

import { ProductApiClient } from "../src/product-api-client.js";

const context = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  qihangUserId: "qihang-1",
  conversationId: "cid-1",
  eventId: "event-1",
};

function response(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data, meta: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ProductApiClient", () => {
  it("turns natural language into a structured product query using one cached session", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: "session-1" }))
      .mockResolvedValueOnce(response({ query_type: "summary", date: "2026-08-19" }))
      .mockResolvedValueOnce(response({ rows: [{ cost: 100 }] }));
    const client = new ProductApiClient({ baseUrl: "http://ka-api.internal", fetchFn });

    await expect(
      client.execute({ kind: "query", input: "今日消耗" }, context),
    ).resolves.toEqual({ text: expect.stringContaining("100") });

    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      "http://ka-api.internal/api/v1/agent/sessions",
      "http://ka-api.internal/api/v1/agent/sessions/session-1/query",
      "http://ka-api.internal/api/v1/query",
    ]);
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toEqual({
      natural_language: "今日消耗",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[2]?.[1]?.body))).toEqual({
      query_type: "summary",
      date: "2026-08-19",
    });
  });

  it("creates a minimal task draft with the inbound event as idempotency key", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: "task-1" }));
    const client = new ProductApiClient({ baseUrl: "http://ka-api.internal", fetchFn });

    await client.execute({ kind: "create_task", input: "暑期拉新" }, context);

    expect(fetchFn).toHaveBeenCalledWith(
      "http://ka-api.internal/api/v1/tasks",
      expect.objectContaining({
        body: JSON.stringify({
          idempotency_key: "dingtalk:event-1",
          draft: { task_name: "暑期拉新" },
        }),
      }),
    );
  });

  it("posts asynchronous work-item replies without persisting a session webhook", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response({ accepted: true }));
    const client = new ProductApiClient({ baseUrl: "http://ka-api.internal", fetchFn });

    await client.replyToWorkItem("work-1", {
      target: "dingtalk_group",
      target_id: "cid-1",
      content: "分析完成",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://ka-api.internal/api/v1/work-items/work-1/reply",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.stringify(fetchFn.mock.calls)).not.toContain("sessionWebhook");
  });
});
