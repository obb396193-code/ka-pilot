import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createOperationToolDefinitions,
  type AgentOperationPort,
} from "../../src/agent/operation-port.js";

const auth = { workspaceId: "workspace-alpha", userId: "user-alpha", runId: "run-alpha" };

describe("Agent operation port", () => {
  it("binds authenticated read and preview capabilities without exposing direct writes", async () => {
    const port: AgentOperationPort = {
      invoke: vi.fn(async () => ({ message: "预览已生成", data: { changesetId: "change-alpha" } })),
    };
    const definitions = createOperationToolDefinitions({
      port,
      auth,
      taskKind: "chat",
      capabilities: [
        {
          id: "preview_bid_change",
          description: "生成出价变更预览",
          mode: "preview",
          taskKinds: ["chat"],
          inputSchema: { accountId: z.string(), bid: z.number().nonnegative() },
        },
      ],
    });

    const result = await definitions[0]!.execute({ accountId: "account-alpha", bid: 12 }, auth);

    expect(port.invoke).toHaveBeenCalledWith({
      auth,
      capabilityId: "preview_bid_change",
      mode: "preview",
      input: { accountId: "account-alpha", bid: 12 },
    });
    expect(result.content[0]?.text).toContain("change-alpha");
  });

  it("rejects direct execution capabilities and credential-shaped tool output", async () => {
    const port: AgentOperationPort = {
      invoke: vi.fn(async () => ({ message: "token=do-not-return" })),
    };
    expect(() => createOperationToolDefinitions({
      port,
      auth,
      taskKind: "chat",
      capabilities: [
        {
          id: "execute_bid_change",
          description: "执行出价变更",
          mode: "execute",
          taskKinds: ["chat"],
          inputSchema: { changesetId: z.string() },
        },
      ],
    })).toThrow("Direct write capabilities cannot be exposed");

    const [definition] = createOperationToolDefinitions({
      port,
      auth,
      taskKind: "chat",
      capabilities: [
        {
          id: "query_account",
          description: "查询账户",
          mode: "read",
          taskKinds: ["chat"],
          inputSchema: { accountId: z.string() },
        },
      ],
    });
    await expect(definition!.execute({ accountId: "account-alpha" }, auth)).rejects.toThrow(
      "Unsafe Agent event payload",
    );
  });
});
