import { z } from "zod";

import { DEFAULT_MAX_QIHANG_IDS_PER_QUERY } from "../qihang/client.js";

const workspace = z.object({
  workspaceId: z.string().uuid(),
  backfillId: z.number().int().positive(),
  userId: z.string().trim().min(1),
  fetchedByUserId: z.string().uuid(),
});

export const backfillCoordinatorPayloadSchema = workspace.extend({
  accountIds: z
    .array(z.string().trim().min(1))
    .max(DEFAULT_MAX_QIHANG_IDS_PER_QUERY)
    .optional(),
  media: z.string().trim().min(1).default("KUAISHOU"),
  pageSize: z.number().int().min(1).max(500).default(50),
});

export const backfillDayPayloadSchema = workspace.extend({
  ds: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(DEFAULT_MAX_QIHANG_IDS_PER_QUERY),
  media: z.string().trim().min(1).default("KUAISHOU"),
});
