import { describe, expect, it } from "vitest";

import {
  parseReportExecutionPlan,
  type ReportDataset,
  type ReportExecutionPlan,
  type ReportFactsBundle,
} from "@ka/domain";

import {
  ReportGenerationError,
  ReportGenerationHandler,
} from "../../src/reports/report-generation-handler.js";
import type {
  ReportArtifactInput,
  ReportArtifactSink,
  ReportPlanSource,
  ReportRunFailure,
  ReportRunLog,
  ReportRunSuccess,
} from "../../src/reports/types.js";

function validPlan(): ReportExecutionPlan {
  return parseReportExecutionPlan({
    version: "b6-internal-v1",
    title: "Worker 报表",
    scope: { dateFrom: "2026-08-18", dateTo: "2026-08-19" },
    components: [{ id: "cost", title: "消耗", kind: "kpi", metric: "cost" }],
  });
}

function facts(workspaceId = "workspace-1"): ReportFactsBundle {
  return {
    workspaceId,
    dataCutoffAt: "2026-08-19T10:30:00.000Z",
    summary: { cost: { value: 100, state: "finite" } },
    trend: null,
    dimensions: {},
  };
}

class MemoryPlanSource implements ReportPlanSource {
  workspaceId = "workspace-1";
  plan: unknown = validPlan();
  failure: Error | null = null;

  async load() {
    if (this.failure !== null) throw this.failure;
    return { workspaceId: this.workspaceId, plan: this.plan };
  }
}

class MemoryArtifacts implements ReportArtifactSink {
  readonly artifacts = new Map<string, ReportDataset>();
  failure: Error | null = null;

  async saveOnce(input: ReportArtifactInput): Promise<"saved" | "duplicate"> {
    if (this.failure !== null) throw this.failure;
    if (this.artifacts.has(input.idempotencyKey)) return "duplicate";
    this.artifacts.set(input.idempotencyKey, input.dataset);
    return "saved";
  }
}

class MemoryRunLog implements ReportRunLog {
  readonly successes: ReportRunSuccess[] = [];
  readonly failures: ReportRunFailure[] = [];

  async succeeded(input: ReportRunSuccess): Promise<void> {
    this.successes.push(input);
  }

  async failed(input: ReportRunFailure): Promise<void> {
    this.failures.push(input);
  }
}

function setup() {
  const plans = new MemoryPlanSource();
  const artifacts = new MemoryArtifacts();
  const log = new MemoryRunLog();
  let loadedFacts = facts();
  let factsFailure: Error | null = null;
  const handler = new ReportGenerationHandler({
    plans,
    facts: {
      load: async () => {
        if (factsFailure !== null) throw factsFailure;
        return loadedFacts;
      },
    },
    artifacts,
    log,
  });
  return {
    handler,
    plans,
    artifacts,
    log,
    setFacts: (value: ReportFactsBundle) => {
      loadedFacts = value;
    },
    setFactsFailure: (value: Error) => {
      factsFailure = value;
    },
  };
}

const request = {
  workspaceId: "workspace-1",
  reportId: "report-1",
  requestedBy: "user-1",
  asOf: "2026-08-19T10:30:00.000Z",
};

describe("ReportGenerationHandler", () => {
  it("generates once and returns duplicate on an identical retry", async () => {
    const context = setup();
    const first = await context.handler.run(request);
    const retry = await context.handler.run(request);

    expect(first).toMatchObject({ status: "generated", componentCount: 1, missingComponentCount: 0 });
    expect(retry).toMatchObject({ status: "duplicate", idempotencyKey: first.idempotencyKey });
    expect(first.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(context.artifacts.artifacts).toHaveLength(1);
    expect(context.log.successes.map((entry) => entry.status)).toEqual(["generated", "duplicate"]);
  });

  it("derives a stable key from workspace, report, plan and asOf", async () => {
    const left = setup();
    const right = setup();
    const leftResult = await left.handler.run(request);
    const sameResult = await right.handler.run(request);
    const changed = await setup().handler.run({ ...request, asOf: "2026-08-19T11:00:00.000Z" });

    expect(leftResult.idempotencyKey).toBe(sameResult.idempotencyKey);
    expect(leftResult.idempotencyKey).not.toBe(changed.idempotencyKey);
  });

  it("rejects malformed Agent plans without logging their raw content", async () => {
    const context = setup();
    context.plans.plan = { ...validPlan(), sql: "SELECT secret_token FROM credentials" };

    await expect(context.handler.run(request)).rejects.toMatchObject({
      code: "INVALID_REPORT_PLAN",
    });
    expect(context.log.failures).toEqual([
      expect.objectContaining({ code: "INVALID_REPORT_PLAN", message: "Report plan validation failed" }),
    ]);
    expect(JSON.stringify(context.log.failures)).not.toContain("secret_token");
  });

  it("fails closed when plan ownership or returned facts cross workspaces", async () => {
    const planLeak = setup();
    planLeak.plans.workspaceId = "workspace-other";
    await expect(planLeak.handler.run(request)).rejects.toMatchObject({
      code: "REPORT_SCOPE_VIOLATION",
    });

    const factLeak = setup();
    factLeak.setFacts(facts("workspace-other"));
    await expect(factLeak.handler.run(request)).rejects.toMatchObject({
      code: "REPORT_SCOPE_VIOLATION",
    });
  });

  it("maps plan and fact source failures to stable safe errors", async () => {
    const planFailure = setup();
    planFailure.plans.failure = new Error("mul_secret_should_not_escape");
    await expect(planFailure.handler.run(request)).rejects.toMatchObject({
      code: "REPORT_PLAN_SOURCE_FAILED",
    });
    expect(JSON.stringify(planFailure.log.failures)).not.toContain("mul_secret");

    const factFailure = setup();
    factFailure.setFactsFailure(new Error("provider_key_should_not_escape"));
    await expect(factFailure.handler.run(request)).rejects.toMatchObject({
      code: "REPORT_FACTS_SOURCE_FAILED",
    });
    expect(JSON.stringify(factFailure.log.failures)).not.toContain("provider_key");
  });

  it("does not report success when artifact persistence fails", async () => {
    const context = setup();
    context.artifacts.failure = new Error("storage details");

    await expect(context.handler.run(request)).rejects.toBeInstanceOf(ReportGenerationError);
    await expect(context.handler.run(request)).rejects.toMatchObject({
      code: "REPORT_ARTIFACT_FAILED",
    });
    expect(context.log.successes).toEqual([]);
    expect(context.log.failures.at(-1)).toMatchObject({
      code: "REPORT_ARTIFACT_FAILED",
      message: "Report artifact persistence failed",
    });
  });
});
