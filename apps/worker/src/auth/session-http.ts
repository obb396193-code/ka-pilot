import { randomBytes } from "node:crypto";

import {
  internalTestLoginRequestSchema,
  logoutSuccessResponseSchema,
  sessionErrorResponseSchema,
  sessionSuccessResponseSchema,
  workspaceSwitchRequestSchema,
  type SessionHttpResponse,
  type SessionViewResolution,
} from "@ka/domain";

import type { InternalTestLoginPort } from "./internal-test-login-provider.js";
import type { SessionAuthService } from "./session-auth-service.js";

export const AUTH_LOGIN_HTTP_PATH = "/api/v1/auth/login";
export const AUTH_SESSION_HTTP_PATH = "/api/v1/auth/session";
export const AUTH_WORKSPACES_HTTP_PATH = "/api/v1/auth/workspaces";
export const AUTH_WORKSPACE_HTTP_PATH = "/api/v1/auth/workspace";
export const SESSION_COOKIE_NAME = "ka_session";

export const SESSION_HTTP_PATHS = new Set([
  AUTH_LOGIN_HTTP_PATH,
  AUTH_SESSION_HTTP_PATH,
  AUTH_WORKSPACES_HTTP_PATH,
  AUTH_WORKSPACE_HTTP_PATH,
]);

export interface SessionHttpResult {
  status: number;
  body: SessionHttpResponse;
  sessionToken?: string;
  cookieMaxAgeSeconds?: number;
  clearCookie?: true;
}

export interface SessionHttpServiceOptions {
  now?: () => Date;
  token?: () => string;
  ttlSeconds?: number;
}

function error(
  status: 400 | 401 | 403 | 405 | 500 | 502,
  code: "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL_ERROR" | "SOURCE_TRUNCATED",
  message: string,
  requestId: string,
): SessionHttpResult {
  return {
    status,
    body: sessionErrorResponseSchema.parse({
      ok: false,
      error: { code, message, retryable: false, requestId },
    }),
  };
}

function authFailure(
  resolution: Exclude<SessionViewResolution, { status: "approved" }>,
  requestId: string,
): SessionHttpResult {
  return resolution.httpStatus === 401
    ? error(401, "UNAUTHORIZED", "Authentication is required", requestId)
    : error(403, "FORBIDDEN", "Workspace access is not allowed", requestId);
}

function loginFailure(requestId: string): SessionHttpResult {
  return error(401, "UNAUTHORIZED", "Invalid credentials", requestId);
}

export function sessionMethodError(requestId: string): SessionHttpResult {
  return error(405, "INVALID_REQUEST", "Method is not allowed", requestId);
}

export function sessionInputError(requestId: string): SessionHttpResult {
  return error(400, "INVALID_REQUEST", "Invalid auth request", requestId);
}

export function sessionInternalError(requestId: string): SessionHttpResult {
  return error(500, "INTERNAL_ERROR", "The auth request could not be completed", requestId);
}

export function sessionTruncatedError(requestId: string): SessionHttpResult {
  return error(502, "SOURCE_TRUNCATED", "Session response reached the configured body limit", requestId);
}

export class SessionHttpService {
  private readonly now: () => Date;
  private readonly token: () => string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly auth: SessionAuthService,
    private readonly loginProvider: InternalTestLoginPort,
    options: SessionHttpServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.token = options.token ?? (() => randomBytes(32).toString("base64url"));
    this.ttlSeconds = options.ttlSeconds ?? 8 * 60 * 60;
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds < 60 || this.ttlSeconds > 7 * 24 * 60 * 60) {
      throw new Error("session ttl must be an integer between 60 seconds and 7 days");
    }
  }

  private async view(token: string, requestId: string): Promise<SessionHttpResult> {
    const resolution = await this.auth.current(token);
    if (resolution.status !== "approved") return authFailure(resolution, requestId);
    return {
      status: 200,
      body: sessionSuccessResponseSchema.parse({
        ok: true,
        data: resolution.view,
        meta: { requestId },
      }),
    };
  }

  async login(body: unknown, requestId: string): Promise<SessionHttpResult> {
    const parsed = internalTestLoginRequestSchema.safeParse(body);
    if (!parsed.success) return sessionInputError(requestId);
    const identityId = await this.loginProvider.authenticate(parsed.data.username, parsed.data.password);
    if (identityId === null) {
      return loginFailure(requestId);
    }
    const token = this.token();
    const now = this.now();
    const resolution = await this.auth.issueForIdentity({
      identityId,
      token,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1_000),
    });
    if (resolution.status !== "approved") {
      return loginFailure(requestId);
    }
    const result = await this.view(token, requestId);
    if (result.status !== 200) {
      await this.auth.logout(token);
      return result;
    }
    return { ...result, sessionToken: token, cookieMaxAgeSeconds: this.ttlSeconds };
  }

  async current(token: string | null, requestId: string): Promise<SessionHttpResult> {
    if (token === null) return error(401, "UNAUTHORIZED", "Authentication is required", requestId);
    return this.view(token, requestId);
  }

  async switchWorkspace(token: string | null, body: unknown, requestId: string): Promise<SessionHttpResult> {
    if (token === null) return error(401, "UNAUTHORIZED", "Authentication is required", requestId);
    const parsed = workspaceSwitchRequestSchema.safeParse(body);
    if (!parsed.success) return sessionInputError(requestId);
    const nextToken = this.token();
    const now = this.now();
    const resolution = await this.auth.switchWorkspace({
      token,
      nextToken,
      targetWorkspaceId: parsed.data.workspaceId,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1_000),
    });
    if (resolution.status !== "approved") {
      return resolution.httpStatus === 401
        ? error(401, "UNAUTHORIZED", "Authentication is required", requestId)
        : error(403, "FORBIDDEN", "Workspace access is not allowed", requestId);
    }
    const result = await this.view(nextToken, requestId);
    if (result.status !== 200) {
      await this.auth.logout(nextToken);
      return result;
    }
    return { ...result, sessionToken: nextToken, cookieMaxAgeSeconds: this.ttlSeconds };
  }

  async logout(token: string | null, requestId: string): Promise<SessionHttpResult> {
    if (token !== null) await this.auth.logout(token);
    return {
      status: 200,
      body: logoutSuccessResponseSchema.parse({
        ok: true,
        data: { loggedOut: true },
        meta: { requestId },
      }),
      clearCookie: true,
    };
  }

  async discard(token: string): Promise<void> {
    await this.auth.logout(token);
  }
}

/**
 * Secure 属性默认开启（生产唯一正确值）。只有显式设置 AUTH_COOKIE_INSECURE=1 才关闭，
 * 用于「本地/内测走 http 端口映射」这种没有 TLS 的场景——浏览器会丢弃 http 上的 Secure cookie，
 * 表现为「登录成功但读取会话失败」。生产部署禁止设置该变量。
 */
function cookieSecureAttribute(): string {
  return process.env.AUTH_COOKIE_INSECURE === "1" ? "" : " Secure;";
}

export function sessionCookie(token: string, ttlSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly;${cookieSecureAttribute()} SameSite=Lax; Max-Age=${ttlSeconds}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly;${cookieSecureAttribute()} SameSite=Lax; Max-Age=0`;
}

export function parseSessionCookie(header: string | null): string | null {
  if (header === null) return null;
  const matches = header.split(";").map((part) => part.trim()).filter((part) =>
    part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(SESSION_COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9._~-]{32,512}$/.test(value) ? value : null;
}
