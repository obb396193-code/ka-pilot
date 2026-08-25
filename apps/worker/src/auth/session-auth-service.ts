import { createHash } from "node:crypto";

import type { AuthResolution } from "@ka/domain";
import { z } from "zod";

const opaqueSessionTokenSchema = z
  .string()
  .min(32)
  .max(512)
  .regex(/^[A-Za-z0-9._~-]+$/);

export interface ApprovedAuthContextPort {
  resolveApprovedAuthContext(
    tokenHash: string,
    now: Date,
    expectedWorkspaceId?: string,
  ): Promise<AuthResolution>;
}

export interface SessionAuthServiceOptions {
  now?: () => Date;
}

const missingSession: AuthResolution = {
  status: "rejected",
  httpStatus: 401,
  reason: "SESSION_NOT_FOUND",
};

export class SessionAuthService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: ApprovedAuthContextPort,
    options: SessionAuthServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async resolve(token: unknown, expectedWorkspaceId?: string): Promise<AuthResolution> {
    const parsed = opaqueSessionTokenSchema.safeParse(token);
    if (!parsed.success) return missingSession;
    const tokenHash = createHash("sha256").update(parsed.data, "utf8").digest("hex");
    return this.repository.resolveApprovedAuthContext(tokenHash, this.now(), expectedWorkspaceId);
  }
}
