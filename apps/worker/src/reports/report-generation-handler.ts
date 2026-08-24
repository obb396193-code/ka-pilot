import { createHash } from "node:crypto";

import {
  assembleReportDataset,
  fingerprintReportExecutionPlan,
  parseReportExecutionPlan,
} from "@ka/domain";

import type {
  ReportFailureCode,
  ReportGenerationDependencies,
  ReportGenerationInput,
  ReportGenerationResult,
} from "./types.js";

const SAFE_FAILURE_MESSAGES: Record<ReportFailureCode, string> = {
  INVALID_REPORT_REQUEST: "Report generation request validation failed",
  REPORT_PLAN_SOURCE_FAILED: "Report plan source failed",
  INVALID_REPORT_PLAN: "Report plan validation failed",
  REPORT_SCOPE_VIOLATION: "Report workspace scope validation failed",
  REPORT_FACTS_SOURCE_FAILED: "Report facts source failed",
  REPORT_ASSEMBLY_FAILED: "Report dataset assembly failed",
  REPORT_ARTIFACT_FAILED: "Report artifact persistence failed",
};

export class ReportGenerationError extends Error {
  constructor(readonly code: ReportFailureCode) {
    super(SAFE_FAILURE_MESSAGES[code]);
    this.name = "ReportGenerationError";
  }
}

function safeIdentity(value: string): string {
  const normalized = value.trim();
  if (normalized === "" || normalized.length > 128) {
    throw new ReportGenerationError("INVALID_REPORT_REQUEST");
  }
  if (
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new ReportGenerationError("INVALID_REPORT_REQUEST");
  }
  return normalized;
}

function normalizeInput(input: ReportGenerationInput): ReportGenerationInput {
  const timestamp = Date.parse(input.asOf);
  if (!Number.isFinite(timestamp)) throw new ReportGenerationError("INVALID_REPORT_REQUEST");
  return {
    workspaceId: safeIdentity(input.workspaceId),
    reportId: safeIdentity(input.reportId),
    requestedBy: safeIdentity(input.requestedBy),
    asOf: new Date(timestamp).toISOString(),
  };
}

function idempotencyKey(
  input: ReportGenerationInput,
  planFingerprint: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "b6-report-generation-v1",
        input.workspaceId,
        input.reportId,
        planFingerprint,
        input.asOf,
      ]),
    )
    .digest("hex");
}

export class ReportGenerationHandler {
  constructor(private readonly dependencies: ReportGenerationDependencies) {}

  private async fail(
    input: ReportGenerationInput,
    code: ReportFailureCode,
  ): Promise<never> {
    try {
      await this.dependencies.log.failed({
        ...input,
        code,
        message: SAFE_FAILURE_MESSAGES[code],
      });
    } catch {
      // The stable business error must not be replaced by a secondary logging failure.
    }
    throw new ReportGenerationError(code);
  }

  async run(untrustedInput: ReportGenerationInput): Promise<ReportGenerationResult> {
    const input = normalizeInput(untrustedInput);
    let planRecord;
    try {
      planRecord = await this.dependencies.plans.load(input);
    } catch {
      return this.fail(input, "REPORT_PLAN_SOURCE_FAILED");
    }
    if (planRecord.workspaceId !== input.workspaceId) {
      return this.fail(input, "REPORT_SCOPE_VIOLATION");
    }

    let plan;
    try {
      plan = parseReportExecutionPlan(planRecord.plan);
    } catch {
      return this.fail(input, "INVALID_REPORT_PLAN");
    }
    const planFingerprint = fingerprintReportExecutionPlan(plan);

    let facts;
    try {
      facts = await this.dependencies.facts.load({ workspaceId: input.workspaceId, plan });
    } catch {
      return this.fail(input, "REPORT_FACTS_SOURCE_FAILED");
    }
    if (facts.workspaceId !== input.workspaceId) {
      return this.fail(input, "REPORT_SCOPE_VIOLATION");
    }

    let dataset;
    try {
      dataset = assembleReportDataset(plan, facts);
    } catch {
      return this.fail(input, "REPORT_ASSEMBLY_FAILED");
    }
    const key = idempotencyKey(input, planFingerprint);

    let disposition;
    try {
      disposition = await this.dependencies.artifacts.saveOnce({
        ...input,
        idempotencyKey: key,
        planFingerprint,
        dataset,
      });
    } catch {
      return this.fail(input, "REPORT_ARTIFACT_FAILED");
    }

    const result: ReportGenerationResult = {
      status: disposition === "saved" ? "generated" : "duplicate",
      idempotencyKey: key,
      componentCount: dataset.components.length,
      missingComponentCount: dataset.components.filter(
        (component) => component.status === "missing",
      ).length,
    };
    await this.dependencies.log.succeeded({ ...input, ...result });
    return result;
  }
}
