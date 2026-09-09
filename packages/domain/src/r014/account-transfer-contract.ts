import { z } from "zod";

// v1.5 4.10 账户交接（A7）。fixture accounts/transfer.json 即契约。
const mediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);
const accountIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const accountTransferRequestSchema = z.object({
  items: z.array(z.object({ media: mediaSchema, accountId: accountIdSchema }).strict()).min(1).max(500),
  toUserId: z.string().uuid(),
  include: z.object({
    workItems: z.boolean(),
    dispatches: z.boolean(),
    starred: z.boolean(),
  }).strict(),
  note: z.string().max(4096).nullable().optional(),
}).strict().superRefine((request, context) => {
  const keys = request.items.map((item) => `${item.media}:${item.accountId}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", message: "items must be unique", path: ["items"] });
  }
});
export type AccountTransferRequest = z.infer<typeof accountTransferRequestSchema>;

export const accountTransferResultSchema = z.object({
  transferId: z.string().uuid(),
  moved: z.object({
    accounts: z.number().int().nonnegative(),
    workItems: z.number().int().nonnegative(),
    /** `dispatches` 表要 migration 014（Codex）；表不在时恒 0，并在 skipped 里说明。 */
    dispatches: z.number().int().nonnegative(),
  }).strict(),
  notifiedUserIds: z.array(z.string().uuid()),
  /** 没能交接的账户与原因；**不静默跳过**，调用方要能看到哪几户没动。 */
  skipped: z.array(z.object({
    media: mediaSchema,
    accountId: accountIdSchema,
    reason: z.enum(["not_granted", "blocked_by_changeset", "already_owned"]),
  }).strict()),
}).strict();
export type AccountTransferResult = z.infer<typeof accountTransferResultSchema>;

/**
 * 交接是「改归属」，按老板 v1.8 那条铁律必须留痕且可回查：
 * 原 grant **置 `revoked_at` 不删行**，新 grant 另起一行——
 * 删行会让「这个户以前归谁」永久消失。
 */
export const TRANSFER_BLOCKED_BY_CHANGESET = "TRANSFER_BLOCKED_BY_CHANGESET";
