import { describe, expect, it } from "vitest";

import {
  MaterialTeardownError,
  createMaterialTeardownEvidence,
  fingerprintMaterialTeardownAnalysis,
  materialTeardownJsonSchema,
  parseMaterialTeardownResult,
} from "../src/material-teardown.js";
import { parseTranscriptTimeline } from "../src/material-transcript.js";

const sha = "b".repeat(64);

function transcript() {
  return parseTranscriptTimeline({
    durationMs: 3_000,
    source: "platform_caption",
    segments: [
      { startMs: 0, endMs: 1_000, text: "前三秒钩子" },
      { startMs: 1_000, endMs: 3_000, text: "卖点与行动号召" },
    ],
  });
}

function evidenceInput() {
  return {
    media: { contentSha256: sha, durationMs: 3_000, width: 1080, height: 1920 },
    transcript: transcript(),
    shots: [
      {
        startMs: 0,
        endMs: 1_000,
        frame: { index: 0, status: "ready", artifactRef: "frames/shot-0000.jpg" },
      },
      {
        startMs: 1_000,
        endMs: 3_000,
        frame: { index: 1, status: "placeholder", reason: "frame_extract_failed" },
      },
    ],
    visualSummary: {
      hardCutCount: 1,
      visualEventCount: 2,
      averageShotLengthMs: 1_500,
      hookVisualDensity: 0.5,
    },
    promptVersion: "teardown-v1",
    schemaVersion: "1",
  } as const;
}

function validResult(evidenceIds: string[]) {
  return {
    summary: "素材用问题开场，并用利益点承接。",
    hook: {
      kind: "question",
      text: "用问题建立注意力",
      evidenceIds: [evidenceIds[0]],
    },
    sellingPoints: [
      { text: "突出核心利益点", evidenceIds: [evidenceIds[1]] },
    ],
    audiences: ["目标用户"],
    rhythm: {
      description: "前快后稳",
      evidenceIds: [evidenceIds[2]],
    },
    cta: {
      text: "立即行动",
      evidenceIds: [evidenceIds[1]],
    },
    segments: [
      {
        startMs: 0,
        endMs: 1_000,
        role: "hook",
        description: "问题钩子",
        evidenceIds: [evidenceIds[0], evidenceIds[2]],
      },
      {
        startMs: 1_000,
        endMs: 3_000,
        role: "body",
        description: "卖点和 CTA",
        evidenceIds: [evidenceIds[1], evidenceIds[3]],
      },
    ],
    replicationSuggestions: ["保留问题开场并替换具体利益点"],
    uncertainties: ["第二镜头代表帧提取失败"],
  };
}

