import { z } from "zod";

const fallbackReasonSchema = z.enum(["invalid_output", "timeout", "capability_missing"]);
const evidenceSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(200),
    displayValue: z.string().trim().min(1).max(500),
  })
  .strict();
const findingSchema = z
  .object({
    severity: z.enum(["info", "warning", "critical"]),
    title: z.string().trim().min(1).max(200),
    observation: z.string().trim().min(1).max(1_000),
    evidenceRefs: z.array(z.string().trim().min(1)).max(20),
  })
  .strict();
const actionCommon = {
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(1_000),
  targetKey: z.string().trim().min(1).max(300).optional(),
  evidenceRefs: z.array(z.string().trim().min(1)).max(20),
};
const investigateActionSchema = z
  .object({
    kind: z.literal("investigate"),
    ...actionCommon,
    blockedReason: z
      .enum([
        "bid_change_exceeds_20pct",
        "budget_change_exceeds_50pct",
        "recent_execution_failure",
      ])
      .optional(),
  })
  .strict();
const monitorActionSchema = z.object({ kind: z.literal("monitor"), ...actionCommon }).strict();
const changeActionSchema = z
  .object({
    kind: z.enum(["adjust_bid", "adjust_budget"]),
    ...actionCommon,
    targetKey: z.string().trim().min(1).max(300),
    currentValue: z.number().finite().nonnegative(),
    proposedValue: z.number().finite().nonnegative(),
  })
  .strict();
const actionSchema = z.union([investigateActionSchema, monitorActionSchema, changeActionSchema]);

export const agentDiagnosisSchema = z
  .object({
    status: z.enum(["ok", "insufficient_data", "fallback"]),
    headline: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    confidence: z.number().finite().min(0).max(1),
    dataCutoffAt: z.string().datetime({ offset: true }),
    evidence: z.array(evidenceSchema).max(50),
    findings: z.array(findingSchema).max(30),
    actions: z.array(actionSchema).max(30),
    fallbackReason: fallbackReasonSchema.optional(),
  })
  .strict()
  .superRefine(validateDiagnosisRelationships);

export type AgentDiagnosis = z.infer<typeof agentDiagnosisSchema>;
export type AgentDiagnosisAction = AgentDiagnosis["actions"][number];
export type DiagnosisFallbackReason = z.infer<typeof fallbackReasonSchema>;

export function parseAgentDiagnosis(input: unknown): AgentDiagnosis {
  return agentDiagnosisSchema.parse(input);
}

export function agentDiagnosisJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(agentDiagnosisSchema) as Record<string, unknown>;
}

export function applyDiagnosisSafety(
  diagnosis: AgentDiagnosis,
  context: { recentlyFailedTargetKeys: readonly string[] },
): AgentDiagnosis {
  const recentlyFailed = new Set(context.recentlyFailedTargetKeys);
  const actions = diagnosis.actions.map((action): AgentDiagnosisAction => {
    if (action.kind !== "adjust_bid" && action.kind !== "adjust_budget") return action;
    if (recentlyFailed.has(action.targetKey)) {
      return downgradeAction(action, "recent_execution_failure");
    }
    const changeRatio = relativeChange(action.currentValue, action.proposedValue);
    if (action.kind === "adjust_bid" && changeRatio > 0.2) {
      return downgradeAction(action, "bid_change_exceeds_20pct");
    }
    if (action.kind === "adjust_budget" && changeRatio > 0.5) {
      return downgradeAction(action, "budget_change_exceeds_50pct");
    }
    return action;
  });
  return parseAgentDiagnosis({ ...diagnosis, actions });
}

export function buildFallbackDiagnosis(input: {
  reason: DiagnosisFallbackReason;
  dataCutoffAt: string;
}): AgentDiagnosis {
  return parseAgentDiagnosis({
    status: "fallback",
    headline: "本次诊断未生成模型结论",
    summary: "系统已转为规则兜底，未产生账户调整建议。",
    confidence: 0,
    dataCutoffAt: input.dataCutoffAt,
    evidence: [],
    findings: [],
    actions: [],
    fallbackReason: input.reason,
  });
}

