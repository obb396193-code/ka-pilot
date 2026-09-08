import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { EtlRunRepository } from "../src/etl-run-repository.js";

describe("EtlRunRepository observation unit", () => {
  it("preserves the exact BIGSERIAL text beyond JavaScript safe integers", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "9007199254740993" }], rowCount: 1 });
    const repository = new EtlRunRepository({ query } as unknown as Pool);
    const id = await repository.startRun("job-1", "full", {});
    expect(id).toBe("9007199254740993");
    await repository.recordObservation(id, { rowCount: 1 });
    await repository.finishRun(id, 1);
    expect(query.mock.calls.slice(1).every(([, values]) => values[0] === "9007199254740993")).toBe(true);
  });
  it.each(["0", "01", "-1", "1.1", "1e3", "9223372036854775808", "x".repeat(100), 91, null])("rejects malformed run identifier %s before SQL", async value => {
    const query = vi.fn();
    const repository = new EtlRunRepository({ query } as unknown as Pool);
    await expect(repository.recordObservation(value as never, {})).rejects.toThrow("Invalid ETL run identifier");
    await expect(repository.finishRun(value as never, 1)).rejects.toThrow("Invalid ETL run identifier");
    await expect(repository.failRun(value as never, "step", "error")).rejects.toThrow("Invalid ETL run identifier");
    expect(query).not.toHaveBeenCalled();
  });
  it.each(["0", "01", "9223372036854775808", 9007199254740992, null])("rejects invalid returned ID without coercion", async id => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id }] });
    await expect(new EtlRunRepository({ query } as unknown as Pool).startRun("job-1", "full", {})).rejects.toThrow("Invalid ETL run identifier");
  });
  it("covers the run lifecycle with parameterized statements", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "91" }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });
    const repository = new EtlRunRepository({ query } as unknown as Pool);

    await expect(repository.startRun("job-1", "incr", {
      workspaceId: "11111111-1111-4111-8111-111111111111",
    })).resolves.toBe("91");
    await expect(repository.finishRun("91", 3)).resolves.toBeUndefined();
    await expect(repository.failRun("92", "hourly_derive", "bad data"))
      .resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("fails closed when lifecycle transitions affect no active run", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const repository = new EtlRunRepository({ query } as unknown as Pool);

    await expect(repository.startRun("job-1", "incr", {})).rejects.toThrow("Failed to create");
    await expect(repository.finishRun("91", 0)).rejects.toThrow("is not running");
    await expect(repository.failRun("91", "step", "error")).rejects.toThrow("is not running");
  });

  it("serializes only allowlisted observation fields", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new EtlRunRepository({ query } as unknown as Pool);

    await repository.recordObservation("91", {
      resource: "account_offline",
      rowCount: 0,
      fingerprint: "a".repeat(64),
      observedAt: "2026-08-20T07:00:00.000Z",
      lastSyncTime: null,
      availability: "not_observed",
      beginDate: "2026-08-19",
      endDate: "2026-08-19",
      userId: "must-not-persist",
      accountIds: ["must-not-persist"],
    });

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("scope->'observations'");
    expect(values[0]).toBe("91");
    expect(JSON.parse(values[1])).toEqual({
      resource: "account_offline",
      rowCount: 0,
      fingerprint: "a".repeat(64),
      observedAt: "2026-08-20T07:00:00.000Z",
      lastSyncTime: null,
      availability: "not_observed",
      beginDate: "2026-08-19",
      endDate: "2026-08-19",
    });
    expect(values[1]).not.toContain("must-not-persist");
  });

  it("fails when a run is no longer active", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const repository = new EtlRunRepository({ query } as unknown as Pool);

    await expect(repository.recordObservation("91", {
      resource: "account_realtime",
      rowCount: 0,
    })).rejects.toThrow("is not running");
  });
});