describe("material teardown evidence", () => {
  it("builds stable transcript and shot evidence while preserving placeholder indices", () => {
    const result = createMaterialTeardownEvidence(evidenceInput());

    expect(result.transcriptEvidence.map((item) => item.id)).toEqual(["transcript-0000", "transcript-0001"]);
    expect(result.shotEvidence.map((item) => item.id)).toEqual(["shot-0000", "shot-0001"]);
    expect(result.shotEvidence[1]?.frame).toEqual({
      index: 1,
      status: "placeholder",
      reason: "frame_extract_failed",
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.shotEvidence)).toBe(true);
  });

  it("is insensitive to object key order but preserves timeline order", () => {
    const first = createMaterialTeardownEvidence(evidenceInput());
    const input = evidenceInput();
    const second = createMaterialTeardownEvidence({
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      visualSummary: input.visualSummary,
      shots: input.shots,
      transcript: input.transcript,
      media: input.media,
    });

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it.each([
    ["gap", [
      { startMs: 0, endMs: 900, frame: { index: 0, status: "ready", artifactRef: "frames/a.jpg" } },
      { startMs: 1_000, endMs: 3_000, frame: { index: 1, status: "ready", artifactRef: "frames/b.jpg" } },
    ]],
    ["wrong frame index", [
      { startMs: 0, endMs: 1_000, frame: { index: 9, status: "ready", artifactRef: "frames/a.jpg" } },
      { startMs: 1_000, endMs: 3_000, frame: { index: 1, status: "ready", artifactRef: "frames/b.jpg" } },
    ]],
    ["duration overflow", [
      { startMs: 0, endMs: 1_000, frame: { index: 0, status: "ready", artifactRef: "frames/a.jpg" } },
      { startMs: 1_000, endMs: 3_001, frame: { index: 1, status: "ready", artifactRef: "frames/b.jpg" } },
    ]],
  ])("rejects invalid shot timelines: %s", (_label, shots) => {
    expect(() => createMaterialTeardownEvidence({
      ...evidenceInput(),
      shots,
    })).toThrow(MaterialTeardownError);
  });

  it("rejects unsafe artifact refs and oversized shot collections", () => {
    expect(() => createMaterialTeardownEvidence({
      ...evidenceInput(),
      shots: [
        { startMs: 0, endMs: 3_000, frame: { index: 0, status: "ready", artifactRef: "../secret.jpg" } },
      ],
    })).toThrow(MaterialTeardownError);

    const shots = Array.from({ length: 501 }, (_, index) => ({
      startMs: index,
      endMs: index + 1,
      frame: { index, status: "placeholder", reason: "frame_extract_failed" },
    }));
    expect(() => createMaterialTeardownEvidence({
      ...evidenceInput(),
      media: { ...evidenceInput().media, durationMs: 501 },
      transcript: parseTranscriptTimeline({
        durationMs: 501,
        source: "platform_caption",
        segments: [{ startMs: 0, endMs: 501, text: "x" }],
      }),
      shots,
    })).toThrow(MaterialTeardownError);
  });

  it("parses a strict result and verifies every evidence reference", () => {
    const evidence = createMaterialTeardownEvidence(evidenceInput());
    const ids = [
      ...evidence.transcriptEvidence.map(({ id }) => id),
      ...evidence.shotEvidence.map(({ id }) => id),
    ];

    const result = parseMaterialTeardownResult(validResult(ids), evidence);

    expect(result.summary).toContain("问题开场");
    expect(result.segments).toHaveLength(2);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(["gmv", "conversionRate", "completionRate"])(
    "rejects unsupported inferred metric %s",
    (metric) => {
      const evidence = createMaterialTeardownEvidence(evidenceInput());
      const ids = [
        ...evidence.transcriptEvidence.map(({ id }) => id),
        ...evidence.shotEvidence.map(({ id }) => id),
      ];
      expect(() => parseMaterialTeardownResult({
        ...validResult(ids),
        [metric]: 1,
      }, evidence)).toThrow(MaterialTeardownError);
    },
  );

  it("rejects unknown evidence ids and invalid segment coverage", () => {
    const evidence = createMaterialTeardownEvidence(evidenceInput());
    const ids = [
      ...evidence.transcriptEvidence.map(({ id }) => id),
      ...evidence.shotEvidence.map(({ id }) => id),
    ];

    expect(() => parseMaterialTeardownResult({
      ...validResult(ids),
      hook: { kind: "question", text: "x", evidenceIds: ["unknown-id"] },
    }, evidence)).toThrow(MaterialTeardownError);

    expect(() => parseMaterialTeardownResult({
      ...validResult(ids),
      segments: [{
        startMs: 1,
        endMs: 3_000,
        role: "body",
        description: "not full coverage",
        evidenceIds: [ids[0]],
      }],
    }, evidence)).toThrow(MaterialTeardownError);
  });

  it("exports a strict JSON schema without unsupported business metrics", () => {
    const schema = JSON.stringify(materialTeardownJsonSchema());
    expect(schema).toContain("segments");
    expect(schema).toContain("evidenceIds");
    expect(schema).not.toContain("gmv");
    expect(schema).not.toContain("conversionRate");
  });

  it("binds analysis fingerprints to evidence, prompt, schema and provider versions", () => {
    const base = {
      evidenceFingerprint: "c".repeat(64),
      promptVersion: "teardown-v1",
      schemaVersion: "1",
      providerId: "provider-a",
      model: "model-a",
      profileVersion: "d".repeat(64),
    };
    const first = fingerprintMaterialTeardownAnalysis(base);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintMaterialTeardownAnalysis({ ...base })).toBe(first);
    expect(fingerprintMaterialTeardownAnalysis({ ...base, model: "model-b" })).not.toBe(first);
  });
});