export function renderDiagnosisMarkdown(diagnosis: AgentDiagnosis): string {
  const lines = [`# ${escapeMarkdown(diagnosis.headline)}`, "", escapeMarkdown(diagnosis.summary)];
  lines.push("", `数据截至：${escapeMarkdown(diagnosis.dataCutoffAt)}`);
  if (diagnosis.fallbackReason !== undefined) {
    lines.push(`兜底原因：${escapeMarkdown(diagnosis.fallbackReason)}`);
  }
  if (diagnosis.evidence.length > 0) {
    lines.push("", "## 证据");
    diagnosis.evidence.forEach((item) => {
      lines.push(`- ${escapeMarkdown(item.label)}：${escapeMarkdown(item.displayValue)}`);
    });
  }
  if (diagnosis.findings.length > 0) {
    lines.push("", "## 发现");
    diagnosis.findings.forEach((finding) => {
      lines.push(`- **${escapeMarkdown(finding.title)}**：${escapeMarkdown(finding.observation)}`);
    });
  }
  lines.push("", "## 建议");
  if (diagnosis.actions.length === 0) {
    lines.push("- 暂无可安全执行的调整建议。");
  } else {
    diagnosis.actions.forEach((action) => {
      lines.push(`- **${escapeMarkdown(action.title)}**：${escapeMarkdown(action.reason)}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

function validateDiagnosisRelationships(
  diagnosis: {
    status: "ok" | "insufficient_data" | "fallback";
    confidence: number;
    fallbackReason?: DiagnosisFallbackReason | undefined;
    evidence: Array<{ id: string }>;
    findings: Array<{ evidenceRefs: string[] }>;
    actions: Array<{ kind: string; evidenceRefs: string[] }>;
  },
  context: z.RefinementCtx,
): void {
  if (diagnosis.status === "fallback" && diagnosis.fallbackReason === undefined) {
    context.addIssue({ code: "custom", message: "fallback status requires fallbackReason" });
  }
  if (diagnosis.status !== "fallback" && diagnosis.fallbackReason !== undefined) {
    context.addIssue({ code: "custom", message: "fallbackReason requires fallback status" });
  }
  const ids = new Set<string>();
  diagnosis.evidence.forEach((evidence, index) => {
    if (ids.has(evidence.id)) {
      context.addIssue({ code: "custom", message: "Duplicate evidence id", path: ["evidence", index, "id"] });
    }
    ids.add(evidence.id);
  });
  [...diagnosis.findings, ...diagnosis.actions].forEach((item) => {
    item.evidenceRefs.forEach((reference) => {
      if (!ids.has(reference)) {
        context.addIssue({ code: "custom", message: `Unknown evidence reference: ${reference}` });
      }
    });
  });
  diagnosis.actions.forEach((action, index) => {
    if (action.kind !== "adjust_bid" && action.kind !== "adjust_budget") return;
    if (diagnosis.status !== "ok") {
      context.addIssue({
        code: "custom",
        message: "Adjustment actions require an ok diagnosis",
        path: ["actions", index],
      });
    }
    if (diagnosis.confidence === 0) {
      context.addIssue({
        code: "custom",
        message: "Adjustment actions require non-zero confidence",
        path: ["actions", index],
      });
    }
    if (action.evidenceRefs.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Adjustment actions require evidence",
        path: ["actions", index, "evidenceRefs"],
      });
    }
  });
}

function relativeChange(currentValue: number, proposedValue: number): number {
  if (currentValue === 0) return proposedValue === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(proposedValue - currentValue) / currentValue;
}

function downgradeAction(
  action: Extract<AgentDiagnosisAction, { kind: "adjust_bid" | "adjust_budget" }>,
  blockedReason: Extract<AgentDiagnosisAction, { kind: "investigate" }>["blockedReason"],
): AgentDiagnosisAction {
  return {
    kind: "investigate",
    title: action.title,
    reason: action.reason,
    targetKey: action.targetKey,
    evidenceRefs: action.evidenceRefs,
    blockedReason,
  };
}

function escapeMarkdown(value: string): string {
  const special = new Set("\\`*_{}[]()#|>".split(""));
  return [...value].map((character) => (special.has(character) ? `\\${character}` : character)).join("");
}
