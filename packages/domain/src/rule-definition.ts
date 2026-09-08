import { z } from "zod";
import { approvedAccountAccessSchema } from "./auth-context.js";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { alertRuleScopeSchema } from "./r014/task-bindings-contract.js";

const ruleId = z.string().regex(/^[1-9][0-9]{0,18}$/)
  .refine(value => value.length < 19 || value <= "9223372036854775807");

/** Internal lookup target, not a new public explain response or browser scope. */
export const ruleDefinitionTargetSchema = z.object({
  ruleId,
  media: approvedAccountAccessSchema.shape.media,
  accountId: approvedAccountAccessSchema.shape.accountId,
  ds: calendarDateSchema,
}).strict();
export type RuleDefinitionTarget = z.infer<typeof ruleDefinitionTargetSchema>;

/** Exact SQL projection. A null legacy AST remains unavailable, never invented. */
export const ruleDefinitionRecordSchema = z.object({
  id: ruleId,
  workspace_id: z.string().uuid(),
  enabled: z.boolean(),
  scope: alertRuleScopeSchema.refine(scope => scope.taskIds.length <= 1000 &&
    scope.accountScopes.length <= 1000 && scope.bizNames.length <= 1000),
  condition_tree: z.unknown().refine(value => value !== undefined),
  availability_policy: z.enum(["suppress", "evaluate_available_only"]),
  data_freshness_max_hours: z.number().int().positive().max(2147483647).nullable(),
  fallback_copy: z.string().max(4096).nullable(),
}).strict();
export type RuleDefinitionRecord = z.infer<typeof ruleDefinitionRecordSchema>;
