import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { SCRYPT_KEY_LENGTH, deriveScrypt, verifyPassword, type StoredPassword } from "@ka/db";

const credentialSchema = z.object({
  username: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._@-]+$/),
  passwordSalt: z.string().min(22).max(86).regex(/^[A-Za-z0-9_-]+$/),
  passwordScrypt: z.string().regex(/^[0-9a-f]{64}$/),
  identityId: z.string().uuid(),
}).strict();

const credentialsSchema = z.array(credentialSchema).max(1_000).superRefine((credentials, context) => {
  const usernames = new Set(credentials.map((credential) => credential.username));
  if (usernames.size !== credentials.length) {
    context.addIssue({ code: "custom", message: "internal test usernames must be unique" });
  }
});

export interface InternalTestLoginPort {
  authenticate(username: string, password: string): Promise<string | null>;
}

/**
 * v1.9.3 自助改密（arch 裁 Q-021 ①，`internal-test-login-provider.ts` 临时移交 be2）：
 * **先查 `identity_passwords`，无行才回落 ENV**——ENV 从此只是首次引导凭证。
 * 不接这一层的话，改密写进库了但登录还认 ENV，等于新密码登不上、旧密码照样能登。
 *
 * KDF 参数与 `identity-password-repository.ts` 共用同一套常量，两边分头写死必然对不上。
 */
export interface StoredPasswordLookup {
  find(identityId: string): Promise<StoredPassword | null>;
  findByLoginName?(username: string): Promise<{ identityId: string; password: StoredPassword | null } | null>;
}

export class InternalTestLoginProvider implements InternalTestLoginPort {
  private readonly credentials: z.infer<typeof credentialsSchema>;
  private stored: StoredPasswordLookup | null = null;

  constructor(private readonly enabled: boolean, credentialsJson: string | undefined) {
    if (!enabled) {
      this.credentials = [];
      return;
    }
    if (credentialsJson === undefined) {
      throw new Error("INTERNAL_TEST_AUTH_CREDENTIALS_JSON is required when internal test auth is enabled");
    }
    let value: unknown;
    try {
      value = JSON.parse(credentialsJson) as unknown;
    } catch {
      throw new Error("INTERNAL_TEST_AUTH_CREDENTIALS_JSON must be valid JSON");
    }
    this.credentials = credentialsSchema.parse(value);
    if (this.credentials.length === 0) {
      throw new Error("internal test auth requires at least one configured credential");
    }
  }

  /** 接上自助改密的存储；不接时行为与从前完全一致（纯 ENV）。 */
  useStoredPasswords(lookup: StoredPasswordLookup): void {
    this.stored = lookup;
  }

  /** 改密时校验「当前密码」用：这个用户名对应的 ENV 引导凭证。表里有行时用不到。 */
  envCredentialFor(identityId: string): StoredPassword | null {
    const credential = this.credentials.find((item) => item.identityId === identityId);
    if (credential === undefined) return null;
    return { passwordSalt: credential.passwordSalt, passwordScrypt: credential.passwordScrypt, algo: "scrypt" };
  }

  async authenticate(username: string, password: string): Promise<string | null> {
    if (!this.enabled) return null;
    let credential = this.credentials.find((item) => item.username === username);

    // F-OS-004: database-issued usernames must be usable without editing deployment ENV.
    // A DB password takes precedence; a mismatched DB identity may never inherit another ENV identity's verifier.
    if (this.stored?.findByLoginName !== undefined) {
      const resolved = await this.stored.findByLoginName(username);
      if (resolved?.password !== null && resolved?.password !== undefined) {
        return await verifyPassword(password, resolved.password) ? resolved.identityId : null;
      }
      if (resolved !== null && credential?.identityId !== resolved.identityId) credential = undefined;
    }

    // 自助改过密码的：库里那条说了算，ENV 里的旧密码从此无效。
    if (credential !== undefined && this.stored !== null) {
      const stored = await this.stored.find(credential.identityId);
      if (stored !== null) return await verifyPassword(password, stored) ? credential.identityId : null;
    }

    // 用户名不存在时也走完整套 KDF，用时长一致避免被拿来枚举用户名。
    const salt = Buffer.from(credential?.passwordSalt ?? "AAAAAAAAAAAAAAAAAAAAAA", "base64url");
    const actual = await deriveScrypt(password, salt);
    const expected = Buffer.from(credential?.passwordScrypt ?? "0".repeat(64), "hex");
    if (expected.length !== SCRYPT_KEY_LENGTH) return null;
    const matches = timingSafeEqual(actual, expected);
    return matches && credential !== undefined ? credential.identityId : null;
  }
}
