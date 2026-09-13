import { z } from "zod";

// Internal storage/worker contract, never a public API or browser auth context.
export const outboundWorkspaceSchema = z.uuid();
export const outboundMaintenanceLimitSchema = z.object({ maintenanceLimit: z.literal(true) }).strict();
const keySchema = z.string().regex(/^outbound:v1:[a-f0-9]{64}$/);
export const durableOutboundClaimSchema = z.object({ id: z.uuid(), workspaceId: z.uuid(), channel: z.literal("dingtalk"),
  leaseToken: z.uuid(), target: z.string().min(1).max(2048), kind: z.string().min(1).max(2048),
  payload: z.record(z.string(), z.unknown()), dedupeKey: keySchema,
  attempts: z.number().int().min(1).max(5), consecutiveUnknown: z.number().int().min(0).max(1), sentAt: z.null(),
}).strict().refine(value => value.consecutiveUnknown < value.attempts);
export type DurableOutboundClaim = z.infer<typeof durableOutboundClaimSchema>;
export const outboundStoredRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), channel: z.literal("dingtalk"),
  target: z.string().min(1).max(2048), kind: z.string().min(1).max(2048), payload: z.record(z.string(), z.unknown()),
  created_at: z.date(), status: z.string(), attempts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  consecutive_unknown: z.number().int().min(0).max(2), dedupe_key: keySchema.nullable(),
  sent_at: z.date().nullable(), db_now: z.date(), job_date: z.unknown(), run_date: z.unknown(),
});
export type OutboundStoredRow = z.infer<typeof outboundStoredRowSchema>;
export const outboundDeliveryContextSchema=z.object({workspaceId:z.uuid(),messageId:z.uuid(),workspaceName:z.string().min(1).max(256),
  businessDate:z.iso.date(),media:z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/).nullable(),runId:z.string().regex(/^[1-9][0-9]{0,18}$/).nullable(),
  step:z.string().max(128).nullable(),
}).strict();
export type OutboundDeliveryContext=z.infer<typeof outboundDeliveryContextSchema>;
export const outboundStaffIdSchema=z.string().min(1).max(256).refine(v=>!Array.from(v).some(c=>c.charCodeAt(0)<=32||c.charCodeAt(0)===127));
