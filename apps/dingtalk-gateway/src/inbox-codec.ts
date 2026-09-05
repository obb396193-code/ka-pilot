import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const sealedSchema = z.object({
  version: z.literal(1), nonce: z.string().regex(/^[a-f0-9]{24}$/),
  tag: z.string().regex(/^[a-f0-9]{32}$/), data: z.string().max(180_000),
}).strict();

/** No webhook/message plaintext in inbox JSON or process logs. Key stays in Secret env. */
export class InboxCodec {
  private readonly key: Buffer;
  constructor(keyHex: string) {
    if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("Invalid inbox encryption key");
    this.key = Buffer.from(keyHex, "hex");
  }
  seal(value: unknown, workspace: string, event: string, purpose: "message" | "reply"): Record<string, unknown> {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) >= 131_072) throw new Error("Inbox content exceeds limit");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([workspace, "dingtalk", event, purpose])));
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return { version: 1, nonce: nonce.toString("hex"), tag: cipher.getAuthTag().toString("hex"), data: encrypted.toString("base64") };
  }
  open(value: unknown, workspace: string, event: string, purpose: "message" | "reply"): unknown {
    const sealed = sealedSchema.parse(value);
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(sealed.nonce, "hex"));
    decipher.setAAD(Buffer.from(JSON.stringify([workspace, "dingtalk", event, purpose])));
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8"));
  }
}
