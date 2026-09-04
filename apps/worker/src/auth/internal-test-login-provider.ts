import { scryptSync, timingSafeEqual } from "node:crypto";

import { z } from "zod";

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

export class InternalTestLoginProvider implements InternalTestLoginPort {
  private readonly credentials: z.infer<typeof credentialsSchema>;

  constructor(enabled: boolean, credentialsJson: string | undefined) {
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

  async authenticate(username: string, password: string): Promise<string | null> {
    const credential = this.credentials.find((item) => item.username === username);
    const salt = Buffer.from(credential?.passwordSalt ?? "AAAAAAAAAAAAAAAAAAAAAA", "base64url");
    const actual = scryptSync(password, salt, 32);
    const expected = Buffer.from(credential?.passwordScrypt ?? "0".repeat(64), "hex");
    const matches = timingSafeEqual(actual, expected);
    return matches && credential !== undefined ? credential.identityId : null;
  }
}
