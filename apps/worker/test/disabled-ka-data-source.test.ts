import { describe, expect, it } from "vitest";

import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService } from "../src/data/query-service.js";
import { teamAuth } from "./business-auth-fixtures.js";

describe("DisabledKaDataSource", () => {
  it("reports an explicit unavailable source without fabricating data", async () => {
    await expect(new DisabledKaDataSource().query()).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      retryable: false,
      message: "KA Data is disabled by server configuration",
    });
  });

  it("maps a disabled ka_data request to the stable top-level unavailable envelope", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry({ today: () => "2026-09-04" }),
      kaData: new DisabledKaDataSource(),
      platform: { query: async () => { throw new Error("platform must not be called"); } },
      requestId: () => "ka-disabled-001",
    });
    await expect(service.execute({
      queryId: "account.summary",
      params: { date: "2026-09-04" },
    }, teamAuth({
      workspaceId: "00000000-0000-4000-8000-000000000904",
      userId: "00000000-0000-4000-8000-000000000905",
    }))).resolves.toEqual({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "Team data source is not configured",
        retryable: false,
        requestId: "ka-disabled-001",
      },
    });
  });
});
