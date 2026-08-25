import { describe, expect, it } from "vitest";

import { accountMetadataFromRawRecords } from "../src/etl/account-metadata.js";
import type { RawMetricRecord } from "../src/etl/types.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function accountRaw(
  payload: Record<string, unknown>,
  overrides: Partial<RawMetricRecord> = {},
): RawMetricRecord {
  return {
    workspaceId,
    media: "KUAISHOU",
    accountId: "00123",
    ds: "2026-08-25",
    source: "metadata",
    resource: "account",
    requestParams: { pageNum: 1 },
    payload,
    fetchedByUserId: null,
    ...overrides,
  };
}

describe("accountMetadataFromRawRecords", () => {
  it("uses the trusted task tuple and only maps approved upstream metadata", () => {
    expect(accountMetadataFromRawRecords([accountRaw({
      account_id: "00123",
      account_name: "可信账户名",
      status: "active",
      workspace_id: "forged-workspace",
      owner_user_id: "forged-owner",
      lifecycle_stage: "forged-stage",
      is_starred: true,
      tags: ["forged"],
    })])).toEqual([{
      workspaceId,
      media: "KUAISHOU",
      accountId: "00123",
      accountName: "可信账户名",
      status: "active",
    }]);
  });

  it("keeps leading-zero string ids and accepts safe integer ids only when tuples match", () => {
    expect(accountMetadataFromRawRecords([
      accountRaw({ account_id: "00123" }),
      accountRaw({ account_id: 456 }, { accountId: "456" }),
    ])).toEqual([
      {
        workspaceId,
        media: "KUAISHOU",
        accountId: "00123",
        accountName: null,
        status: null,
      },
      {
        workspaceId,
        media: "KUAISHOU",
        accountId: "456",
        accountName: null,
        status: null,
      },
    ]);
  });

  it.each([
    [{}, {}],
    [{ account_id: "other" }, {}],
    [{ account_id: 1.5 }, { accountId: "1.5" }],
    [{ account_id: "00123", account_name: 1 }, {}],
    [{ account_id: "00123", status: false }, {}],
    [{ account_id: "00123" }, { workspaceId: "not-a-uuid" }],
    [{ account_id: "00123" }, { media: "forged-media" }],
    [{ account_id: "00123" }, { resource: "account_realtime", source: "realtime" }],
  ] as const)("fails closed for an invalid account metadata row %#", (payload, overrides) => {
    expect(() => accountMetadataFromRawRecords([
      accountRaw(payload, overrides as Partial<RawMetricRecord>),
    ])).toThrow();
  });

  it("deduplicates identical tuples, enriches nulls and rejects conflicting metadata", () => {
    expect(accountMetadataFromRawRecords([
      accountRaw({ account_id: "00123" }),
      accountRaw({ account_id: "00123", account_name: "账户A", status: "active" }),
    ])).toEqual([{
      workspaceId,
      media: "KUAISHOU",
      accountId: "00123",
      accountName: "账户A",
      status: "active",
    }]);

    expect(() => accountMetadataFromRawRecords([
      accountRaw({ account_id: "00123", account_name: "账户A" }),
      accountRaw({ account_id: "00123", account_name: "账户B" }),
    ])).toThrow(/conflicting/i);
  });
});
