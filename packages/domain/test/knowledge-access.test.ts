import { describe, expect, it, vi } from "vitest";

import {
  parseKnowledgeAssetMetadata,
  parseKnowledgeSearchRequest,
  searchKnowledgeForAgent,
  type KnowledgePermissionPort,
  type KnowledgeSearchPort,
} from "../src/index.js";

const WORKSPACE_ID = "a0c65ca8-c2d4-43ab-b08d-05b5d48350a7";
const OTHER_WORKSPACE_ID = "4a71a5fb-4c30-4fb6-8bc1-ae9059b20f39";
const USER_ID = "d0b31927-bd56-42ac-bf94-4911f4e51ca1";
const DOCUMENT_A = "1f2d1b38-4ff8-4dcc-8c27-d074d22b14f5";
const DOCUMENT_B = "5cc20f90-0ca1-448d-bd70-7a7147127ed2";

function citation(documentId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    documentId,
    title: "账户跑量复盘",
    revision: 3,
    fragmentId: `fragment:${documentId}`,
    fragmentText: "预算利用率下降，建议先检查账户余额。",
    score: 0.91,
    evidenceKey: `kb:${documentId}:r3:f1`,
    source: "workflow_case",
    visibility: "team",
    assetState: "verified",
    businessRefs: [
      {
        objectType: "account",
        objectId: "ks:account:10001",
        label: "主投账户",
        snapshotVersion: "v3",
        dataCutoffAt: "2026-08-20T12:00:00+08:00",
      },
    ],
    dataCutoffAt: "2026-08-20T12:00:00+08:00",
    snapshotVersion: "v3",
    ...overrides,
  };
}

describe("knowledge asset and search input", () => {
  it("separates source, visibility, and asset lifecycle", () => {
    expect(
      parseKnowledgeAssetMetadata({
        source: "manual",
        visibility: "private",
        assetState: "draft",
      }),
    ).toEqual({ source: "manual", visibility: "private", assetState: "draft" });

    expect(() =>
      parseKnowledgeAssetMetadata({
        source: "manual",
        visibility: "official",
        assetState: "draft",
      }),
    ).toThrow("knowledge asset metadata");
    expect(() =>
      parseKnowledgeAssetMetadata({
        source: "manual",
        visibility: "team",
        assetState: "published",
      }),
    ).toThrow("knowledge asset metadata");
  });

  it("normalizes a bounded tenant-and-user scoped search request", () => {
    expect(
      parseKnowledgeSearchRequest({
        workspaceId: WORKSPACE_ID.toUpperCase(),
        actorUserId: USER_ID,
        query: "  账户为什么不跑量  ",
        sourceTypes: ["lesson", "manual", "lesson"],
        businessScope: [
          { objectType: "task", objectId: "task-001" },
          { objectType: "task", objectId: "task-001" },
        ],
      }),
    ).toEqual({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      query: "账户为什么不跑量",
      limit: 10,
      sourceTypes: ["lesson", "manual"],
      businessScope: [{ objectType: "task", objectId: "task-001" }],
    });
  });

  it.each([
    ["missing actor", { workspaceId: WORKSPACE_ID, query: "跑量" }],
    ["blank query", { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: " " }],
    ["too high limit", { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "跑量", limit: 51 }],
    ["unknown field", { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "跑量", sql: "select 1" }],
    ["unsafe scope", { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "跑量", businessScope: [{ objectType: "account", objectId: "../a" }] }],
  ])("rejects unsafe search request: %s", (_name, input) => {
    expect(() => parseKnowledgeSearchRequest(input)).toThrow("knowledge search request");
  });
});

