import { describe, expect, it } from "vitest";

import {
  parseDataPipelineBenchmarkArgs,
  runDataPipelineBenchmark,
} from "../src/benchmark/data-pipeline.js";

describe("synthetic Qihang to Canonical benchmark", () => {
  it("reports stable workload and port-call facts without asserting machine speed", async () => {
    const report = await runDataPipelineBenchmark([3, 7], 3);

    expect(report.benchmark).toBe("qihang-canonical-synthetic");
    expect(report.sampleCount).toBe(2);
    expect(report.iterationsPerSample).toBe(3);
    expect(report.runtime.node).toBe(process.version);
    for (const sample of report.samples) {
      expect(sample.qihangRows).toBe(sample.accountCount);
      expect(sample.qihangJsonBytes).toBeGreaterThan(0);
      expect(sample.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(sample.rowsPerSecond).toBeGreaterThan(0);
      expect(sample.canonicalPortCalls).toEqual({
        loadMergeInputs: 1,
        loadEffectiveSettings: sample.accountCount,
        loadHistoricalSpend: sample.accountCount,
        upsertCanonical: sample.accountCount,
        startRun: 1,
        finishRun: 1,
        failRun: 0,
        enqueue: 1,
        total: 3 * sample.accountCount + 4,
      });
    }
  });

  it("rejects invalid workloads", async () => {
    await expect(runDataPipelineBenchmark([0])).rejects.toThrow(/positive integer/);
  });

  it("parses explicit CLI scales and rejects unknown arguments", () => {
    expect(parseDataPipelineBenchmarkArgs(["--accounts=10,20", "--iterations=3"])).toEqual({
      accountCounts: [10, 20],
      iterationsPerSample: 3,
    });
    expect(() => parseDataPipelineBenchmarkArgs(["--surprise=true"])).toThrow(/unknown/);
  });
});
