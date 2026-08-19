import { describe, expect, it } from "vitest";

import { deterministicJobId } from "../src/jobs/deterministic-id.js";
import { JOB_PRIORITY } from "../src/jobs/priorities.js";

describe("job scheduling primitives", () => {
  it("keeps realtime work ahead of rules, defaults and historical backfill", () => {
    expect(JOB_PRIORITY.ETL_INCREMENTAL).toBeLessThan(JOB_PRIORITY.RULE_SCAN);
    expect(JOB_PRIORITY.RULE_SCAN).toBeLessThan(JOB_PRIORITY.DEFAULT);
    expect(JOB_PRIORITY.DEFAULT).toBeLessThan(JOB_PRIORITY.BACKFILL);
  });

  it("generates a stable UUID for an idempotency key", () => {
    const first = deterministicJobId("backfill:91:2026-08-19");
    const second = deterministicJobId("backfill:91:2026-08-19");
    const different = deterministicJobId("backfill:91:2026-08-18");

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
