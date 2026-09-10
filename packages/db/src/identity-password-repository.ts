import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership, requireTimestamp,
} from "./r014/workspace-authority.js";

/**
 * v1.7.6 + v1.7.8 G11 自助改密（migration 020）。
 *
 * 为什么要这张表：`auth_identities` 明写「不存密码/token」，internal_test 的凭证原来只在
 * ENV `INTERNAL_TEST_AUTH_CREDENTIALS_JSON` 里，进程改不了自己的 ENV。没有落点的话，
 * 改密只能"假装成功"——用户改完新密码登不上、旧密码照样能登，比不上线更糟。
 * 所以 arch 裁：本表优先，无行回落 ENV（ENV 降级为首次引导凭证）。
 *
 * KDF 参数必须与 `internal-test-login-provider.ts` 完全一致，否则改完就登不上。
 * 两边都从这里取。
 */
export const SCRYPT_KEY_LENGTH = 32;
export const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;

export function deriveScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error !== null) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface StoredPassword { passwordSalt: string; passwordScrypt: string; algo: string }

/** 新密码规则（v1.7.6）：≥12 位、不得等于当前密码。 */
export const MIN_PASSWORD_LENGTH = 12;

export class IdentityPasswordRepository {
  constructor(private readonly pool: Pool) {}

  /** F-OS-004: new members do not have an ENV entry. Resolve only active internal-test identities. */
  async findByLoginName(username: string): Promise<{ identityId: string; password: StoredPassword | null } | null> {
    if (typeof username !== "string" || !/^[A-Za-z0-9._@-]{1,128}$(?![\s\S])/.test(username)) return null;
    const { rows } = await this.pool.query(`SELECT i.id,p.password_salt,p.password_scrypt,p.algo
      FROM auth_identities i LEFT JOIN identity_passwords p ON p.identity_id=i.id
      WHERE i.provider='internal_test' AND i.provider_subject=$1 AND i.is_active=true LIMIT 2`, [username]);
    if (rows.length === 0) return null;
    if (rows.length !== 1 || typeof rows[0]?.id !== "string") throw new R014RepositoryError("INVALID_RESULT");
    const row = rows[0];
    if (row.password_salt === null && row.password_scrypt === null && row.algo === null) return { identityId: row.id, password: null };
    if (typeof row.password_salt !== "string" || typeof row.password_scrypt !== "string" || row.algo !== "scrypt") throw new R014RepositoryError("INVALID_RESULT");
    return { identityId: row.id, password: { passwordSalt: row.password_salt, passwordScrypt: row.password_scrypt, algo: row.algo } };
  }

  /** 登录路径用：这个身份有没有自助设过密码。没有 → 调用方回落 ENV。 */
  async find(identityId: string): Promise<StoredPassword | null> {
    const row = (await this.pool.query(
      "SELECT password_salt, password_scrypt, algo FROM identity_passwords WHERE identity_id=$1",
      [identityId],
    )).rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return {
      passwordSalt: String(row.password_salt),
      passwordScrypt: String(row.password_scrypt),
      algo: String(row.algo),
    };
  }

  /**
   * 改密。校验当前密码 → 写新哈希 → 吊销该身份其他 session（当前这条留着）。
   *
   * 当前密码的校验口径与登录一致：**先查表，无行才回落 ENV**。`envFallback` 由调用方
   * 从登录 provider 取，仓储不碰 ENV。
   */
  async change(
    auth: ApprovedWorkspaceAuthContext,
    identityId: string,
    currentSessionTokenHash: string,
    input: { currentPassword: string; newPassword: string },
    envFallback: StoredPassword | null,
  ): Promise<{ changedAt: string; otherSessionsRevoked: number }> {
    const approved = approveAuth(auth);
    const currentPassword = String(input.currentPassword ?? "");
    const newPassword = String(input.newPassword ?? ""); // Freeze caller input before the first await.
    if (typeof identityId !== "string" || identityId.length === 0) throw new R014RepositoryError("INVALID_INPUT");
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 1024) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    // 新旧相同直接拒：改了个寂寞，还会让人以为已经换过了。
    if (newPassword === currentPassword) throw new R014RepositoryError("INVALID_INPUT");

    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      await this.assertInternalTestIdentity(client, identityId);

      const stored = (await client.query(
        "SELECT password_salt, password_scrypt FROM identity_passwords WHERE identity_id=$1 FOR UPDATE",
        [identityId],
      )).rows[0] as Record<string, unknown> | undefined;
      const expected: StoredPassword | null = stored === undefined
        ? envFallback
        : { passwordSalt: String(stored.password_salt), passwordScrypt: String(stored.password_scrypt), algo: "scrypt" };
      // 表里没有、ENV 里也没有 → 没有可比对的当前密码，一律按「当前密码不正确」回，
      // **不透露这个身份有没有设过密码**。v1.9.9 F-Q024-1：这一种要和 FORBIDDEN 分开，
      // 前端表单认它走「密码错」分支，返 403 会走成未知错误。
      if (expected === null || !await verifyPassword(currentPassword, expected)) {
        throw new R014RepositoryError("INVALID_CREDENTIALS");
      }

