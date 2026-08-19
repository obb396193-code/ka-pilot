import type {
  ReportDataset,
  ReportExecutionPlan,
  ReportFactsBundle,
} from "@ka/domain";

export interface ReportGenerationInput {
  workspaceId: string;
  reportId: string;
  requestedBy: string;
  asOf: string;
}

export interface ReportPlanRecord {
  workspaceId: string;
  plan: unknown;
}

export interface ReportPlanSource {
  load(input: Pick<ReportGenerationInput, "workspaceId" | "reportId" | "requestedBy">): Promise<ReportPlanRecord>;
}

export interface ReportFactsSource {
  load(input: {
    workspaceId: string;
    plan: ReportExecutionPlan;
  }): Promise<ReportFactsBundle>;
}

export interface ReportArtifactInput extends ReportGenerationInput {
  idempotencyKey: string;
  planFingerprint: string;
  dataset: ReportDataset;
}

export interface ReportArtifactSink {
  saveOnce(input: ReportArtifactInput): Promise<"saved" | "duplicate">;
}

export type ReportFailureCode =
  | "INVALID_REPORT_REQUEST"
  | "REPORT_PLAN_SOURCE_FAILED"
  | "INVALID_REPORT_PLAN"
  | "REPORT_SCOPE_VIOLATION"
  | "REPORT_FACTS_SOURCE_FAILED"
  | "REPORT_ASSEMBLY_FAILED"
  | "REPORT_ARTIFACT_FAILED";

export interface ReportRunSuccess extends ReportGenerationInput {
  idempotencyKey: string;
  status: "generated" | "duplicate";
  componentCount: number;
  missingComponentCount: number;
}

export interface ReportRunFailure extends ReportGenerationInput {
  code: ReportFailureCode;
  message: string;
}

export interface ReportRunLog {
  succeeded(input: ReportRunSuccess): Promise<void>;
  failed(input: ReportRunFailure): Promise<void>;
}

export interface ReportGenerationDependencies {
  plans: ReportPlanSource;
  facts: ReportFactsSource;
  artifacts: ReportArtifactSink;
  log: ReportRunLog;
}

export interface ReportGenerationResult {
  status: "generated" | "duplicate";
  idempotencyKey: string;
  componentCount: number;
  missingComponentCount: number;
}
