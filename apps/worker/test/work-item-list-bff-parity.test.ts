import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { WORK_ITEM_STATUSES, workItemListRequestSchema, workItemListResponseSchema } from "@ka/domain";

describe("I002 frontend/backend live contract parity", () => {
  it("matches current Domain for canonical fixtures and malformed request/response mutations", async () => {
    const responses: unknown[] = [];
    for (const name of ["ready", "empty", "partial", "stale"]) {
      responses.push(JSON.parse(await readFile(new URL(`../../../packages/contract/fixtures/work-item-list/${name}.json`, import.meta.url), "utf8")));
    }
    const errors = JSON.parse(await readFile(new URL("../../../packages/contract/fixtures/work-item-list/errors.json", import.meta.url), "utf8"));
    responses.push(...Object.values(errors));
    const ready = workItemListResponseSchema.parse(responses[0]);
    if (!ready.ok) throw new Error("Invalid fixture");
    for (const status of [...WORK_ITEM_STATUSES, "invalid"]) {
      const changed = structuredClone(ready);
      responses.push({ ...changed, data: { ...changed.data, items: [{ ...changed.data.items[0], status }] } });
    }
    for (const field of Object.keys(ready.data.items[0]!)) {
      const item: Record<string, unknown> = { ...ready.data.items[0] }; delete item[field];
      responses.push({ ...ready, data: { ...ready.data, items: [item] } });
    }
    responses.push({ ...ready, extra: "forbidden" }, { ...ready, meta: { ...ready.meta, selectedSource: "ka_data" } },
      { ...ready, meta: { ...ready.meta, businessDate: "2026-02-31" } });
    const requests = [{}, ...WORK_ITEM_STATUSES.map(status => ({ status })), { page: 0 }, { page: "2" }, { pageSize: 101 },
      { workspaceId: "forged" }, { assigneeUserId: "bad" }, { q: "x".repeat(101) }, { taskId: "" }, { severity: "P9" }];
    const expected = { requests: requests.map(value => workItemListRequestSchema.safeParse(value).success),
      responses: responses.map(value => workItemListResponseSchema.safeParse(value).success) };
    const moduleUrl = new URL("../../web/lib/data/work-item-list-contracts.ts", import.meta.url).href;
    const script = `const m=await import(process.argv[1]); const data=JSON.parse(process.argv[2]);
      process.stdout.write(JSON.stringify({requests:data.requests.map(v=>m.workItemListRequestSchema.safeParse(v).success),
        responses:data.responses.map(v=>m.workItemListResponseSchema.safeParse(v).success)}));`;
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script, moduleUrl, JSON.stringify({ requests, responses })],
      { timeout: 10000, maxBuffer: 1024 * 1024 });
    expect(JSON.parse(stdout)).toEqual(expected);
  });
});
