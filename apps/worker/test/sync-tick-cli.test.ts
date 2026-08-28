import { describe, expect, it, vi } from "vitest";

import {
  executeSyncTickCommand,
  parseSyncTickCliArgs,
} from "../src/scheduling/sync-tick-cli.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("sync tick internal CLI", () => {
  it("accepts only deployment-side workspace/media/mode selectors", () => {
    expect(parseSyncTickCliArgs([
      "--workspace-id",
      workspaceId,
      "--media",
      "KUAISHOU",
      "--mode",
      "auto",
    ])).toEqual({ workspaceId, media: "KUAISHOU", mode: "auto" });
    expect(() => parseSyncTickCliArgs([
      "--workspace-id",
      workspaceId,
      "--media",
      "KUAISHOU",
      "--user-id",
      "22222222-2222-4222-8222-222222222222",
    ])).toThrow("Unknown argument");
    expect(() => parseSyncTickCliArgs([
      "--workspace-id",
      workspaceId,
      "--media",
      "KUAISHOU",
      "--workspace-id",
      workspaceId,
    ])).toThrow("Duplicate argument");
  });

  it("runs one deterministic tick and prints no upstream identity", async () => {
    const write = vi.fn();
    const service = {
      execute: vi.fn().mockResolvedValue({
        workspaceId,
        media: "KUAISHOU",
        businessDate: "2026-08-25",
        mode: "auto",
        jobs: [{
          jobId: "33333333-3333-5333-8333-333333333333",
          userId: "22222222-2222-4222-8222-222222222222",
          jobType: "etl_full",
          status: "queued",
          idempotent: false,
        }],
      }),
    };

    await executeSyncTickCommand({
      args: ["--workspace-id", workspaceId, "--media", "KUAISHOU"],
      now: new Date("2026-08-25T20:00:00Z"),
      service,
      write,
    });

    expect(service.execute).toHaveBeenCalledWith({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00.000Z",
    });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).not.toContain("qihang");
  });
});
