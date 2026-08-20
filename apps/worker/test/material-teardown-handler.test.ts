import { describe, expect, it, vi } from "vitest";

import {
  fingerprintMaterialTeardownAnalysis,
  resolveTranscriptTimeline,
} from "@ka/domain";
import {
  MaterialTeardownHandler,
  MaterialTeardownHandlerError,
  type TeardownCheckpoint,
  type TeardownCheckpointPort,
} from "../src/materials/teardown-handler.js";
import type { FilmAnalysisResult } from "../src/materials/film-analyzer.js";
import type { MaterialTeardownAnalysis as WorkerAnalysis } from "../src/materials/teardown-analyzer.js";

const profileVersion = "d".repeat(64);
const sourceRef = "qihang/material/source-a";
const candidate = {
  signature: "material-signature",
  materialType: "VIDEO",
  materialUrl: "https://cdn.example.com/a.mp4?token=must-not-escape",
};

class MemoryCheckpoints implements TeardownCheckpointPort {
  readonly values = new Map<string, TeardownCheckpoint>();
  async load(contentSha256: string): Promise<TeardownCheckpoint | null> {
    const value = this.values.get(contentSha256);
    return value === undefined ? null : structuredClone(value);
  }
  async save(contentSha256: string, checkpoint: TeardownCheckpoint): Promise<void> {
    this.values.set(contentSha256, structuredClone(checkpoint));
  }
}

function film(): FilmAnalysisResult {
  return {
    media: { durationMs: 3_000, width: 1080, height: 1920 },
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
    cutPointsMs: [1_000],
    cutPointsTruncated: false,
    contactSheets: { shots: [] },
  };
}

function analysis(evidenceFingerprint: string, model = "model-a"): WorkerAnalysis {
  const analysisFingerprint = fingerprintMaterialTeardownAnalysis({
    evidenceFingerprint,
    promptVersion: "teardown-v3",
    schemaVersion: "1",
    providerId: "provider-a",
    model,
    profileVersion,
  });
  return {
    result: {
      alignmentStatus: "exact_transcript_timing",
      summary: "问题开场并承诺解决方案",
      hook: { kind: "question", text: "问题钩子", evidenceIds: ["transcript-0000"] },
      sellingPoints: [{ text: "解决方案", evidenceIds: ["transcript-0001"] }],
      audiences: ["目标用户"],
      rhythm: { description: "前快后稳", evidenceIds: ["shot-0000"] },
      cta: { text: "无明确 CTA", evidenceIds: ["transcript-0001"] },
      semanticSections: [
        {
          order: 1,
          role: "hook",
          title: "问题开场",
          description: "提出问题",
          evidenceIds: ["transcript-0000"],
        },
        {
          order: 2,
          role: "body",
          title: "解决方案",
          description: "说明解法",
          evidenceIds: ["transcript-0001"],
        },
      ],
      segments: [
        { startMs: 0, endMs: 1_000, role: "hook", description: "问题", evidenceIds: ["transcript-0000"] },
        { startMs: 1_000, endMs: 3_000, role: "body", description: "解法", evidenceIds: ["transcript-0001"] },
      ],
      replicationSuggestions: ["复用结构"],
      uncertainties: ["视觉 payload 未授权"],
    },
    analysisFingerprint,
    evidenceFingerprint,
    promptVersion: "teardown-v3",
    promptTemplateSha256: "a".repeat(64),
    schemaVersion: "1",
    providerId: "provider-a",
    model,
    profileVersion,
    visualPayloadStatus: "blocked_pending_trusted_multimodal_provider",
  };
}

function profile(model = "model-a") {
  return {
    promptVersion: "teardown-v3",
    schemaVersion: "1",
    providerId: "provider-a",
    model,
    profileVersion,
  } as const;
}

