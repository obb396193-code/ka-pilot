import { z } from "zod";

const common = { workspace_id: z.string().uuid(), qihang_user_id: z.string().min(1).max(256).regex(/^[A-Za-z0-9_:-]+$/) };
/** Operator CLI only, not a browser-owned identity or a media permission grant. */
export const qihangIdentitySeedSchema = z.union([
  z.object({ ...common, user_id: z.string().uuid() }).strict(),
  z.object({ ...common, identity_id: z.string().uuid() }).strict(),
]);
export type QihangIdentitySeed = z.infer<typeof qihangIdentitySeedSchema>;
export const qihangIdentitySeedResultSchema = z.object({
  workspaceId: z.string().uuid(), userId: z.string().uuid(), status: z.enum(["bound", "unchanged", "replaced"]),
}).strict();
export type QihangIdentitySeedResult = z.infer<typeof qihangIdentitySeedResultSchema>;
