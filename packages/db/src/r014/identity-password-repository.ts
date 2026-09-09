import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership, requireTimestamp,
} from "./workspace-authority.js";

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
      // **不透露这个身份有没有设过密码**。
      if (expected === null || !await verifyPassword(currentPassword, expected)) {
        throw new R014RepositoryError("FORBIDDEN");
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