describe("searchKnowledgeForAgent", () => {
  it("returns only runtime-valid citations that the permission boundary authorizes", async () => {
    const searchAuthorized = vi.fn(async () => [citation(DOCUMENT_A), citation(DOCUMENT_B)]);
    const resolveAuthorizedDocumentIds = vi.fn(async () => [DOCUMENT_A]);
    const resolveAuthorizedBusinessObjects = vi.fn(async () => [
      { objectType: "account" as const, objectId: "ks:account:10001" },
    ]);
    const searchPort: KnowledgeSearchPort = { searchAuthorized };
    const permissionPort: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds,
      resolveAuthorizedBusinessObjects,
    };

    const result = await searchKnowledgeForAgent(
      {
        workspaceId: WORKSPACE_ID,
        actorUserId: USER_ID,
        query: "账户为什么不跑量",
        limit: 5,
      },
      searchPort,
      permissionPort,
    );

    expect(searchAuthorized).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      query: "账户为什么不跑量",
      limit: 5,
    });
    expect(resolveAuthorizedDocumentIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      action: "read",
      documentIds: [DOCUMENT_A, DOCUMENT_B],
    });
    expect(resolveAuthorizedBusinessObjects).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      action: "read",
      objects: [{ objectType: "account", objectId: "ks:account:10001" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      documentId: DOCUMENT_A,
      revision: 3,
      evidenceKey: `kb:${DOCUMENT_A}:r3:f1`,
      businessRefs: [{ objectType: "account", objectId: "ks:account:10001" }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0]!.businessRefs)).toBe(true);
  });

  it("rejects an invalid or cross-workspace search result before permission resolution", async () => {
    const permissionPort: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds: vi.fn(async () => []),
      resolveAuthorizedBusinessObjects: vi.fn(async () => []),
    };
    const crossWorkspace: KnowledgeSearchPort = {
      searchAuthorized: async () => [citation(DOCUMENT_A, { workspaceId: OTHER_WORKSPACE_ID })],
    };
    const badScore: KnowledgeSearchPort = {
      searchAuthorized: async () => [citation(DOCUMENT_A, { score: 4, fragmentText: "secret-text" })],
    };
    const request = { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "跑量" };

    await expect(
      searchKnowledgeForAgent(request, crossWorkspace, permissionPort),
    ).rejects.toThrow("knowledge search result");
    await expect(searchKnowledgeForAgent(request, badScore, permissionPort)).rejects.toThrow(
      "knowledge search result",
    );
    expect(permissionPort.resolveAuthorizedDocumentIds).not.toHaveBeenCalled();
  });

  it("rejects too many citations and permission adapters that return unrequested IDs", async () => {
    const request = {
      workspaceId: WORKSPACE_ID,
      actorUserId: USER_ID,
      query: "跑量",
      limit: 1,
    };
    const tooMany: KnowledgeSearchPort = {
      searchAuthorized: async () => [citation(DOCUMENT_A), citation(DOCUMENT_B)],
    };
    const invalidPermission: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds: async () => [DOCUMENT_B],
      resolveAuthorizedBusinessObjects: async () => [],
    };
    const oneResult: KnowledgeSearchPort = {
      searchAuthorized: async () => [citation(DOCUMENT_A)],
    };

    await expect(
      searchKnowledgeForAgent(request, tooMany, invalidPermission),
    ).rejects.toThrow("knowledge search result");
    await expect(
      searchKnowledgeForAgent(request, oneResult, invalidPermission),
    ).rejects.toThrow("knowledge permission resolver");
  });

  it("drops a citation whose plaintext depends on an unauthorized business reference", async () => {
    const request = { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "跑量" };
    const searchPort: KnowledgeSearchPort = {
      searchAuthorized: async () => [citation(DOCUMENT_A)],
    };
    const withoutBusinessAccess: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds: async () => [DOCUMENT_A],
      resolveAuthorizedBusinessObjects: async () => [],
    };
    const inventedBusinessAccess: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds: async () => [DOCUMENT_A],
      resolveAuthorizedBusinessObjects: async () => [
        { objectType: "task", objectId: "task-invented" },
      ],
    };

    const filtered = await searchKnowledgeForAgent(
      request,
      searchPort,
      withoutBusinessAccess,
    );
    expect(filtered).toEqual([]);
    await expect(
      searchKnowledgeForAgent(request, searchPort, inventedBusinessAccess),
    ).rejects.toThrow("knowledge permission resolver");
  });

  it("returns an empty immutable result without calling permissions when search has no hit", async () => {
    const permissionPort: KnowledgePermissionPort = {
      resolveAuthorizedDocumentIds: vi.fn(async () => []),
      resolveAuthorizedBusinessObjects: vi.fn(async () => []),
    };
    const result = await searchKnowledgeForAgent(
      { workspaceId: WORKSPACE_ID, actorUserId: USER_ID, query: "不存在" },
      { searchAuthorized: async () => [] },
      permissionPort,
    );

    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(permissionPort.resolveAuthorizedDocumentIds).not.toHaveBeenCalled();
  });
});
