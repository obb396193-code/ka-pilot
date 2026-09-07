import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  describeExternalChange, externalChangeSchema, toTimelineItem, type ExternalChange,
} from "../../src/r014/external-change-contract.js";
import { dailyBriefSchema, reportRunSchema } from "../../src/r014/report-run-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

const CHANGE: ExternalChange = {
  id: "41", media: "KUAISHOU", accountId: "account-1",
  targetType: "campaign", targetId: "c-1", field: "budget",
  fromValue: 8000, toValue: 10000,
  detectedAt: "2026-09-04T14:10:00.000+08:00", syncRunId: null, linkedWorkItemId: null,
};

describe("v1.5 1.8 daily brief", () => {
  it("parses both frozen fixtures", () => {
    expect(dailyBriefSchema.parse(fixture("reports/daily-brief.json").data).status).toBe("ready");
    const pending = dailyBriefSchema.parse(fixture("reports/daily-brief-pending.json").data);
    expect(pending).toMatchObject({ status: "pending_data", generatedAt: null, dataAsOf: null, queueSummary: null, sections: [] });
    expect(pending.reason).toBe("etl_full 未完成");
  });

  it("refuses a pending brief that looks generated — no fake morning report", () => {
    const pending = fixture("reports/daily-brief-pending.json").data as Record<string, unknown>;
    for (const forged of [
      { generatedAt: "2026-09-05T03:40:00.000+08:00" },
      { sections: [{ key: "summary" }] },
      { queueSummary: { p0: 0, p1: 0, opportunity: 0, coverage: {} } },
    ]) {
      expect(() => dailyBriefSchema.parse({ ...pending, ...forged })).toThrow(/must stay empty rather than look generated/);
    }
  });

  it("refuses a ready brief that is missing its provenance", () => {
    const ready = fixture("reports/daily-brief.json").data as Record<string, unknown>;
    expect(() => dailyBriefSchema.parse({ ...ready, dataAsOf: null }))
      .toThrow(/must carry generatedAt, dataAsOf and queueSummary/);
  });
});

describe("v1.5 report runs", () => {
  const base = {
    runId: "00000000-0000-4000-8000-000000001301",
    kind: "daily_brief" as const,
    ref: { date: "2026-09-05" },
    createdAt: "2026-09-05T03:00:00.000+08:00",
  };

  it("accepts a pending run with nothing computed and a ready run with its output", () => {
    expect(() => reportRunSchema.parse({
      ...base, status: "pending_data", dataAsOf: null, outputRef: null, error: null, finishedAt: null,
    })).not.toThrow();
    expect(() => reportRunSchema.parse({
      ...base, status: "ready", dataAsOf: "2026-09-05T03:20:00.000+08:00", outputRef: "blob://brief",
      error: null, finishedAt: "2026-09-05T03:40:00.000+08:00",
    })).not.toThrow();
  });

  it.each([
    ["a pending run carrying output", { status: "pending_data", dataAsOf: null, outputRef: "blob://x", error: null, finishedAt: null }, /must not carry output/],
    ["a ready run without output", { status: "ready", dataAsOf: "2026-09-05T03:20:00.000+08:00", outputRef: null, error: null, finishedAt: "2026-09-05T03:40:00.000+08:00" }, /must carry its output/],
    ["a failed run without a reason", { status: "failed", dataAsOf: null, outputRef: null, error: null, finishedAt: "2026-09-05T03:40:00.000+08:00" }, /must carry its error/],
    ["a running run marked finished", { status: "running", dataAsOf: null, outputRef: null, error: null, finishedAt: "2026-09-05T03:40:00.000+08:00" }, /finishedAt must be set exactly on terminal runs/],
    ["a ready run left unfinished", { status: "ready", dataAsOf: "2026-09-05T03:20:00.000+08:00", outputRef: "blob://x", error: null, finishedAt: null }, /finishedAt must be set exactly on terminal runs/],
  ])("rejects %s", (_label, override, message) => {
    expect(() => reportRunSchema.parse({ ...base, ...override })).toThrow(message);
  });

  it("requires a scheduled run to point at exactly one source", () => {
    const scheduled = { ...base, kind: "report_schedule" as const, status: "running" as const, dataAsOf: null, outputRef: null, error: null, finishedAt: null };
    const subscriptionId = "00000000-0000-4000-8000-000000001401";
    const viewId = "00000000-0000-4000-8000-000000001201";
    expect(() => reportRunSchema.parse({ ...scheduled, ref: { subscriptionId, viewId } })).not.toThrow();
    expect(() => reportRunSchema.parse({ ...scheduled, ref: { subscriptionId } })).toThrow();
    expect(() => reportRunSchema.parse({ ...scheduled, ref: { subscriptionId, viewId, reportConfigId: viewId } })).toThrow();
  });
});

describe("v1.5 4.3 / 11.7 external changes", () => {
  it("reproduces the frozen timeline item for a detected background edit", () => {
    const fromFixture = ((fixture("accounts/timeline.json").data as { items: Record<string, unknown>[] }).items)
      .find((item) => item.kind === "external_change")!;
    expect(toTimelineItem(CHANGE)).toEqual({
      at: fromFixture.at, kind: "external_change", actor: "external",
      summary: fromFixture.summary, ref: fromFixture.ref, detail: fromFixture.detail,
    });
  });

  it("never invents the old value when the sync could not observe it", () => {
    expect(describeExternalChange({ ...CHANGE, fromValue: null })).toBe("后台手动：campaign 日预算 改为 10000");
    expect(describeExternalChange({ ...CHANGE, fromValue: null, toValue: null })).toBe("后台手动：campaign 日预算 被改动");
    expect(describeExternalChange({ ...CHANGE, fromValue: { value: 8000 }, toValue: { value: 10000 } }))
      .toBe("后台手动：campaign 日预算 8000→10000");
  });

  it("only recognises the four contract fields and three target types", () => {
    expect(() => externalChangeSchema.parse({ ...CHANGE, field: "targeting" })).toThrow();
    expect(() => externalChangeSchema.parse({ ...CHANGE, targetType: "account" })).toThrow();
    for (const field of ["bid", "budget", "status", "schedule"] as const) {
      expect(describeExternalChange({ ...CHANGE, field })).toMatch(/^后台手动：campaign /);
    }
  });
});