      const salt = randomBytes(16);
      const derived = await deriveScrypt(newPassword, salt);
      const changed = (await client.query(
        `INSERT INTO identity_passwords(identity_id, password_salt, password_scrypt, algo, updated_by)
         VALUES($1,$2,$3,'scrypt',$4)
         ON CONFLICT (identity_id) DO UPDATE
           SET password_salt=EXCLUDED.password_salt, password_scrypt=EXCLUDED.password_scrypt,
               algo='scrypt', updated_at=now(), updated_by=EXCLUDED.updated_by
         RETURNING updated_at`,
        [identityId, salt.toString("base64url"), derived.toString("hex"), approved.userId],
      )).rows[0] as Record<string, unknown>;

      // 改密后把这个身份的其他会话下线（当前这条保留）——密码可能是因为泄露才改的。
      const revoked = await client.query(
        `UPDATE auth_sessions SET revoked_at=now()
         WHERE identity_id=$1 AND revoked_at IS NULL AND token_hash <> $2
         RETURNING id`,
        [identityId, currentSessionTokenHash],
      );

      return {
        changedAt: requireTimestamp(changed.updated_at).toISOString(),
        otherSessionsRevoked: revoked.rows.length,
      };
    });
  }

  /**
   * v1.9.5：治理后台新增成员时直接写初始密码。Codex 的 members 端点复用这里，
   * **两边不各写一套 scrypt**——KDF 参数分头写死必然对不上，改密那次已经踩过。
   */
  async setPassword(identityId: string, plain: string, updatedBy: string | null, executor: Pick<PoolClient, "query"> = this.pool): Promise<{ updatedAt: string }> {
    if (typeof identityId !== "string" || identityId.length === 0) throw new R014RepositoryError("INVALID_INPUT");
    if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH || plain.length > 1024) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const salt = randomBytes(16);
    const derived = await deriveScrypt(plain, salt);
    // Provisioning/reset supplies its transaction client: never commit the password separately
    // from the identity/membership or session revocation. Existing callers keep pool behavior.
    const row = (await executor.query(
      `INSERT INTO identity_passwords(identity_id, password_salt, password_scrypt, algo, updated_by)
       VALUES($1,$2,$3,'scrypt',$4)
       ON CONFLICT (identity_id) DO UPDATE
         SET password_salt=EXCLUDED.password_salt, password_scrypt=EXCLUDED.password_scrypt,
             algo='scrypt', updated_at=now(), updated_by=EXCLUDED.updated_by
       RETURNING updated_at`,
      [identityId, salt.toString("base64url"), derived.toString("hex"), updatedBy],
    )).rows[0] as Record<string, unknown>;
    return { updatedAt: requireTimestamp(row.updated_at).toISOString() };
  }

  /** 校验明文密码。表里没有行 → false（调用方自己决定要不要回落 ENV）。 */
  async verify(identityId: string, plain: string): Promise<boolean> {
    const stored = await this.find(identityId);
    if (stored === null) return false;
    return verifyPassword(plain, stored);
  }

  /**
   * 这个身份是不是还在用**别人给的初始密码**。
   *
   * 判据：有密码行、且 `updated_by` 不是这个身份自己的 user —— 管理员开户时写的是
   * 管理员的 user id，本人自助改密写的是自己的。**没有加 must_change 列**：
   * 这个事实已经能从 updated_by 推出来，多一列就多一处要维护的真相。
   */
  async mustChangePassword(identityId: string): Promise<boolean> {
    const row = (await this.pool.query(
      `SELECT password.updated_by, member.user_id
       FROM identity_passwords AS password
       LEFT JOIN workspace_memberships AS member
         ON member.identity_id=password.identity_id AND member.is_active=true
       WHERE password.identity_id=$1
       LIMIT 1`,
      [identityId],
    )).rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) return false;
    if (row.updated_by === null) return true;
    return String(row.updated_by) !== String(row.user_id ?? "");
  }

  /** 只对 `provider=internal_test` 开放；BUC 身份的密码不在我们手里。 */
  private async assertInternalTestIdentity(client: PoolClient, identityId: string): Promise<void> {
    const row = (await client.query(
      "SELECT provider FROM auth_identities WHERE id=$1 AND is_active=true FOR SHARE",
      [identityId],
    )).rows[0] as { provider: unknown } | undefined;
    if (row === undefined) throw new R014RepositoryError("NOT_FOUND");
    if (String(row.provider) !== "internal_test") throw new R014RepositoryError("CONFLICT");
  }
}

/** 定长比较，避免用比较耗时反推密码。 */
export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  if (stored.algo !== "scrypt") return false;
  const salt = Buffer.from(stored.passwordSalt, "base64url");
  const expected = Buffer.from(stored.passwordScrypt, "hex");
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;
  const actual = await deriveScrypt(password, salt);
  return timingSafeEqual(actual, expected);
}