function setup(options: { model?: string; platformSegments?: unknown } = {}) {
  let leaseSequence = 0;
  const release = vi.fn(async () => undefined);
  const urlLease = {
    acquire: vi.fn(async () => ({
      ...candidate,
      materialUrl: `https://cdn.example.com/a.mp4?token=lease-${++leaseSequence}`,
    })),
  };
  const downloader = {
    download: vi.fn(async (_candidate: typeof candidate) => {
      void _candidate;
      return {
        path: "/private/tmp/task/source.media",
        contentSha256: "b".repeat(64),
        byteLength: 100,
        contentType: "video/mp4",
        requiresContainerValidation: false,
        release,
      };
    }),
  };
  const filmAnalyzer = { analyze: vi.fn(async () => film()) };
  const cloudAsr = { transcribe: vi.fn(async () => [
    { startMs: 0, endMs: 1_000, text: "你是不是也有这个问题" },
    { startMs: 1_000, endMs: 3_000, text: "这里给你一个解决方案" },
  ]) };
  const transcriptResolver = {
    resolve: vi.fn(async (input: {
      durationMs: number;
      mediaContentSha256: string;
      mediaHandle: string;
      platformSegments?: unknown;
    }) => resolveTranscriptTimeline({ ...input, cloudAsr })),
  };
  const model = options.model ?? "model-a";
  const analyzer = {
    analyze: vi.fn(async (evidence: { fingerprint: string }) => analysis(evidence.fingerprint, model)),
  };
  const checkpoints = new MemoryCheckpoints();
  const handler = new MaterialTeardownHandler({
    urlLease,
    downloader,
    filmAnalyzer,
    transcriptResolver,
    analyzer,
    checkpoints,
  });
  return {
    handler,
    urlLease,
    downloader,
    filmAnalyzer,
    transcriptResolver,
    cloudAsr,
    analyzer,
    checkpoints,
    release,
    input: {
      sourceRef,
      ...(options.platformSegments === undefined ? {} : { platformSegments: options.platformSegments }),
      analysisProfile: profile(model),
    },
  };
}

