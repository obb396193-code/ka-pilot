import { randomBytes } from "node:crypto";

import {
  guestLoginRequestSchema,
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
  /** v1.9.6 访客登录；不配就是关闭，`POST /auth/login {provider:"guest"}` 一律 404。 */
  guest?: GuestAccessOptions;
}

export interface GuestAccessOptions {
  enabled: boolean;
  /** 演示空间 id；仓储会再核一次它确实是 `kind=team + is_demo`，配错不放行。 */
  workspaceId: string | null;
  findGuestIdentity: (workspaceId: string) => Promise<string | null>;
  /** 建会话另走一条路：常规路径强制要求个人空间，访客没有。见仓储注释。 */
  issueSession: (workspaceId: string, identityId: string, token: string, expiresAt: Date) => Promise<boolean>;
  /**
   * 每小时上限，默认 20（契约）。**开出来是给测试注入的**——
   * 让用例自己定窗口，而不是靠「跑 20 次真请求」去撞默认值。
   */
  maxPerWindow?: number;
  /** 契约定的 2 小时，比常规会话短——访客不该长期挂着。 */
  ttlSeconds?: number;
}

const GUEST_TTL_SECONDS = 2 * 60 * 60;
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const GUEST_MAX_PER_WINDOW = 20;

/**
 * 访客登录限速。契约说按 IP 20 次/小时；壳层当前没有把 IP 传进 `login()`
 * （那要改 `http-server.ts`，不是我的文件），所以**没有 IP 时退化成全局桶**——
 * 弱一些，但不假装限速到位。壳层哪天把 IP 传进来，同一段代码自动变成按 IP。
 */
class GuestLoginLimiter {
  private readonly hits = new Map<string, number[]>();

  /** 桶是**每个服务实例一份**，不是模块级——两个实例互不影响，用例之间也就不会串。 */
  allow(key: string, now: number, max = GUEST_MAX_PER_WINDOW): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < GUEST_WINDOW_MS);
    if (recent.length >= max) return false;
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [existing, at] of this.hits) {
        if (at.every((time) => now - time >= GUEST_WINDOW_MS)) this.hits.delete(existing);
      }
    }
    return true;
  }
}

function error(
  // 404 是 v1.9.6 访客登录关闭时用的：功能没开就当这条路不存在，不透露有这么个入口。
  status: 400 | 401 | 403 | 404 | 405 | 500 | 502,
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
  private readonly guest: GuestAccessOptions | undefined;
  private readonly guestLimiter = new GuestLoginLimiter();

  constructor(
    private readonly auth: SessionAuthService,
    private readonly loginProvider: InternalTestLoginPort,
    options: SessionHttpServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.token = options.token ?? (() => randomBytes(32).toString("base64url"));
    this.ttlSeconds = options.ttlSeconds ?? 8 * 60 * 60;
    this.guest = options.guest;
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

  async login(body: unknown, requestId: string, clientIp?: string): Promise<SessionHttpResult> {
    if ((body as { provider?: unknown } | null)?.provider === "guest") {
      return this.guestLogin(body, requestId, clientIp);
    }
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

  /**
   * v1.9.6 访客登录：匿名会话落到演示空间，viewer 只读，TTL 2 小时。
   * **关闭时回 404 而不是 403**——功能没开就当这条路不存在，不透露有这么个入口。
   */
  private async guestLogin(body: unknown, requestId: string, clientIp?: string): Promise<SessionHttpResult> {
    const guest = this.guest;
    if (guest === undefined || !guest.enabled || guest.workspaceId === null) {
      return error(404, "INVALID_REQUEST", "Guest access is not enabled", requestId);
    }
    if (!guestLoginRequestSchema.safeParse(body).success) return sessionInputError(requestId);
    // 限速键：有 IP 用 IP，没有就退化成全局桶（见 GuestLoginLimiter 注释）。
    // 时间从 `this.now()` 来（可注入），不直接读挂钟——用例才能自己定窗口。
    if (!this.guestLimiter.allow(clientIp ?? "global", this.now().getTime(), guest.maxPerWindow)) {
      return error(403, "FORBIDDEN", "Too many guest logins, try again later", requestId);
    }

    const identityId = await guest.findGuestIdentity(guest.workspaceId);
    // 找不到预置的访客身份 = 演示空间没灌好；**不现建身份**，那会在真库里造出一个
    // 谁也没审过的可登录主体。
    if (identityId === null) return error(404, "INVALID_REQUEST", "Guest access is not enabled", requestId);

    const token = this.token();
    const ttlSeconds = guest.ttlSeconds ?? GUEST_TTL_SECONDS;
    const issued = await guest.issueSession(
      guest.workspaceId, identityId, token, new Date(this.now().getTime() + ttlSeconds * 1_000),
    );
    if (!issued) return loginFailure(requestId);
    const result = await this.view(token, requestId);
    if (result.status !== 200) {
      await this.auth.logout(token);
      return result;
    }
    return { ...result, sessionToken: token, cookieMaxAgeSeconds: ttlSeconds };
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
