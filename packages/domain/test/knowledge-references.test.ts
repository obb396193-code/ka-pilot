import { describe, expect, it, vi } from "vitest";

import {
  extractKnowledgeReferences,
  parseKnowledgeDocument,
  planKnowledgeDocumentLinkReplacement,
  type KnowledgeDocumentTargetResolver,
} from "../src/index.js";

const SOURCE_ID = "fba6b708-4b47-4b14-91df-62f5a12473b5";
const AVAILABLE_ID = "1f2d1b38-4ff8-4dcc-8c27-d074d22b14f5";
const UNAVAILABLE_ID = "5cc20f90-0ca1-448d-bd70-7a7147127ed2";
const WORKSPACE_ID = "a0c65ca8-c2d4-43ab-b08d-05b5d48350a7";
const USER_ID = "d0b31927-bd56-42ac-bf94-4911f4e51ca1";

function inline(type: string, props: Record<string, unknown>) {
  return { type, props };
}

describe("extractKnowledgeReferences", () => {
  it("extracts UUID wikilinks with paths and deduplicates by first occurrence", () => {
    const document = parseKnowledgeDocument({
      blocks: [
        {
          type: "paragraph",
          content: [
            inline("wikilink", { itemId: AVAILABLE_ID, title: "账户 SOP" }),
            inline("wikilink", { itemId: AVAILABLE_ID.toUpperCase(), title: "重复标题" }),
          ],
        },
      ],
    });

    const result = extractKnowledgeReferences(document);

    expect(result.wikilinks).toEqual([
      {
        targetDocumentId: AVAILABLE_ID,
        title: "账户 SOP",
        path: ["blocks", 0, "content", 0],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(Object.isFrozen(result.wikilinks[0]!.path)).toBe(true);
  });

  it("reports malformed and invalid wikilinks without echoing their payload", () => {
    const document = parseKnowledgeDocument({
      blocks: [
        inline("wikilink", { itemId: "not-a-uuid", title: "坏 ID" }),
        inline("wikilink", { itemId: AVAILABLE_ID }),
        { type: "wikilink", props: { itemId: AVAILABLE_ID, title: "多字段", secret: "leak" } },
      ],
    });

    const result = extractKnowledgeReferences(document);

    expect(result.wikilinks).toEqual([]);
    expect(result.diagnostics.map(({ referenceType, code, path }) => ({ referenceType, code, path }))).toEqual([
      { referenceType: "wikilink", code: "invalid_id", path: ["blocks", 0] },
      { referenceType: "wikilink", code: "malformed_reference", path: ["blocks", 1] },
      { referenceType: "wikilink", code: "malformed_reference", path: ["blocks", 2] },
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("not-a-uuid");
    expect(JSON.stringify(result.diagnostics)).not.toContain("leak");
  });

  it("extracts typed business references and preserves distinct evidence snapshots", () => {
    const document = parseKnowledgeDocument({
      blocks: [
        inline("business_ref", {
          objectType: "account",
          objectId: "ks:account:10001",
          label: "  主投账户  ",
          snapshotVersion: "v2026.08.20",
          dataCutoffAt: "2026-08-20T12:00:00+08:00",
        }),
        inline("business_ref", {
          objectType: "account",
          objectId: "ks:account:10001",
          label: "重复显示名",
          snapshotVersion: "v2026.08.20",
          dataCutoffAt: "2026-08-20T12:00:00+08:00",
        }),
        inline("business_ref", {
          objectType: "account",
          objectId: "ks:account:10001",
          snapshotVersion: "v2026.08.21",
        }),
        inline("business_ref", { objectType: "workflow_run", objectId: "run_20260820-001" }),
      ],
    });

    const result = extractKnowledgeReferences(document);

    expect(result.businessRefs).toEqual([
      {
        objectType: "account",
        objectId: "ks:account:10001",
        label: "主投账户",
        snapshotVersion: "v2026.08.20",
        dataCutoffAt: "2026-08-20T12:00:00+08:00",
        path: ["blocks", 0],
      },
      {
        objectType: "account",
        objectId: "ks:account:10001",
        snapshotVersion: "v2026.08.21",
        path: ["blocks", 2],
      },
      {
        objectType: "workflow_run",
        objectId: "run_20260820-001",
        path: ["blocks", 3],
      },
    ]);
  });

  it.each([
    ["unknown object type", { objectType: "shell", objectId: "safe-id" }],
    ["unsafe object id", { objectType: "task", objectId: "../task" }],
    ["bad snapshot", { objectType: "report", objectId: "r-1", snapshotVersion: "../v1" }],
    ["bad cutoff", { objectType: "dataset", objectId: "d-1", dataCutoffAt: "tomorrow" }],
    ["unknown prop", { objectType: "material", objectId: "m-1", token: "secret" }],
  ])("rejects malformed business reference: %s", (_name, props) => {
    const result = extractKnowledgeReferences(
      parseKnowledgeDocument({ blocks: [inline("business_ref", props)] }),
    );

    expect(result.businessRefs).toEqual([]);
    expect(result.diagnostics).toEqual([
      { referenceType: "business_ref", code: "malformed_reference", path: ["blocks", 0] },
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("secret");
  });
});

describe("planKnowledgeDocumentLinkReplacement", () => {
  it("returns accepted targets and safe rejection reasons in document order", async () => {
    const resolveAvailableDocumentIds = vi.fn(async () => [AVAILABLE_ID]);
    const resolver: KnowledgeDocumentTargetResolver = { resolveAvailableDocumentIds };
    const document = parseKnowledgeDocument({
      blocks: [
        inline("wikilink", { itemId: SOURCE_ID, title: "自己" }),
        inline("wikilink", { itemId: AVAILABLE_ID, title: "可用" }),
        inline("wikilink", { itemId: UNAVAILABLE_ID, title: "不可用" }),
        inline("wikilink", { itemId: "bad", title: "坏 ID" }),
      ],
    });

    const plan = await planKnowledgeDocumentLinkReplacement({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      sourceDocumentId: SOURCE_ID,
      document,
      resolver,
    });

    expect(resolveAvailableDocumentIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      targetDocumentIds: [AVAILABLE_ID, UNAVAILABLE_ID],
    });
    expect(plan).toEqual({
      replaceAll: true,
      acceptedTargetIds: [AVAILABLE_ID],
      rejected: [
        { referenceType: "wikilink", code: "invalid_id", path: ["blocks", 3] },
        { referenceType: "wikilink", code: "self_link", path: ["blocks", 0] },
        { referenceType: "wikilink", code: "target_unavailable", path: ["blocks", 2] },
      ],
    });
    expect(JSON.stringify(plan)).not.toContain(UNAVAILABLE_ID);
  });

  it("does not call the target resolver when no external valid target exists", async () => {
    const resolver: KnowledgeDocumentTargetResolver = {
      resolveAvailableDocumentIds: vi.fn(async () => []),
    };
    const document = parseKnowledgeDocument({
      blocks: [inline("wikilink", { itemId: SOURCE_ID, title: "自己" })],
    });

    const plan = await planKnowledgeDocumentLinkReplacement({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      sourceDocumentId: SOURCE_ID,
      document,
      resolver,
    });

    expect(resolver.resolveAvailableDocumentIds).not.toHaveBeenCalled();
    expect(plan.acceptedTargetIds).toEqual([]);
  });

  it("fails closed when a resolver returns an invalid or unrequested target", async () => {
    const document = parseKnowledgeDocument({
      blocks: [inline("wikilink", { itemId: AVAILABLE_ID, title: "可用" })],
    });
    const common = {
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      sourceDocumentId: SOURCE_ID,
      document,
    };

    await expect(
      planKnowledgeDocumentLinkReplacement({
        ...common,
        resolver: { resolveAvailableDocumentIds: async () => ["invalid"] },
      }),
    ).rejects.toThrow("resolver");
    await expect(
      planKnowledgeDocumentLinkReplacement({
        ...common,
        resolver: { resolveAvailableDocumentIds: async () => [UNAVAILABLE_ID] },
      }),
    ).rejects.toThrow("resolver");
  });
});