describe("MaterialTeardownHandler", () => {
  it("runs download, film, transcript, evidence and analysis with guaranteed cleanup", async () => {
    const subject = setup({
      platformSegments: [
        { startMs: 0, endMs: 1_000, text: "平台字幕开场" },
        { startMs: 1_000, endMs: 3_000, text: "平台字幕正文" },
      ],
    });

    const result = await subject.handler.handle(subject.input);

    expect(result.outcome).toBe("completed");
    expect(result.reusedAnalysis).toBe(false);
    expect(subject.cloudAsr.transcribe).not.toHaveBeenCalled();
    expect(subject.urlLease.acquire).toHaveBeenCalledOnce();
    expect(subject.urlLease.acquire).toHaveBeenCalledWith(sourceRef);
    expect(subject.urlLease.acquire.mock.invocationCallOrder[0])
      .toBeLessThan(subject.downloader.download.mock.invocationCallOrder[0] ?? 0);
    expect(subject.release).toHaveBeenCalledOnce();
    expect(subject.checkpoints.values.size).toBe(1);
  });

  it("reuses transcript, film and analysis checkpoints after re-download", async () => {
    const subject = setup();

    const first = await subject.handler.handle(subject.input);
    const second = await subject.handler.handle(subject.input);

    expect(first.reusedAnalysis).toBe(false);
    expect(second.reusedAnalysis).toBe(true);
    expect(subject.urlLease.acquire).toHaveBeenCalledTimes(2);
    expect(subject.downloader.download).toHaveBeenCalledTimes(2);
    const firstUrl = subject.downloader.download.mock.calls[0]?.[0].materialUrl;
    const secondUrl = subject.downloader.download.mock.calls[1]?.[0].materialUrl;
    expect(secondUrl).not.toBe(firstUrl);
    expect(subject.filmAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(subject.cloudAsr.transcribe).toHaveBeenCalledOnce();
    expect(subject.analyzer.analyze).toHaveBeenCalledOnce();
    expect(subject.release).toHaveBeenCalledTimes(2);
  });

  it("reuses deterministic stages but reruns analysis when the selected model changes", async () => {
    const subject = setup();
    await subject.handler.handle(subject.input);
    const changedAnalyzer = {
      analyze: vi.fn(async (evidence: { fingerprint: string }) => analysis(evidence.fingerprint, "model-b")),
    };
    const changed = new MaterialTeardownHandler({
      urlLease: subject.urlLease,
      downloader: subject.downloader,
      filmAnalyzer: subject.filmAnalyzer,
      transcriptResolver: subject.transcriptResolver,
      analyzer: changedAnalyzer,
      checkpoints: subject.checkpoints,
    });

    const result = await changed.handle({ ...subject.input, analysisProfile: profile("model-b") });

    expect(result.reusedAnalysis).toBe(false);
    expect(subject.filmAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(subject.cloudAsr.transcribe).toHaveBeenCalledOnce();
    expect(changedAnalyzer.analyze).toHaveBeenCalledOnce();
  });

  it("persists film before cloud ASR failure so retry does not repeat FFmpeg", async () => {
    const subject = setup();
    subject.cloudAsr.transcribe.mockRejectedValueOnce(new Error("Bearer secret"));

    await expect(subject.handler.handle(subject.input)).rejects.toBeInstanceOf(MaterialTeardownHandlerError);
    await subject.handler.handle(subject.input);

    expect(subject.filmAnalyzer.analyze).toHaveBeenCalledOnce();
    expect(subject.cloudAsr.transcribe).toHaveBeenCalledTimes(2);
    expect(subject.release).toHaveBeenCalledTimes(2);
    expect(subject.urlLease.acquire).toHaveBeenCalledTimes(2);
  });

  it("always releases media and sanitizes downstream failures", async () => {
    const subject = setup();
    subject.filmAnalyzer.analyze.mockRejectedValueOnce(
      new Error(`failed ${candidate.materialUrl} Bearer secret`),
    );

    let error: unknown;
    try {
      await subject.handler.handle(subject.input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MaterialTeardownHandlerError);
    expect(String(error)).not.toContain("cdn.example.com");
    expect(String(error)).not.toContain("Bearer secret");
    expect(subject.release).toHaveBeenCalledOnce();
  });

  it("does not accept analysis metadata that differs from the routed profile", async () => {
    const subject = setup();
    subject.analyzer.analyze.mockImplementationOnce(async (evidence) => analysis(evidence.fingerprint, "model-b"));

    await expect(subject.handler.handle(subject.input)).rejects.toMatchObject({
      reason: "analysis_identity_mismatch",
    });
    expect(subject.release).toHaveBeenCalledOnce();
  });

  it("rejects URL-shaped or invalid source refs before acquiring a lease", async () => {
    const subject = setup();

    await expect(subject.handler.handle({
      ...subject.input,
      sourceRef: "https://cdn.example.com/a.mp4?token=secret",
    })).rejects.toMatchObject({ reason: "invalid_source_ref" });
    expect(subject.urlLease.acquire).not.toHaveBeenCalled();
    expect(subject.downloader.download).not.toHaveBeenCalled();
  });

  it("does not persist the leased candidate or signed URL in checkpoints", async () => {
    const subject = setup();

    await subject.handler.handle(subject.input);

    const serialized = JSON.stringify([...subject.checkpoints.values.values()]);
    expect(serialized).not.toContain("materialUrl");
    expect(serialized).not.toContain("lease-");
    expect(serialized).not.toContain("candidate");
  });

  it("sanitizes lease failures and stops before download or checkpoint writes", async () => {
    const subject = setup();
    subject.urlLease.acquire.mockRejectedValueOnce(
      new Error("failed https://cdn.example.com/a.mp4?token=secret"),
    );

    let error: unknown;
    try {
      await subject.handler.handle(subject.input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ reason: "pipeline_failed" });
    expect(String(error)).not.toContain("cdn.example.com");
    expect(String(error)).not.toContain("secret");
    expect(subject.downloader.download).not.toHaveBeenCalled();
    expect(subject.checkpoints.values.size).toBe(0);
  });
});
