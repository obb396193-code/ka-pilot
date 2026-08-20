import { describe, expect, it, vi } from "vitest";

import {
  createMaterialTeardownEvidence,
  parseTranscriptTimeline,
} from "@ka/domain";
import {
  TeardownAnalysisError,
  TeardownAnalyzer,
  ClaudeRuntimeStructuredTeardownAgent,
  type StructuredTeardownAgentPort,
} from "../src/materials/teardown-analyzer.js";
import type { ClaudeAgentRuntime } from "../src/agent/sdk/runtime.js";

function evidence() {
  return createMaterialTeardownEvidence({
    media: { contentSha256: "b".repeat(64), durationMs: 3_000, width: 1080, height: 1920 },
    transcript: parseTranscriptTimeline({
      durationMs: 3_000,
      source: "platform_caption",
      segments: [
        { startMs: 0, endMs: 1_000, text: "你是不是也遇到这个问题" },
        { startMs: 1_000, endMs: 3_000, text: "现在告诉你解决办法" },
      ],
    }),
    shots: [
      { startMs: 0, endMs: 1_000, frame: { index: 0, status: "ready", artifactRef: "frames/shot-0000.jpg" } },
      { startMs: 1_000, endMs: 3_000, frame: { index: 1, status: "placeholder", reason: "frame_extract_failed" } },
    ],
    visualSummary: {
      hardCutCount: 1,
      visualEventCount: 2,
      averageShotLengthMs: 1_500,
      hookVisualDensity: 1,
    },
    promptVersion: "teardown-v3",
    schemaVersion: "1",
  });
}

function validOutput() {
  return {
    alignmentStatus: "exact_transcript_timing",
    summary: "用问题开场并给出解决承诺。",
    hook: { kind: "question", text: "问题钩子", evidenceIds: ["transcript-0000"] },
    sellingPoints: [{ text: "提供解决办法", evidenceIds: ["transcript-0001"] }],
    audiences: ["遇到该问题的人群"],
    rhythm: { description: "前段短促，后段承接", evidenceIds: ["shot-0000"] },
    cta: { text: "没有明确行动号召", evidenceIds: ["transcript-0001"] },
    semanticSections: [
      {
        order: 1,
        role: "hook",
        title: "问题开场",
        description: "先提出问题",
        evidenceIds: ["transcript-0000"],
      },
      {
        order: 2,
        role: "body",
        title: "解决承诺",
        description: "随后承诺给出解决办法",
        evidenceIds: ["transcript-0001"],
      },
    ],
    segments: [
      { startMs: 0, endMs: 1_000, role: "hook", description: "提出问题", evidenceIds: ["transcript-0000"] },
      { startMs: 1_000, endMs: 3_000, role: "body", description: "承诺解法", evidenceIds: ["transcript-0001"] },
    ],
    replicationSuggestions: ["复用问题开场结构，不搬运原素材"],
    uncertainties: ["视觉帧尚未授权给模型，无法判断具体画面"],
  };
}

function wholeVideoEvidence() {
  return createMaterialTeardownEvidence({
    media: { contentSha256: "e".repeat(64), durationMs: 3_000, width: 1080, height: 1920 },
    transcript: parseTranscriptTimeline({
      durationMs: 3_000,
      source: "cloud_asr",
      timingPrecision: "whole_video",
      segments: [{ startMs: 0, endMs: 3_000, text: "完整文案包含问题和解决方案" }],
    }),
    shots: [{
      startMs: 0,
      endMs: 3_000,
      frame: { index: 0, status: "placeholder", reason: "frame_extract_failed" },
    }],
    visualSummary: {
      hardCutCount: 0,
      visualEventCount: 0,
      averageShotLengthMs: 3_000,
      hookVisualDensity: 0,
    },
    promptVersion: "teardown-v3",
    schemaVersion: "1",
  });
}

function wholeVideoOutput() {
  return {
    alignmentStatus: "unavailable_whole_video",
    summary: "全文包含问题和解法，但无法逐句定位。",
    hook: { kind: "other", text: "钩子候选位置不确定", evidenceIds: ["transcript-0000"] },
    sellingPoints: [{ text: "提供解决方案", evidenceIds: ["transcript-0000"] }],
    audiences: ["遇到该问题的人群"],
    rhythm: { description: "仅能依据镜头边界", evidenceIds: ["shot-0000"] },
    cta: { text: "全文无明确行动号召", evidenceIds: ["transcript-0000"] },
    semanticSections: [
      {
        order: 1,
        role: "hook",
        title: "问题引入",
        description: "全文先提出问题",
        evidenceIds: ["transcript-0000"],
      },
      {
        order: 2,
        role: "body",
        title: "解决方案",
        description: "全文随后给出解决方案",
        evidenceIds: ["transcript-0000"],
      },
    ],
    segments: [],
    replicationSuggestions: ["复用全文表达逻辑"],
    uncertainties: ["整段转写没有句级时间戳"],
  };
}

function port(output: unknown, model = "model-a"): StructuredTeardownAgentPort {
  return {
    execute: vi.fn(async () => ({
      structuredOutput: output,
      providerId: "provider-a",
      model,
      profileVersion: "c".repeat(64),
    })),
  };
}

