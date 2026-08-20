import {
  createMaterialTeardownEvidence,
  fingerprintMaterialTeardownAnalysis,
  parseMaterialTeardownResult,
  type MaterialTeardownEvidence,
  type TranscriptTimeline,
} from "@ka/domain";
import { dirname, join } from "node:path";

import type { MaterialSourceCandidate } from "../sources/material-source-probe.js";
import type { DownloadedMaterialHandle } from "./download-service.js";
import type { FilmAnalysisResult } from "./film-analyzer.js";
import type { MaterialTeardownAnalysis } from "./teardown-analyzer.js";

const SAFE_SHA256 = /^[a-f0-9]{64}$/;

export interface MaterialDownloaderPort {
  download(candidate: MaterialSourceCandidate): Promise<DownloadedMaterialHandle>;
}

export interface FilmAnalyzerPort {
  analyze(input: { mediaPath: string; artifactDirectory: string }): Promise<FilmAnalysisResult>;
}

export interface TranscriptResolverPort {
  resolve(input: {
    durationMs: number;
    mediaContentSha256: string;
    mediaHandle: string;
    platformSegments?: unknown;
  }): Promise<TranscriptTimeline>;
}

export interface TeardownAnalyzerPort {
  analyze(evidence: MaterialTeardownEvidence): Promise<MaterialTeardownAnalysis>;
}

export interface TeardownCheckpoint {
  film?: FilmAnalysisResult | undefined;
  transcript?: TranscriptTimeline | undefined;
  evidence?: MaterialTeardownEvidence | undefined;
  analysis?: MaterialTeardownAnalysis | undefined;
}

export interface TeardownCheckpointPort {
  load(contentSha256: string): Promise<TeardownCheckpoint | null>;
  save(contentSha256: string, checkpoint: TeardownCheckpoint): Promise<void>;
}

export interface TeardownAnalysisProfile {
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly providerId: string;
  readonly model: string;
  readonly profileVersion: string;
}

export class MaterialTeardownHandlerError extends Error {
  constructor(readonly reason:
    | "pipeline_failed"
    | "cleanup_failed"
    | "invalid_checkpoint"
    | "analysis_identity_mismatch") {
    super(`Material teardown pipeline failed: ${reason}`);
    this.name = "MaterialTeardownHandlerError";
  }
}

export class MaterialTeardownHandler {
  constructor(private readonly ports: {
    downloader: MaterialDownloaderPort;
    filmAnalyzer: FilmAnalyzerPort;
    transcriptResolver: TranscriptResolverPort;
    analyzer: TeardownAnalyzerPort;
    checkpoints: TeardownCheckpointPort;
  }) {}

  async handle(input: {
    readonly candidate: MaterialSourceCandidate;
    readonly platformSegments?: unknown;
    readonly analysisProfile: TeardownAnalysisProfile;
  }): Promise<{
    readonly outcome: "completed";
    readonly analysis: MaterialTeardownAnalysis;
    readonly reusedAnalysis: boolean;
  }> {
    let media: DownloadedMaterialHandle | undefined;
    let output: {
      readonly outcome: "completed";
      readonly analysis: MaterialTeardownAnalysis;
      readonly reusedAnalysis: boolean;
    } | undefined;
    let failure: MaterialTeardownHandlerError | undefined;
    try {
      media = await this.ports.downloader.download(input.candidate);
      output = await this.executeWithMedia(input, media);
    } catch (error) {
      failure = error instanceof MaterialTeardownHandlerError
        ? error
        : new MaterialTeardownHandlerError("pipeline_failed");
    }
    if (media !== undefined) {
      try {
        await media.release();
      } catch {
        failure ??= new MaterialTeardownHandlerError("cleanup_failed");
      }
    }
    if (failure !== undefined) throw failure;
    if (output === undefined) throw new MaterialTeardownHandlerError("pipeline_failed");
    return output;
  }

