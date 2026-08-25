import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthResolution } from "@ka/domain";

import { SessionAuthService } from "../src/auth/session-auth-service.js";

const TOKEN = "session-token-with-at-least-thirty-two-bytes-001";
const approved: AuthResolution = {
  status: "approved",
  context: {
    workspaceId: "00000000-0000-4000-8000-000000000401",
    userId: "00000000-0000-4000-8000-000000000402",
    role: "admin",
    allowedAccounts: [],
  },
};

describe("SessionAuthService", () => {
  it("hashes the opaque token before calling the repository", async () => {
    const resolveApprovedAuthContext = vi.fn(async () => approved);
    const service = new SessionAuthService({ resolveApprovedAuthContext });
    await expect(service.resolve(TOKEN)).resolves.toEqual(approved);
    expect(resolveApprovedAuthContext).toHaveBeenCalledWith(
      createHash("sha256").update(TOKEN, "utf8").digest("hex"),
      expect.any(Date),
      undefined,
    );
    expect(resolveApprovedAuthContext.mock.calls.flat().join(" ")).not.toContain(TOKEN);
  });

  it("passes an expected workspace without letting the caller provide grants", async () => {
    const resolveApprovedAuthContext = vi.fn(async () => approved);
    const service = new SessionAuthService({ resolveApprovedAuthContext }, {
      now: () => new Date("2026-08-25T08:00:00Z"),
    });
    const expectedWorkspace = "00000000-0000-4000-8000-000000000401";
    await service.resolve(TOKEN, expectedWorkspace);
    expect(resolveApprovedAuthContext).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
      new Date("2026-08-25T08:00:00Z"),
      expectedWorkspace,
    );
  });

  it.each(["", "short", "contains whitespace but is otherwise long enough 001"])(
    "rejects an invalid opaque token without touching storage",
    async (token) => {
      const resolveApprovedAuthContext = vi.fn(async () => approved);
      const service = new SessionAuthService({ resolveApprovedAuthContext });
      await expect(service.resolve(token)).resolves.toEqual({
        status: "rejected",
        httpStatus: 401,
        reason: "SESSION_NOT_FOUND",
      });
      expect(resolveApprovedAuthContext).not.toHaveBeenCalled();
    },
  );
});