describe("TeardownAnalyzer", () => {
  it("passes strict schema and creates a provider-bound analysis fingerprint", async () => {
    const agent = port(validOutput());
    const analyzer = new TeardownAnalyzer(agent);

    const result = await analyzer.analyze(evidence());

    expect(result.result.summary).toContain("问题开场");
    expect(result.analysisFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.visualPayloadStatus).toBe("blocked_pending_trusted_multimodal_provider");
    expect(Object.isFrozen(result)).toBe(true);
    const call = vi.mocked(agent.execute).mock.calls[0]?.[0];
    expect(JSON.stringify(call?.outputJsonSchema)).toContain("evidenceIds");
    expect(call?.prompt).toContain("Evidence fingerprint");
  });

  it("binds cache identity to the selected model", async () => {
    const first = await new TeardownAnalyzer(port(validOutput(), "model-a")).analyze(evidence());
    const second = await new TeardownAnalyzer(port(validOutput(), "model-b")).analyze(evidence());

    expect(second.analysisFingerprint).not.toBe(first.analysisFingerprint);
  });

  it("accepts whole-video semantic sections but rejects fabricated precise segments", async () => {
    await expect(new TeardownAnalyzer(port(wholeVideoOutput())).analyze(wholeVideoEvidence()))
      .resolves.toMatchObject({ result: { semanticSections: [{ order: 1 }, { order: 2 }], segments: [] } });

    await expect(new TeardownAnalyzer(port({
      ...wholeVideoOutput(),
      segments: [{
        startMs: 0,
        endMs: 3_000,
        role: "other",
        description: "伪造时间段",
        evidenceIds: ["transcript-0000"],
      }],
    })).analyze(wholeVideoEvidence())).rejects.toMatchObject({ reason: "invalid_output" });

    await expect(new TeardownAnalyzer(port({
      ...wholeVideoOutput(),
      alignmentStatus: "exact_transcript_timing",
    })).analyze(wholeVideoEvidence())).rejects.toMatchObject({ reason: "invalid_output" });
  });

  it("rejects free-form, unknown fields and invalid evidence references", async () => {
    await expect(new TeardownAnalyzer(port("free text")).analyze(evidence()))
      .rejects.toBeInstanceOf(TeardownAnalysisError);
    await expect(new TeardownAnalyzer(port({ ...validOutput(), gmv: 100 })).analyze(evidence()))
      .rejects.toMatchObject({ reason: "invalid_output" });
    await expect(new TeardownAnalyzer(port({
      ...validOutput(),
      hook: { kind: "question", text: "x", evidenceIds: ["shot-9999"] },
    })).analyze(evidence())).rejects.toMatchObject({ reason: "invalid_output" });
  });

  it("sanitizes agent failures", async () => {
    const analyzer = new TeardownAnalyzer({
      execute: async () => {
        throw new Error("Bearer secret at https://provider.example.com");
      },
    });

    let error: unknown;
    try {
      await analyzer.analyze(evidence());
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ reason: "agent_failed" });
    expect(String(error)).not.toContain("provider.example.com");
  });

  it("adapts the hardened Claude SDK runtime with strict output and zero tools", async () => {
    let capturedInput: Parameters<ClaudeAgentRuntime["execute"]>[0] | undefined;
    const execute: ClaudeAgentRuntime["execute"] = vi.fn(async (input) => {
      capturedInput = input;
      return {
        outcome: "success" as const,
        finalText: "",
        structuredOutput: validOutput(),
        estimatedCostUsd: 0,
        unknownMessageCount: 0,
      };
    });
    const profileVersion = "d".repeat(64);
    const adapter = new ClaudeRuntimeStructuredTeardownAgent({
      runtime: { execute },
      auth: { workspaceId: "workspace-a", userId: "user-a", runId: "run-a" },
      runtimeInput: {
        provider: {
          providerId: "provider-a",
          model: "model-a",
          profileVersion,
          protocol: "anthropic_messages",
        },
        gateway: {
          baseUrl: "http://127.0.0.1:3456",
          clientKey: "local-client-key",
          credentialEnvelope: "kae1.envelope",
          binding: {
            workspaceId: "workspace-a",
            userId: "user-a",
            runId: "run-a",
            providerId: "provider-a",
            model: "model-a",
          },
        },
        cwd: "/private/tmp/ka-agent-cwd",
        home: "/private/tmp/ka-agent-home",
        tmpDir: "/private/tmp/ka-agent-tmp",
        path: "/usr/bin:/bin",
        maxTurns: 3,
        maxBudgetUsd: 0.5,
        timeoutMs: 30_000,
        toolTimeoutMs: 10_000,
      },
    });

    const response = await adapter.execute({
      prompt: "analyze evidence",
      systemPrompt: "strict",
      outputJsonSchema: { type: "object" },
    });

    expect(response).toMatchObject({ providerId: "provider-a", model: "model-a", profileVersion });
    expect(capturedInput?.outputJsonSchema).toEqual({ type: "object" });
    expect(capturedInput?.mcp.allowedToolNames).toEqual([]);
  });
});
