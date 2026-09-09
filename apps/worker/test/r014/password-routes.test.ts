import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { deriveScrypt, runMigrations } from "@ka/db";
import { registerR014Routes } from "../../src/r014/routes.js";
import { createPasswordRoutes } from "../../src/r014/password-routes.js";
import { InternalTestLoginProvider } from "../../src/auth/internal-test-login-provider.js";
import { IdentityPasswordRepository } from "@ka/db";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

const OLD_PASSWORD = "boot-strap-pass-2026";
const NEW_PASSWORD = "a-much-longer-new-one";

/** v1.7.6 + G11 自助改密（migration 020）。 */
describe("POST /auth/password (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const passwords = new IdentityPasswordRepository(pool);
  let workspaceId = "";
  let identityId = "";
  let bucIdentityId = "";
  let userId = "";
  let bucUserId = "";
  let provider: InternalTestLoginProvider;
  let currentToken = "";

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;
  const errorOf = (result: Captured): Record<string, unknown> =>
    (result.body as { error: Record<string, unknown> }).error;

  const auth = (user = () => userId): unknown => ({
    workspaceId, userId: user(), role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [] },
  });

  const change = (body: unknown, user?: () => string, cookie?: string): Promise<Captured> =>
    callRoute(auth(user), "/api/v1/auth/password", "POST", body, "",
      cookie === undefined ? {} : { cookie: `ka_session=${cookie}` });

  async function makeSession(identity: string): Promise<string> {
    const token = randomUUID();
    await pool.query(
      `INSERT INTO auth_sessions(identity_id, active_workspace_id, token_hash, expires_at)
       VALUES($1,$2,$3, now() + INTERVAL '1 day')`,
      [identity, workspaceId, createHash("sha256").update(token, "utf8").digest("hex")],
    );
    return token;
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`pw-${randomUUID()}`],
    )).rows[0].id;
    for (const [provider_, target] of [["internal_test", "internal"], ["buc", "buc"]] as const) {
      const id = (await pool.query(
        "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES($1,$2,'synthetic') RETURNING id",
        [provider_, `pw-${randomUUID()}`],
      )).rows[0].id;
      const user = (await pool.query(
        "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,'optimizer') RETURNING id",
        [workspaceId, `合成-${target}`],
      )).rows[0].id;
      await pool.query(
        "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
        [workspaceId, id, user],
      );
      if (target === "internal") { identityId = id; userId = user; } else { bucIdentityId = id; bucUserId = user; }
    }

    // ENV 引导凭证：改密前「当前密码」就靠它比对。
    const salt = randomBytes(16);
    const derived = await deriveScrypt(OLD_PASSWORD, salt);
    provider = new InternalTestLoginProvider(true, JSON.stringify([{
      username: "synthetic", passwordSalt: salt.toString("base64url"),
      passwordScrypt: derived.toString("hex"), identityId,
    }]));
    provider.useStoredPasswords(passwords);
    registerR014Routes(createPasswordRoutes(pool, provider));
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM identity_passwords WHERE identity_id = ANY($1::uuid[])",
      [[identityId, bucIdentityId]]);
    await pool.query("DELETE FROM auth_sessions WHERE identity_id = ANY($1::uuid[])",
      [[identityId, bucIdentityId]]);
    currentToken = await makeSession(identityId);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM identity_passwords WHERE identity_id = ANY($1::uuid[])",
      [[identityId, bucIdentityId]]);
    for (const table of ["workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [[identityId, bucIdentityId]]);
    await pool.end();
  });

  it("changes the password and makes the new one the only one that logs in", async () => {
    const result = await change({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(typeof dataOf(result).changedAt).toBe("string");

    // 这才是这条端点的意义：改完之后旧密码必须失效、新密码必须能登。
    // 只写库不接登录的话，两条都会反过来。
    expect(await provider.authenticate("synthetic", NEW_PASSWORD)).toBe(identityId);
    expect(await provider.authenticate("synthetic", OLD_PASSWORD)).toBeNull();
  });

  it("revokes the identity's other sessions and spares the cookie that made the request", async () => {
    await makeSession(identityId);
    await makeSession(identityId);
    const result = await change(
      { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, undefined, currentToken,
    );
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(dataOf(result).otherSessionsRevoked).toBe(2);

    const survivors = (await pool.query(
      "SELECT token_hash FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [identityId],
    )).rows as { token_hash: string }[];
    // 改密常常是因为怀疑泄露；把自己也踢下线只会让人以为改失败了。
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.token_hash).toBe(createHash("sha256").update(currentToken, "utf8").digest("hex"));
  });

  it("refuses a wrong current password without revealing whether one was ever set", async () => {
    const wrong = await change({ currentPassword: "definitely-not-it", newPassword: NEW_PASSWORD });
    // v1.9.9 F-Q024-1：按 fixture 回 401 INVALID_CREDENTIALS，不是 403 FORBIDDEN——
    // fe 的表单认这一种走「密码错」分支，403 会走成未知错误。
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong).code).toBe("INVALID_CREDENTIALS");
    expect(errorOf(wrong).message).toBe("当前密码不正确");
    // 同一句话覆盖「密码错」与「从没设过密码」两种，不透露这个身份有没有设过密码。
    expect(String(errorOf(wrong).message)).not.toMatch(/exist|set|found/i);
    expect(await provider.authenticate("synthetic", OLD_PASSWORD)).toBe(identityId);
  });

  it("enforces the length rule and rejects reusing the current password", async () => {
    expect((await change({ currentPassword: OLD_PASSWORD, newPassword: "short" })).status).toBe(400);
    expect((await change({ currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD })).status).toBe(400);
  });

  it("stays closed to a BUC identity", async () => {
    const result = await change(
      { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, () => bucUserId,
    );
    // BUC 的密码不在我们手里，改不了。
    expect(result.status).toBe(409);
  });

  it("rate-limits after five attempts in the window", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await change({ currentPassword: "wrong-on-purpose", newPassword: NEW_PASSWORD });
    }
    const limited = await change({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
    expect(limited.status).toBe(429);
    expect(errorOf(limited).code).toBe("RATE_LIMITED");
    // 限速是「等会儿再来能成」，这类才该标 retryable。
    expect(errorOf(limited).retryable).toBe(true);
  });

  it("matches the frozen success and error fixtures key for key", async () => {
    // 限速器是**进程内按 identity 计数**，上一条用例把窗口打满了。
    // registerR014Routes 是整表替换，重注册即拿到干净的窗口。
    registerR014Routes(createPasswordRoutes(pool, provider));

    const frozen = (path: string): { data?: Record<string, unknown>; error?: Record<string, unknown> } =>
      JSON.parse(readFileSync(
        new URL(`../../../../packages/contract/fixtures/auth/${path}`, import.meta.url), "utf8",
      )) as { data?: Record<string, unknown>; error?: Record<string, unknown> };

    const ok = await change({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, undefined, currentToken);
    expect(Object.keys(dataOf(ok)).sort())
      .toEqual(Object.keys(frozen("password-changed.json").data!).sort());

    const wrong = await change({ currentPassword: "nope-not-this-one", newPassword: NEW_PASSWORD });
    const frozenError = frozen("password-error.json").error!;
    expect(Object.keys(errorOf(wrong)).sort()).toEqual(Object.keys(frozenError).sort());
    // 码与文案都照 fixture 冻的原话（F-Q024-1 就是栽在这两项上）。
    expect(errorOf(wrong).code).toBe(frozenError.code);
    expect(errorOf(wrong).message).toBe(frozenError.message);
    expect(errorOf(wrong).retryable).toBe(frozenError.retryable);
  });
});
