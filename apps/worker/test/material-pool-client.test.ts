import { describe, expect, it, vi } from "vitest";

import {
  MaterialPoolClient,
  MaterialPoolError,
} from "../src/sources/material-pool-client.js";

function jsonResponse(body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function page(rows: unknown[], pageNum: number, pageSize: number, totalNum: number) {
  return { errCode: 0, data: { rows, pageNum, pageSize, totalNum } };
}

function material(signature: string) {
  return { signature, material_type: "VIDEO", material_url: `https://media.example/${signature}.mp4` };
}

const query = {
  media: "KUAISHOU",
  poolIds: [10, 20],
  itemIds: ["item-a", null],
} as const;

describe("MaterialPoolClient", () => {
  it("paginates to the confirmed total and emits a redacted observation", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(page([
        { signature: "s-1", material_type: "VIDEO", material_url: "https://media.example/a.mp4" },
        { signature: "s-2", material_type: "IMAGE", material_url: "https://media.example/b.jpg" },
      ], 1, 2, 3)))
      .mockResolvedValueOnce(jsonResponse(page([
        { signature: "s-3", material_type: "VIDEO", material_url: "https://media.example/c.mp4" },
      ], 2, 2, 3)));
    const client = new MaterialPoolClient({
      fetchFn,
      pageSize: 2,
      now: () => new Date("2026-08-20T09:00:00.000Z"),
    });

    const result = await client.listAll(query);

    expect(result.rows).toHaveLength(3);
    expect(result.observation).toMatchObject({
      pageCount: 2,
      rawRowCount: 3,
      uniqueRowCount: 3,
      observedAt: "2026-08-20T09:00:00.000Z",
    });
    expect(JSON.stringify(result.observation)).not.toContain("item-a");
    expect(JSON.stringify(result.observation)).not.toContain("media.example");
    const firstUrl = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(firstUrl.searchParams.get("media")).toBe("KUAISHOU");
    expect(firstUrl.searchParams.get("poolIds")).toBe("10,20");
    expect(firstUrl.searchParams.get("itemIds")).toBe("item-a");
    expect(firstUrl.searchParams.get("includeNullItemId")).toBe("true");
    expect(firstUrl.searchParams.get("returnTotalNum")).toBe("true");
  });

  it("deduplicates identical signatures but rejects conflicting duplicates", async () => {
    const repeated = {
      signature: "same",
      material_type: "VIDEO",
      material_url: "https://media.example/a.mp4",
    };
    const exactClient = new MaterialPoolClient({
      pageSize: 1,
      fetchFn: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(page([repeated], 1, 1, 2)))
        .mockResolvedValueOnce(jsonResponse(page([repeated], 2, 1, 2))),
    });
    await expect(exactClient.listAll(query)).resolves.toMatchObject({
      rows: [repeated],
      observation: { rawRowCount: 2, uniqueRowCount: 1 },
    });

    const conflictClient = new MaterialPoolClient({
      pageSize: 1,
      fetchFn: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(page([repeated], 1, 1, 2)))
        .mockResolvedValueOnce(jsonResponse(page([{ ...repeated, material_url: "https://media.example/other.mp4" }], 2, 1, 2))),
    });
    await expect(conflictClient.listAll(query)).rejects.toMatchObject({
      code: "MATERIAL_PROTOCOL_ERROR",
    });
  });

  it.each([
    ["total drift", [page([{ signature: "s1" }], 1, 1, 2), page([{ signature: "s2" }], 2, 1, 3)]],
    ["premature empty page", [page([{ signature: "s1" }], 1, 1, 3), page([], 2, 1, 3)]],
    ["wrong page", [page([{ signature: "s1" }], 7, 1, 1)]],
  ])("fails closed on %s", async (_label, responses) => {
    const fetchFn = vi.fn<typeof fetch>();
    for (const response of responses) fetchFn.mockResolvedValueOnce(jsonResponse(response));
    const client = new MaterialPoolClient({ fetchFn, pageSize: 1 });

    await expect(client.listAll(query)).rejects.toBeInstanceOf(MaterialPoolError);
  });

  it("enforces page, row, response and query input budgets", async () => {
    const pageClient = new MaterialPoolClient({
      pageSize: 1,
      maxPages: 1,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse(page([material("s1")], 1, 1, 2))),
    });
    await expect(pageClient.listAll(query)).rejects.toMatchObject({
      code: "MATERIAL_RESOURCE_LIMIT",
    });

    const rowClient = new MaterialPoolClient({
      maxRows: 1,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse(page([
        material("s1"), material("s2"),
      ], 1, 2, 2))),
      pageSize: 2,
    });
    await expect(rowClient.listAll(query)).rejects.toMatchObject({
      code: "MATERIAL_RESOURCE_LIMIT",
    });

    const byteClient = new MaterialPoolClient({
      maxResponseBytes: 10,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse(page([], 1, 1, 0))),
    });
    await expect(byteClient.listAll(query)).rejects.toMatchObject({
      code: "MATERIAL_RESOURCE_LIMIT",
    });

    const noFetch = vi.fn<typeof fetch>();
    const invalidClient = new MaterialPoolClient({ fetchFn: noFetch });
    await expect(invalidClient.listAll({ ...query, poolIds: [] })).rejects.toBeInstanceOf(MaterialPoolError);
    await expect(invalidClient.listAll({ ...query, itemIds: [] })).rejects.toBeInstanceOf(MaterialPoolError);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("does not retry business failures or schema drift", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ errCode: 7, errMsg: "denied" }));
    const client = new MaterialPoolClient({ fetchFn });
    await expect(client.listAll(query)).rejects.toMatchObject({ code: "MATERIAL_PROTOCOL_ERROR" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous numeric metadata and delimited item identifiers", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({
      errCode: "",
      data: { rows: [], pageNum: "", pageSize: "500", totalNum: "" },
    }));
    const client = new MaterialPoolClient({ fetchFn });
    await expect(client.listAll(query)).rejects.toMatchObject({ code: "MATERIAL_PROTOCOL_ERROR" });

    const noFetch = vi.fn<typeof fetch>();
    const strictClient = new MaterialPoolClient({ fetchFn: noFetch });
    await expect(strictClient.listAll({ ...query, itemIds: ["item-a,item-b"] })).rejects.toMatchObject({
      code: "MATERIAL_PROTOCOL_ERROR",
    });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("sanitizes transport failures so query values do not escape through errors", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      throw new Error(`socket failed for ${String(input)}`);
    });
    const client = new MaterialPoolClient({ fetchFn });

    let error: unknown;
    try {
      await client.listAll(query);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MaterialPoolError);
    expect(String(error)).not.toContain("item-a");
    expect(String(error)).not.toContain("appCode");
  });
});