  private async executeWithMedia(
    input: {
      readonly candidate: MaterialSourceCandidate;
      readonly platformSegments?: unknown;
      readonly analysisProfile: TeardownAnalysisProfile;
    },
    media: DownloadedMaterialHandle,
  ): Promise<{
    readonly outcome: "completed";
    readonly analysis: MaterialTeardownAnalysis;
    readonly reusedAnalysis: boolean;
  }> {
    const checkpoint = await this.loadCheckpoint(media.contentSha256);
    const film = checkpoint.film ?? await this.runAndSaveFilm(media, checkpoint);
    const transcript = checkpoint.transcript ?? await this.runAndSaveTranscript({
      media,
      film,
      checkpoint,
      ...(input.platformSegments === undefined ? {} : { platformSegments: input.platformSegments }),
    });
    const evidence = buildEvidence(media.contentSha256, film, transcript, input.analysisProfile);
    checkpoint.film = film;
    checkpoint.transcript = transcript;
    checkpoint.evidence = evidence;
    await this.ports.checkpoints.save(media.contentSha256, checkpoint);

    if (checkpoint.analysis !== undefined && reusableAnalysis(
      checkpoint.analysis,
      evidence,
      input.analysisProfile,
    )) {
      return { outcome: "completed", analysis: checkpoint.analysis, reusedAnalysis: true };
    }
    const analysis = await this.ports.analyzer.analyze(evidence);
    if (!reusableAnalysis(analysis, evidence, input.analysisProfile)) {
      throw new MaterialTeardownHandlerError("analysis_identity_mismatch");
    }
    checkpoint.analysis = analysis;
    await this.ports.checkpoints.save(media.contentSha256, checkpoint);
    return { outcome: "completed", analysis, reusedAnalysis: false };
  }

  private async loadCheckpoint(contentSha256: string): Promise<TeardownCheckpoint> {
    if (!SAFE_SHA256.test(contentSha256)) {
      throw new MaterialTeardownHandlerError("pipeline_failed");
    }
    const value = await this.ports.checkpoints.load(contentSha256);
    if (value === null) return {};
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new MaterialTeardownHandlerError("invalid_checkpoint");
    }
    return value;
  }

  private async runAndSaveFilm(
    media: DownloadedMaterialHandle,
    checkpoint: TeardownCheckpoint,
  ): Promise<FilmAnalysisResult> {
    const film = await this.ports.filmAnalyzer.analyze({
      mediaPath: media.path,
      artifactDirectory: join(dirname(media.path), "artifacts"),
    });
    checkpoint.film = film;
    await this.ports.checkpoints.save(media.contentSha256, checkpoint);
    return film;
  }

  private async runAndSaveTranscript(input: {
    media: DownloadedMaterialHandle;
    film: FilmAnalysisResult;
    checkpoint: TeardownCheckpoint;
    platformSegments?: unknown;
  }): Promise<TranscriptTimeline> {
    const transcript = await this.ports.transcriptResolver.resolve({
      durationMs: input.film.media.durationMs,
      mediaContentSha256: input.media.contentSha256,
      mediaHandle: input.media.path,
      ...(input.platformSegments === undefined ? {} : { platformSegments: input.platformSegments }),
    });
    input.checkpoint.transcript = transcript;
    await this.ports.checkpoints.save(input.media.contentSha256, input.checkpoint);
    return transcript;
  }
}

function buildEvidence(
  contentSha256: string,
  film: FilmAnalysisResult,
  transcript: TranscriptTimeline,
  profile: TeardownAnalysisProfile,
): MaterialTeardownEvidence {
  try {
    return createMaterialTeardownEvidence({
      media: { contentSha256, ...film.media },
      transcript,
      shots: film.shots,
      visualSummary: film.visualSummary,
      promptVersion: profile.promptVersion,
      schemaVersion: profile.schemaVersion,
    });
  } catch {
    throw new MaterialTeardownHandlerError("invalid_checkpoint");
  }
}

function reusableAnalysis(
  analysis: MaterialTeardownAnalysis,
  evidence: MaterialTeardownEvidence,
  profile: TeardownAnalysisProfile,
): boolean {
  if (
    analysis.evidenceFingerprint !== evidence.fingerprint ||
    analysis.promptVersion !== profile.promptVersion ||
    analysis.schemaVersion !== profile.schemaVersion ||
    analysis.providerId !== profile.providerId ||
    analysis.model !== profile.model ||
    analysis.profileVersion !== profile.profileVersion ||
    analysis.visualPayloadStatus !== "blocked_pending_trusted_multimodal_provider" ||
    !SAFE_SHA256.test(analysis.promptTemplateSha256)
  ) {
    return false;
  }
  try {
    parseMaterialTeardownResult(analysis.result, evidence);
    return analysis.analysisFingerprint === fingerprintMaterialTeardownAnalysis({
      evidenceFingerprint: evidence.fingerprint,
      promptVersion: analysis.promptVersion,
      schemaVersion: analysis.schemaVersion,
      providerId: analysis.providerId,
      model: analysis.model,
      profileVersion: analysis.profileVersion,
    });
  } catch {
    return false;
  }
}
