import { describe, expect, it } from "vitest";
import { computeBackfillProgress, type BackfillJobEvidence } from "../src/backfill-progress.js";

const dates = ["2026-08-17", "2026-08-18"];
const evidence = (jobType: string, status = "done"): BackfillJobEvidence[] => dates.map((ds) => ({
  jobType, status, dateFrom: ds, dateTo: ds,
}));
const raw = evidence("backfill_day");
const canonical = evidence("canonical_merge");
const quality = evidence("data_quality_check");
const progress = (jobs: BackfillJobEvidence[]) => computeBackfillProgress(dates, jobs);

describe("backfill completion requires the full DAG", () => {
  it("advances only when every date has completed the next stage", () => {
    expect(progress([]).status).toBe("running");
    expect(progress(raw).status).toBe("raw_done");
    expect(progress([...raw, canonical[0]!]).status).toBe("raw_done");
    expect(progress([...raw, ...canonical]).status).toBe("canonical_done");
    expect(progress([...raw, ...canonical, quality[0]!]).status).toBe("canonical_done");
    expect(progress([...raw, ...canonical, ...quality])).toMatchObject({
      status: "done", failedStage: null, terminalDays: 2, failedDays: 0,
    });
  });

  it.each([
    ["backfill_day", "raw"], ["canonical_merge", "canonical"], ["data_quality_check", "quality"],
  ])("records terminal failure in %s and never calls it done", (jobType, failedStage) => {
    for (const status of ["failed", "blocked_auth"]) {
      expect(progress([...raw, ...canonical, ...quality, ...evidence(jobType, status)]))
        .toMatchObject({ status: "failed", failedStage });
    }
  });

  it("does not count pending retries, wrong dates or duplicate successes as complete coverage", () => {
    expect(progress([...raw, ...canonical, quality[0]!, quality[0]!]).status).toBe("canonical_done");
    expect(progress([...raw, ...canonical, ...evidence("data_quality_check", "queued")]).status).toBe("canonical_done");
    expect(progress([...raw, ...canonical, { ...quality[0]!, dateFrom: "2026-08-19", dateTo: "2026-08-19" }]).status).toBe("canonical_done");
    expect(progress([...canonical, ...quality]).status).toBe("running");
  });

  it("keeps contiguous raw cursor while failing a coordinator before fanout", () => {
    expect(progress([raw[1]!]).cursorDate).toBeNull();
    expect(progress([{ jobType: "backfill_historical", status: "failed", dateFrom: null, dateTo: null }]))
      .toMatchObject({ status: "failed", failedStage: "raw", cursorDate: null });
  });
});
