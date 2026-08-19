import { describe, expect, it } from "vitest";

import {
  fingerprintKnowledgeDocument,
  parseKnowledgeDocument,
  projectKnowledgeDocumentText,
} from "../src/index.js";

function documentBody() {
  return {
    blocks: [
      {
        id: "paragraph-1",
        type: "paragraph",
        props: { textColor: "default" },
        content: [
          { type: "text", text: "账户诊断", styles: { bold: true } },
          {
            type: "wikilink",
            props: {
              itemId: "1f2d1b38-4ff8-4dcc-8c27-d074d22b14f5",
              title: "快手投放 SOP",
            },
          },
        ],
        children: [],
      },
      {
        id: "future-block",
        type: "future_blocknote_type",
        props: { vendorOption: { enabled: true } },
        content: [{ type: "text", text: "  结论：控制成本  ", styles: {} }],
        children: [],
      },
    ],
  };
}

describe("parseKnowledgeDocument", () => {
  it("preserves a forward-compatible BlockNote document without sharing mutable input", () => {
    const input = documentBody();
    const parsed = parseKnowledgeDocument(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.blocks).not.toBe(input.blocks);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.blocks)).toBe(true);

    input.blocks[0]!.id = "changed-after-parse";
    expect((parsed.blocks[0] as { id: string }).id).toBe("paragraph-1");
  });

  it.each([
    ["bare array", []],
    ["missing blocks", {}],
    ["non-array blocks", { blocks: {} }],
    ["unknown top-level key", { blocks: [], html: "<script>" }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseKnowledgeDocument(value)).toThrow("knowledge document");
  });

  it.each([
    ["undefined", { blocks: [{ value: undefined }] }],
    ["bigint", { blocks: [{ value: 1n }] }],
    ["NaN", { blocks: [{ value: Number.NaN }] }],
    ["infinity", { blocks: [{ value: Number.POSITIVE_INFINITY }] }],
    ["date instance", { blocks: [{ value: new Date("2026-08-20T00:00:00Z") }] }],
  ])("rejects non-JSON %s", (_name, value) => {
    expect(() => parseKnowledgeDocument(value)).toThrow("JSON");
  });

  it("rejects cyclic values and prototype-pollution keys", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parseKnowledgeDocument({ blocks: [cyclic] })).toThrow("cyclic");

    const dangerous = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(dangerous, "__proto__", {
      value: { polluted: true },
      enumerable: true,
    });
    expect(() => parseKnowledgeDocument({ blocks: [dangerous] })).toThrow("unsafe key");
  });

  it("enforces block, depth, node, string, and serialized byte limits", () => {
    expect(() =>
      parseKnowledgeDocument({ blocks: [{}, {}] }, { maxBlocks: 1 }),
    ).toThrow("blocks");

    expect(() =>
      parseKnowledgeDocument({ blocks: [{ child: { child: true } }] }, { maxDepth: 2 }),
    ).toThrow("depth");

    expect(() =>
      parseKnowledgeDocument({ blocks: [{ a: 1, b: 2 }] }, { maxNodes: 3 }),
    ).toThrow("nodes");

    expect(() =>
      parseKnowledgeDocument({ blocks: [{ text: "12345" }] }, { maxStringBytes: 4 }),
    ).toThrow("string");

    expect(() =>
      parseKnowledgeDocument({ blocks: [{ text: "1234567890" }] }, { maxBytes: 12 }),
    ).toThrow("bytes");
  });
});

describe("projectKnowledgeDocumentText", () => {
  it("projects text leaves and wikilink titles in traversal order without identifier noise", () => {
    const text = projectKnowledgeDocumentText(parseKnowledgeDocument(documentBody()));

    expect(text).toBe("账户诊断\n快手投放 SOP\n结论：控制成本");
    expect(text).not.toContain("1f2d1b38");
    expect(text).not.toContain("paragraph-1");
  });

  it("returns null for documents without searchable text", () => {
    expect(projectKnowledgeDocumentText(parseKnowledgeDocument({ blocks: [{ type: "image" }] }))).toBeNull();
  });
});

describe("fingerprintKnowledgeDocument", () => {
  it("is stable across object-key order but sensitive to array and content changes", () => {
    const first = parseKnowledgeDocument({
      blocks: [{ type: "paragraph", props: { b: 2, a: 1 }, content: ["first", "second"] }],
    });
    const reordered = parseKnowledgeDocument({
      blocks: [{ content: ["first", "second"], props: { a: 1, b: 2 }, type: "paragraph" }],
    });
    const changedOrder = parseKnowledgeDocument({
      blocks: [{ type: "paragraph", props: { a: 1, b: 2 }, content: ["second", "first"] }],
    });

    expect(fingerprintKnowledgeDocument(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintKnowledgeDocument(first)).toBe(fingerprintKnowledgeDocument(reordered));
    expect(fingerprintKnowledgeDocument(first)).not.toBe(
      fingerprintKnowledgeDocument(changedOrder),
    );
  });
});
