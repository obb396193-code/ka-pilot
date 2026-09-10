import { z } from "zod";
import { dataQueryRequestSchema } from "@ka/domain";

// Syntax adapter only. Registry remains the single owner of capabilities,
// parameter validation, date limits and account selectors for both endpoints.
const legacySchema = z.object({
  query_type: z.enum(["summary", "dimension", "health", "tier", "trend", "table"]),
  date: z.unknown().optional(), date_from: z.unknown().optional(), date_to: z.unknown().optional(),
  compare: z.unknown().optional(), preset: z.unknown().optional(), dimension_type: z.unknown().optional(),
  page: z.unknown().optional(), page_size: z.unknown().optional(), columns: z.unknown().optional(),
  filters: z.object({ media: z.unknown().optional(), account_id: z.unknown().optional(),
    task_id: z.unknown().optional(), owner: z.unknown().optional(), optimizer: z.unknown().optional(),
    biz: z.unknown().optional(), goal: z.unknown().optional(), resource_position: z.unknown().optional() }).strict().optional(),
}).strict();

export const semanticQueryRequestSchema = z.preprocess((input, context) => {
  if (typeof input !== "object" || input === null || !Object.hasOwn(input, "query_type")) return input;
  const parsed = legacySchema.safeParse(input);
  if (!parsed.success) {
    context.addIssue({ code: "custom", message: "Invalid semantic query request" });
    return z.NEVER;
  }
  const value = parsed.data, params: Record<string, unknown> = {};
  const keys = { date: "date", date_from: "date_from", date_to: "date_to", compare: "compare", preset: "preset",
    dimension_type: "dimensionType", page: "page", page_size: "pageSize", columns: "columns" } as const;
  for (const [from, to] of Object.entries(keys)) {
    if (Object.hasOwn(value, from)) params[to] = value[from as keyof typeof keys];
  }
  const filters = value.filters;
  if (filters !== undefined) {
    if (Object.hasOwn(filters, "media")) params.media = filters.media;
    if (Object.hasOwn(filters, "account_id")) params.accountIds = [filters.account_id];
    // Not silently dropped: until these capabilities are registered, the same
    // strict Registry rejects them rather than returning a broader result.
    const dashboard: Record<string, unknown> = {};
    if (Object.hasOwn(filters, "task_id")) {
      if (Array.isArray(filters.task_id)) dashboard.task_id = filters.task_id;
      else params.taskId = filters.task_id;
    }
    for (const key of ["optimizer", "biz", "goal", "resource_position"] as const) if (Object.hasOwn(filters, key)) dashboard[key] = filters[key];
    if (Object.keys(dashboard).length) params.filters = dashboard;
    if (Object.hasOwn(filters, "owner")) params.owner = filters.owner;
  }
  return { queryId: `account.${value.query_type}`, params };
}, dataQueryRequestSchema);
