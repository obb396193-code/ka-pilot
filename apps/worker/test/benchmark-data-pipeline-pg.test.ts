import { describe, expect, it } from "vitest";

import {
  assertLocalTestDatabase,
  parsePgBenchmarkArgs,
  runPgDataPipelineBenchmark,
} from "../src/benchmark/data-pipeline-pg.js";

describe("real PostgreSQL benchmark safety", () => {
  it("parses only bounded benchmark scales", () => {
    expect(
      parsePgBenchmarkArgs([
        "--database-url=postgres://ka:ka@127.0.0.1:55432/ka",
        "--accounts=100,1000,5000",
        "--iterations=3",
        "--chunk-size=250",
      ]),
    ).toEqual({
      databaseUrl: "postgres://ka:ka@127.0.0.1:55432/ka",
      accountCounts: [100, 1_000, 5_000],
      iterations: 3,
      chunkSize: 250,
    });
    expect(() => parsePgBenchmarkArgs([
      "--database-url=postgres://ka:ka@127.0.0.1:55432/ka", "--accounts=200",
    ])).toThrow("100, 1000 or 5000");
  });

  it("rejects non-local or unexpected database targets", () => {
    expect(() =>
      assertLocalTestDatabase("postgres://ka:ka@db.example.test:5432/ka"),
    ).toThrow("local test database");
    expect(() =>
      assertLocalTestDatabase("postgres://ka:ka@127.0.0.1:5432/production"),
    ).toThrow("port 55432");
  });

  it("allows explicitly named isolated test databases, not arbitrary local databases", () => {
    expect(() => assertLocalTestDatabase("postgres://ka:ka@127.0.0.1:55432/ka_be_r010_test")).not.toThrow();
    for (const name of ["production", "ka_r009", "ka_test", "ka_be_test/extra", "ka_be_test%00", "ka_be_test?host=remote"]) {
      expect(() => assertLocalTestDatabase(`postgres://ka:ka@127.0.0.1:55432/${name}`)).toThrow();
    }
  });

  it("runs a bounded real PostgreSQL sample and cleans its synthetic workspace", async () => {
    const report = await runPgDataPipelineBenchmark({
      databaseUrl: process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka",
      accountCounts: [100],
      iterations: 1,
      chunkSize: 50,
    });

    expect(report.benchmark).toBe("canonical-real-postgres");
    expect(report.samples).toEqual([
      expect.objectContaining({
        accountCount: 100,
        chunkSize: 50,
        chunkCount: 2,
        canonicalRows: 100,
        portCalls: 10,
      }),
    ]);
    expect(report.samples[0]?.plans).toHaveLength(3);
    expect(report.samples[0]?.plans.every((plan) => plan.nodeType !== "unknown")).toBe(
      true,
    );
  }, 30_000); // Includes a fresh isolated database migration, not only the measured sample.
});
