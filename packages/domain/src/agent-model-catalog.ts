import { z } from "zod";

const identifier = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/);
const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
/** Explicit non-secret DB projection, not the browser response. */
export const agentModelCapabilityRowSchema = z.object({
  provider_id: identifier, model: identifier, status: z.enum(["verified", "documented_unverified", "failed", "disabled"]),
  tested_at: z.string().datetime({ offset: true }).nullable(), test_version: z.string().min(1).max(256).nullable(),
}).strict();
export const agentModelCatalogSchema = z.object({
  items: z.array(z.object({
    id: identifier, provider: identifier, label: z.string().min(1).max(512).refine(value => [...value].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
    default: z.boolean(), status: z.enum(["verified", "documented_unverified", "disabled"]),
  }).strict()).max(1000),
}).strict().superRefine(({ items }, ctx) => {
  const seen = new Set<string>();
  let defaults = 0;
  for (const [index, item] of items.entries()) {
    const key = JSON.stringify([item.provider, item.id]);
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["items", index], message: "Duplicate model identity" });
    seen.add(key);
    if (item.default) {
      defaults++;
      if (item.status !== "verified") ctx.addIssue({ code: "custom", path: ["items", index, "default"], message: "Unverified default" });
    }
  }
  if (defaults > 1) ctx.addIssue({ code: "custom", path: ["items"], message: "Multiple defaults" });
});
export type AgentModelCatalog = z.infer<typeof agentModelCatalogSchema>;
export const agentModelCatalogResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: agentModelCatalogSchema, meta: z.object({ requestId }).strict() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({
    code: z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR"]),
    message: z.string().min(1), requestId, retryable: z.boolean(),
  }).strict() }).strict(),
]);
export type AgentModelCatalogResponse = z.infer<typeof agentModelCatalogResponseSchema>;
