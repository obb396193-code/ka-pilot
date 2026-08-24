import {
  agentDiagnosisJsonSchema,
  applyDiagnosisSafety,
  buildFallbackDiagnosis,
  parseAgentDiagnosis,
  renderDiagnosisMarkdown,
  type AgentDiagnosis,
  type DiagnosisFallbackReason,
} from "@ka/domain";

import type { AssembledAgentContext } from "./context-assembler.js";
import type { ClaudeAgentRuntimeResult } from "./sdk/runtime.js";

export interface FinalizedDiagnosis {
  diagnosis: AgentDiagnosis;
  markdown: string;
  summary: string;
  usedFallback: boolean;
  assistantContent: Record<string, unknown>;
}

export class AgentDiagnosisService {
  outputJsonSchema(): Record<string, unknown> {
    return agentDiagnosisJsonSchema();
  }

  finalize(input: {
    runtimeResult: ClaudeAgentRuntimeResult;
    context: AssembledAgentContext;
    recentlyFailedTargetKeys: readonly string[];
  }): FinalizedDiagnosis {
    if (input.runtimeResult.outcome === "error") {
      return this.fallback(
        input.runtimeResult.code === "timeout" ? "timeout" : "invalid_output",
        input.context,
      );
    }
    try {
      const parsed = parseAgentDiagnosis(input.runtimeResult.structuredOutput);
      const anchored = anchorEvidence(parsed, input.context);
      return finalizeDiagnosis(
        applyDiagnosisSafety(anchored, {
          recentlyFailedTargetKeys: input.recentlyFailedTargetKeys,
        }),
        false,
      );
    } catch {
      return this.fallback("invalid_output", input.context);
    }
  }

  fallback(
    reason: DiagnosisFallbackReason,
    context: AssembledAgentContext,
  ): FinalizedDiagnosis {
    return finalizeDiagnosis(
      buildFallbackDiagnosis({ reason, dataCutoffAt: context.dataCutoffAt }),
      true,
    );
  }
}

function anchorEvidence(
  diagnosis: AgentDiagnosis,
  context: AssembledAgentContext,
): AgentDiagnosis {
  const available = new Map(
    context.objects.flatMap((object) => object.facts).map((fact) => [fact.evidenceId, fact]),
  );
  const evidence = diagnosis.evidence.map((item) => {
    const source = available.get(item.id);
    if (source === undefined) throw new Error(`Diagnosis cited unknown evidence: ${item.id}`);
    return {
      id: item.id,
      label: source.label,
      displayValue: source.displayValue,
    };
  });
  return parseAgentDiagnosis({
    ...diagnosis,
    dataCutoffAt: context.dataCutoffAt,
    evidence,
  });
}

function finalizeDiagnosis(
  diagnosis: AgentDiagnosis,
  usedFallback: boolean,
): FinalizedDiagnosis {
  const markdown = renderDiagnosisMarkdown(diagnosis);
  const summary = usedFallback
    ? `diagnosis_fallback_${diagnosis.fallbackReason ?? "invalid_output"}`
    : "diagnosis_completed";
  return {
    diagnosis,
    markdown,
    summary,
    usedFallback,
    assistantContent: {
      kind: "diagnosis",
      diagnosis,
      markdown,
    },
  };
}
