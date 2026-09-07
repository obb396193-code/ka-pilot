import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  POOL_STATUS_ORDER, accountPipelineSchema, buildAccountPipeline,
} from "../../src/r014/account-pipeline-contract.js";
import { metricValue } from "../../src/metric-value.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../../contract/fixtures/accounts/pipeline.json", import.meta.url), "utf8"),
) as { data: { stages: { poolStatus: string; count: number }[] } };

describe("v1.5.1 ① account pipeline", () => {
  it("parses the frozen fixture and pins the nine-state order", () => {
    expect(() => accountPipelineSchema.parse({ ...fixture.data, asOf: "2026-09-05T09:15:00.000+08:00" })).not.toThrow();
    expect(fixture.data.stages.map((stage) => stage.poolStatus)).toEqual([...POOL_STATUS_ORDER]);
  });

  it("always returns all nine stages, filling absent states with zero counts", () => {
    const pipeline = buildAccountPipeline({ in_delivery: 18 }, "2026-09-05T09:15:00.000+08:00");
    expect(pipeline.stages).toHaveLength(9);
    expect(pipeline.stages.map((stage) => stage.poolStatus)).toEqual([...POOL_STATUS_ORDER]);
    expect(pipeline.stages.find((stage) => stage.poolStatus === "in_delivery")!.count).toBe(18);
    expect(pipeline.stages.find((stage) => stage.poolStatus === "closed")!.count).toBe(0);
  });

  it("defaults deltaVsYesterday to missing, never to zero", () => {
    // 0 = 「昨天到今天没变」；missing = 「不知道昨天什么样」。没有历史源时只能是后者。
    const pipeline = buildAccountPipeline({ available: 6 }, "2026-09-05T09:15:00.000+08:00");
    for (const stage of pipeline.stages) {
      expect(stage.deltaVsYesterday).toEqual({ value: null, availability: "missing" });
    }
  });

  it("carries a real delta when a history source can supply one", () => {
    const pipeline = buildAccountPipeline(
      { available: 6 }, "2026-09-05T09:15:00.000+08:00",
      (status) => (status === "available" ? metricValue(1) : metricValue(null)),
    );
    expect(pipeline.stages[0]!.deltaVsYesterday).toEqual({ value: 1, availability: "available" });
    expect(pipeline.stages[1]!.deltaVsYesterday.availability).toBe("missing");
  });

  it("refuses a pipeline whose stages were reordered or truncated", () => {
    const good = buildAccountPipeline({}, "2026-09-05T09:15:00.000+08:00");
    expect(() => accountPipelineSchema.parse({ ...good, stages: [...good.stages].reverse() }))
      .toThrow(/frozen nine-state order/);
    expect(() => accountPipelineSchema.parse({ ...good, stages: good.stages.slice(1) })).toThrow();
  });
});
