import { describe, expect, it, vi } from "vitest";

import {
  loadWorkspaceSyncReadiness,
  type WorkspaceSyncReadinessQueryPort,
} from "../src/workspace-sync-readiness.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const requestingUserId = "22222222-2222-4222-8222-222222222222";

function clientWith(rows: unknown[]): {
  client: WorkspaceSyncReadinessQueryPort;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows });
  return {
    client: { query } as unknown as WorkspaceSyncReadinessQueryPort,
    query,
  };
}

describe("workspace sync readiness", () => {
  it("passes only trusted normalized tuple scope to the readiness query", async () => {
    const { client, query } = clientWith([{ initial_full_complete: true }]);

    await expect(loadWorkspaceSyncReadiness(client, {
      workspaceId,
      requestingUserId,
      allowedAccounts: [{ media: " KUAISHOU ", accountId: " account-1 " }],
    })).resolves.toBe(true);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      workspaceId,
      requestingUserId,
      JSON.stringify([{ media: "KUAISHOU", account_id: "account-1" }]),
    ]);
  });

  it.each([
    { workspaceId: "not-a-uuid", requestingUserId, message: "workspaceId must be a UUID" },
    { workspaceId, requestingUserId: "not-a-uuid", message: "requestingUserId must be a UUID" },
  ])("rejects invalid actor keys before querying", async (input) => {
    const { client, query } = clientWith([]);
    await expect(loadWorkspaceSyncReadiness(client, {
      ...input,
      allowedAccounts: [],
    })).rejects.toThrow(input.message);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects blank or duplicate account tuples", async () => {
    const { client, query } = clientWith([]);
    await expect(loadWorkspaceSyncReadiness(client, {
      workspaceId,
      requestingUserId,
      allowedAccounts: [{ media: "", accountId: "account-1" }],
    })).rejects.toThrow("requires media and accountId");
    await expect(loadWorkspaceSyncReadiness(client, {
      workspaceId,
      requestingUserId,
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "account-1" },
        { media: " KUAISHOU ", accountId: " account-1 " },
      ],
    })).rejects.toThrow("contains a duplicate tuple");
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when PostgreSQL does not return a boolean readiness row", async () => {
    const missing = clientWith([]);
    const invalid = clientWith([{ initial_full_complete: "true" }]);
    const input = { workspaceId, requestingUserId, allowedAccounts: [] };

    await expect(loadWorkspaceSyncReadiness(missing.client, input)).rejects.toThrow(
      "workspace sync readiness query returned no row",
    );
    await expect(loadWorkspaceSyncReadiness(invalid.client, input)).rejects.toThrow(
      "workspace sync readiness query returned no row",
    );
  });
});
