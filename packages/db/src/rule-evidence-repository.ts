import type { Pool } from "pg";
import {
  approvedWorkspaceAuthContextSchema, queryWindowSchema, ruleDefinitionTargetSchema,
  planRuleDailyEvidence, evaluateRuleDailyEvidence, RuleDailyEvidenceError,
} from "@ka/domain";
import { readRuleDefinitionInSnapshot, RuleDefinitionReadError } from "./rule-definition-repository.js";
import { readPlatformPivotInSnapshot, PlatformPivotContractError } from "./platform-pivot-repository.js";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

type ErrorCode = "FORBIDDEN" | "INVALID_INPUT" | "INVALID_DEFINITION" | "ACCOUNT_NOT_FOUND" |
  "SOURCE_UNAVAILABLE" | "TEAM_SOURCE_UNAVAILABLE" | "HOURLY_SOURCE_REQUIRED" | "WINDOW_UNSUPPORTED" | "INVALID_EVIDENCE";
export class RuleEvidenceReadError extends Error {
  constructor(readonly code: ErrorCode) { super(`Rule evidence read failed: ${code}`); this.name = "RuleEvidenceReadError"; }
}

/** Server-only observation, not a public explain or trigger result. No freshness/
 * initial-full/mute decision is inferred from transformation timestamps. */
export class RuleEvidenceRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async read(authInput: unknown, targetInput: unknown, windowInput: unknown) {
    const authResult = approvedWorkspaceAuthContextSchema.safeParse(authInput);
    if (!authResult.success) throw new RuleEvidenceReadError("FORBIDDEN");
    const targetResult = ruleDefinitionTargetSchema.safeParse(targetInput), windowResult = queryWindowSchema.safeParse(windowInput);
    if (!targetResult.success || !windowResult.success || windowResult.data.to !== targetResult.data.ds) throw new RuleEvidenceReadError("INVALID_INPUT");
    const auth = authResult.data, target = targetResult.data, window = windowResult.data;
    if (auth.workspaceKind === "team") throw new RuleEvidenceReadError("TEAM_SOURCE_UNAVAILABLE");
    const account = auth.scope.accounts.find(a => a.media === target.media && a.accountId === target.accountId);
    if (!account) throw new RuleEvidenceReadError("FORBIDDEN");
    // Capability narrowing, never widening or using a request-provided account list.
    const scoped = { ...auth, scope: { ...auth.scope, accounts: [account] } };
    try {
      return await withSemanticReadSnapshot(this.pool, async connection => {
        const rule = await readRuleDefinitionInSnapshot(connection, scoped, target);
        if (rule === null) return null;
        const unavailableReason = !rule.applicable ? "OUTSIDE_RULE_SCOPE" : !rule.definition.enabled ? "DISABLED" :
          rule.definition.condition_tree === null ? "LEGACY_TREE_UNAVAILABLE" : null;
        if (unavailableReason !== null) return { ...rule, unavailableReason, evaluation: null, evidence: null };
        const plan = planRuleDailyEvidence(rule.definition.condition_tree, window);
        const evidence = await readPlatformPivotInSnapshot(connection, scoped, plan.window);
        const rows = evidence.members.map(member => ({ ds: member.assessment.ds, metrics: member.metrics, assessment: member.assessment }));
        let evaluation;
        try { evaluation = evaluateRuleDailyEvidence(rule.definition.condition_tree, window, rows); }
        catch { throw new RuleEvidenceReadError("INVALID_EVIDENCE"); }
        return { ...rule, unavailableReason: null, evaluation, evidence };
      });
    } catch (error) {
      if (error instanceof RuleEvidenceReadError) throw error;
      if (error instanceof RuleDefinitionReadError || error instanceof RuleDailyEvidenceError) throw new RuleEvidenceReadError(error.code);
      if (error instanceof PlatformPivotContractError) throw new RuleEvidenceReadError("INVALID_EVIDENCE");
      throw new RuleEvidenceReadError("SOURCE_UNAVAILABLE");
    }
  }
}
