import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const common = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().trim().min(1),
  media: z.string().trim().min(1).default("KUAISHOU"),
  accountIds: z.array(z.string().trim().min(1)).default([]),
  fetchedByUserId: z.string().uuid().nullable().default(null),
});

export const fullEtlPayloadSchema = common.extend({
  asOfDate: z.string().regex(isoDate),
  pageSize: z.number().int().min(1).max(500).default(50),
  realtimeDays: z.number().int().min(1).max(31).default(7),
  keyword: z.string().optional(),
  bizName: z.string().optional(),
});

export const incrementalEtlPayloadSchema = common.extend({
  ds: z.string().regex(isoDate),
  focusAccountIds: z.array(z.string().trim().min(1)).default([]),
  adIds: z.array(z.string().trim().min(1)).default([]),
  hh: z.number().int().min(0).max(23).optional(),
});

export type FullEtlPayload = z.infer<typeof fullEtlPayloadSchema>;
export type IncrementalEtlPayload = z.infer<typeof incrementalEtlPayloadSchema>;
