import { createHash } from "node:crypto";
import type { QihangQuery } from "./client.js";

export type QihangProtocolKind = "invalid_json" | "invalid_envelope" | "invalid_resource_shape";
/** Only allowlisted query facts. Do not log arbitrary body snippets: an HTML
 * login page or malformed JSON can echo a token/user identity even in byte 1.
 * Hashes let OS correlate a failed batch/body without storing those raw values.
 */
export function protocolDiagnostic(query: QihangQuery, kind: QihangProtocolKind, body: string): string {
  const media = query.media ?? "KUAISHOU";
  const facts: Record<string, string | number> = {
    resource: query.resource, media: /^[A-Z0-9_]{1,32}$/.test(media) ? media : "unreported",
    accountCount: query.accountIds?.length ?? 0,
  };
  for (const name of ["ds", "beginDate", "endDate"] as const) {
    const value = name in query ? (query as unknown as Record<string, unknown>)[name] : undefined;
    if (typeof value === "string" && /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) facts[name] = value;
  }
  for (const name of ["pageNum", "pageSize", "hh"] as const) {
    const value = name in query ? (query as unknown as Record<string, unknown>)[name] : undefined;
    if ((typeof value === "number" || (typeof value === "string" && /^\d{1,6}$/.test(value))) &&
      Number.isSafeInteger(Number(value)) && Number(value) >= 0) facts[name] = Number(value);
  }
  if (query.resource === "ad_realtime") facts.adCount = query.adIds?.length ?? 0;
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ facts,
    accountIds: query.accountIds ?? [], adIds: query.resource === "ad_realtime" ? query.adIds ?? [] : [],
  })).digest("hex").slice(0, 16);
  return JSON.stringify({ ...facts, requestFingerprint, kind, bodyBytes: Buffer.byteLength(body),
    bodySha256: createHash("sha256").update(body).digest("hex"), bodyPreview: "withheld_untrusted_response" });
}
