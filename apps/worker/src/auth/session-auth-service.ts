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
  createSessionForIdentity?(input: {
    identityId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<AuthResolution>;
  switchSessionWorkspace?(input: {
    tokenHash: string;
    nextTokenHash: string;
    targetWorkspaceId: string;
    now: Date;
  }): Promise<AuthResolution>;
}

export interface SessionAuthServiceOptions {
  now?: () => Date;
}

const missingSession: AuthResolution = {
  status: "rejected",
  httpStatus: 401,
  reason: "SESSION_NOT_FOUND",
};
const invalidAuthState: AuthResolution = {
  status: "rejected",
  httpStatus: 403,
  reason: "INVALID_AUTH_STATE",
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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
    return this.repository.resolveApprovedAuthContext(
      tokenHash(parsed.data),
      this.now(),
      expectedWorkspaceId,
    );
  }

  async issueForIdentity(input: {
    identityId: unknown;
    token: unknown;
    expiresAt: unknown;
  }): Promise<AuthResolution> {
    const parsed = z.object({
      identityId: z.string().uuid(),
      token: opaqueSessionTokenSchema,
      expiresAt: z.date(),
    }).strict().safeParse(input);
    const now = this.now();
    if (
      !parsed.success ||
      !Number.isFinite(now.getTime()) ||
      parsed.data.expiresAt.getTime() <= now.getTime() ||
      this.repository.createSessionForIdentity === undefined
    ) {
      return invalidAuthState;
    }
    return this.repository.createSessionForIdentity({
      identityId: parsed.data.identityId,
      tokenHash: tokenHash(parsed.data.token),
      now,
      expiresAt: parsed.data.expiresAt,
    });
  }

  async switchWorkspace(input: {
    token: unknown;
    nextToken: unknown;
    targetWorkspaceId: unknown;
  }): Promise<AuthResolution> {
    const currentToken = opaqueSessionTokenSchema.safeParse(input.token);
    if (!currentToken.success) return missingSession;
    const parsed = z.object({
      nextToken: opaqueSessionTokenSchema,
      targetWorkspaceId: z.string().uuid(),
    }).strict().safeParse({
      nextToken: input.nextToken,
      targetWorkspaceId: input.targetWorkspaceId,
    });
    const now = this.now();
    if (
      !parsed.success ||
      !Number.isFinite(now.getTime()) ||
      currentToken.data === parsed.data.nextToken ||
      this.repository.switchSessionWorkspace === undefined
    ) {
      return invalidAuthState;
    }
    return this.repository.switchSessionWorkspace({
      tokenHash: tokenHash(currentToken.data),
      nextTokenHash: tokenHash(parsed.data.nextToken),
      targetWorkspaceId: parsed.data.targetWorkspaceId,
      now,
    });
  }
}
