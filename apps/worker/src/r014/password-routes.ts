import { createHash } from "node:crypto";

import { IdentityPasswordRepository, resolveIdentityId } from "@ka/db";
import type { Pool } from "pg";

import { SESSION_COOKIE_NAME } from "../auth/session-http.js";
import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

/**
 * v1.7.6 + v1.7.8 G11 `POST /api/v1/auth/password`（migration 020）。
 *
 * 只对 `provider=internal_test` 开放；BUC 身份的密码不在我们手里。
 * 成功后吊销该身份的**其他** session，当前这条留着——不然改完密码自己先被踢出去。
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * 限速 5 次/15 分钟，按 identity 进程内计数（arch 裁：内测够用）。
 * **多实例下不严格**——各进程各计各的；正式化要换成共享计数器，别以为这是强限速。
 */
class AttemptWindow {
  private readonly hits = new Map<string, number[]>();

  check(key: string, now: number): void {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) {
      throw new R014HttpError(429, "RATE_LIMITED", "Too many password attempts, try again later");
    }
    recent.push(now);
    this.hits.set(key, recent);
    // 只留还在窗口内的键，避免长跑进程无限涨。
    if (this.hits.size > 10_000) {
      for (const [existing, at] of this.hits) {
        if (at.every((time) => now - time >= WINDOW_MS)) this.hits.delete(existing);
      }
    }
  }
}

/** 当前会话的 token hash：与鉴权层同一口径（sha256 hex），用来把自己排除在吊销之外。 */
function currentSessionTokenHash(cookieHeader: string | undefined): string {
  const parts = (cookieHeader ?? "").split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (match === undefined) return "";
  return createHash("sha256").update(match.slice(SESSION_COOKIE_NAME.length + 1), "utf8").digest("hex");
}

export interface EnvCredentialLookup {
  envCredentialFor(identityId: string): { passwordSalt: string; passwordScrypt: string; algo: string } | null;
}

export function createPasswordRoutes(pool: Pool, envCredentials: EnvCredentialLookup): R014Route[] {
  const repository = new IdentityPasswordRepository(pool);
  const attempts = new AttemptWindow();

  return [
    guardedRoute((pathname) => pathname === "/api/v1/auth/password", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 8_192) as Record<string, unknown> | undefined;
      // 会话上下文里没有 identityId，从 live 成员关系反查（顺带确认他现在还是在册成员）。
      const identityId = await resolveIdentityId(pool, context.auth);
      // 限速按 identity 计，在读 body 之后、比对密码之前——试错次数才是要限的东西。
      attempts.check(identityId, Date.now());

      sendData(
        context.response,
        await repository.change(
          context.auth,
          identityId,
          currentSessionTokenHash(context.request.headers.cookie),
          {
            currentPassword: String(body?.currentPassword ?? body?.current_password ?? ""),
            newPassword: String(body?.newPassword ?? body?.new_password ?? ""),
          },
          envCredentials.envCredentialFor(identityId),
        ),
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
