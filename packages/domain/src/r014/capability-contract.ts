import { z } from "zod";

// v1.5 5.7 操作工具箱（Capability Registry）。表 capabilities 是全局注册表（key 为主键，无 workspace_id）。
export const capabilityCategorySchema = z.enum(["query", "write", "infra", "account", "material"]);
export const capabilityStatusSchema = z.enum(["documented_unverified", "verified", "disabled"]);
export const capabilityExecutorSchema = z.enum(["product_direct", "runtime", "multica_run"]);

export const capabilitySchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  category: capabilityCategorySchema,
  // JSON Schema 原样透传给前端渲染表单。后端不在这里解释它，更不 eval。
  form_schema: z.record(z.string(), z.unknown()),
  permission: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  status: capabilityStatusSchema,
  executor: capabilityExecutorSchema,
  media: z.array(z.string().min(1).max(32)),
}).strict();
export type Capability = z.infer<typeof capabilitySchema>;

/** invoke 允许产生的副作用。**没有 "execute"**：写类能力永远只到变更集草稿为止。 */
export type CapabilityEffect =
  | { allowed: true; effect: "query_result" }
  | { allowed: true; effect: "changeset_draft" }
  | { allowed: true; effect: "infra_request" }
  | { allowed: false; code: "CAPABILITY_UNAVAILABLE" };

/**
 * api.md 5.7：query → result_ref；write → **只生成变更集草稿**（走 dry-run/confirm 链，永不直接执行）；
 * infra → infra_requests 一行；disabled / documented_unverified → 409 CAPABILITY_UNAVAILABLE。
 * account / material 两类契约没写落点 → 一律按不可用挡住，不替它们发明一条副作用路径。
 */
export function capabilityEffect(capability: Capability): CapabilityEffect {
  const parsed = capabilitySchema.parse(capability);
  if (parsed.status !== "verified") return { allowed: false, code: "CAPABILITY_UNAVAILABLE" };
  switch (parsed.category) {
    case "query": return { allowed: true, effect: "query_result" };
    case "write": return { allowed: true, effect: "changeset_draft" };
    case "infra": return { allowed: true, effect: "infra_request" };
    default: return { allowed: false, code: "CAPABILITY_UNAVAILABLE" };
  }
}

/** 能力声明了 media 白名单时，只能对白名单里的媒体调用；空数组 = 不限媒体。 */
export function capabilitySupportsMedia(capability: Capability, media: string): boolean {
  const parsed = capabilitySchema.parse(capability);
  return parsed.media.length === 0 || parsed.media.includes(media);
}
