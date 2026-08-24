import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  NodeMediaProcessRunner,
  type MediaProcessResult,
  type MediaProcessRunner,
} from "./media-process-runner.js";

const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
const VISUAL_EVENT_THRESHOLD = 0.15;
const HARD_CUT_THRESHOLD = 0.3;
const HOOK_WINDOW_MS = 30_000;
const MAX_SHOTS = 500;
const MAX_CUT_POINTS = MAX_SHOTS - 1;
const MAX_EXTRACTED_SHOT_FRAMES = 216;
const SHOT_CONTACT_SHEET_SIZE = 36;
const SHOT_CONTACT_SHEET_COLUMNS = 6;
const SHOT_CONTACT_SHEET_CONCURRENCY = 2;
const FRAME_CONCURRENCY = 4;
const PTS_PATTERN = /pts_time:([0-9]+(?:\.[0-9]+)?)/;
const SCENE_PATTERN = /(?:lavfi\.)?scene_score=([0-9]+(?:\.[0-9]+)?)/;

export type FilmAnalyzerFailureReason =
  | "unsafe_path"
  | "probe_failed"
  | "invalid_media"
  | "scene_analysis_failed";

export class FilmAnalyzerError extends Error {
  readonly code = "FILM_ANALYSIS_FAILED";

  constructor(readonly reason: FilmAnalyzerFailureReason) {
    super(`Film analysis failed: ${reason}`);
    this.name = "FilmAnalyzerError";
  }
}

export interface SceneEvent {
  readonly atMs: number;
  readonly score: number;
}

export interface FilmAnalyzerOptions {
  runner?: MediaProcessRunner;
  probeTimeoutMs?: number;
  analysisTimeoutMs?: number;
  frameTimeoutMs?: number;
}

export interface FilmAnalysisResult {
  readonly media: {
    readonly durationMs: number;
    readonly width: number;
    readonly height: number;
  };
  readonly shots: readonly {
    readonly startMs: number;
    readonly endMs: number;
    readonly frame:
      | { readonly index: number; readonly status: "ready"; readonly artifactRef: string }
      | {
        readonly index: number;
        readonly status: "placeholder";
        readonly reason: "frame_extract_failed" | "frame_budget_exceeded";
      };
  }[];
  readonly visualSummary: {
    readonly hardCutCount: number;
    readonly visualEventCount: number;
    readonly averageShotLengthMs: number;
    readonly hookVisualDensity: number;
  };
  readonly cutPointsMs: readonly number[];
  readonly cutPointsTruncated: boolean;
  readonly contactSheets: {
    readonly hook?: string;
    readonly full?: string;
    readonly shots: readonly ShotContactSheet[];
  };
}

export type ShotContactSheet = Readonly<{
  page: number;
  fromShotIndex: number;
  toShotIndex: number;
  frameCount: number;
} & (
  | { status: "ready"; artifactRef: string }
  | { status: "unavailable" }
)>;

export class FilmAnalyzer {
  private readonly runner: MediaProcessRunner;
  private readonly probeTimeoutMs: number;
  private readonly analysisTimeoutMs: number;
  private readonly frameTimeoutMs: number;

  constructor(options: FilmAnalyzerOptions = {}) {
    this.runner = options.runner ?? new NodeMediaProcessRunner();
    this.probeTimeoutMs = positiveInteger(options.probeTimeoutMs ?? 60_000);
    this.analysisTimeoutMs = positiveInteger(options.analysisTimeoutMs ?? 600_000);
    this.frameTimeoutMs = positiveInteger(options.frameTimeoutMs ?? 60_000);
  }

  async analyze(input: {
    readonly mediaPath: string;
    readonly artifactDirectory: string;
  }): Promise<FilmAnalysisResult> {
    const paths = await prepareControlledPaths(input);
    const media = await this.probe(paths.mediaPath);
    const events = await this.sceneEvents(paths.mediaPath, media.durationMs);
    const hardCutEvents = events.filter(({ score }) => score > HARD_CUT_THRESHOLD);
    const allCutPointsMs = normalizedCutPoints(hardCutEvents, media.durationMs);
    const cutPointsMs = allCutPointsMs.slice(0, MAX_CUT_POINTS);
    const boundaries = [0, ...cutPointsMs, media.durationMs];
    const shots = await this.extractShots(paths, boundaries);
    const [summaryContactSheets, shotContactSheets] = await Promise.all([
      this.createContactSheets(paths, media.durationMs),
      this.createShotContactSheets(paths, shots),
    ]);
    const hookEvents = events.filter(({ atMs }) => atMs < Math.min(HOOK_WINDOW_MS, media.durationMs));
    return deepFreeze({
      media,
      shots,
      visualSummary: {
        hardCutCount: hardCutEvents.length,
        visualEventCount: events.length,
        averageShotLengthMs: media.durationMs / shots.length,
        hookVisualDensity: events.length === 0 ? 0 : hookEvents.length / events.length,
      },
      cutPointsMs,
      cutPointsTruncated: allCutPointsMs.length > MAX_CUT_POINTS,
      contactSheets: { ...summaryContactSheets, shots: shotContactSheets },
    });
  }

  private async probe(mediaPath: string): Promise<FilmAnalysisResult["media"]> {
    const result = await this.runner.run({
      binary: "ffprobe",
      args: [
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type,width,height",
        "-of", "json",
        mediaPath,
      ],
      timeoutMs: this.probeTimeoutMs,
      maxOutputBytes: 256 * 1024,
    });
    if (!successful(result)) throw new FilmAnalyzerError("probe_failed");
    return parseProbeOutput(result.stdout);
  }

  private async sceneEvents(mediaPath: string, durationMs: number): Promise<SceneEvent[]> {
    const result = await this.runner.run({
      binary: "ffmpeg",
      args: [
        "-hide_banner", "-nostats", "-i", mediaPath,
        "-vf", `select='gt(scene,${VISUAL_EVENT_THRESHOLD})',metadata=print`,
        "-an", "-f", "null", "-",
      ],
      timeoutMs: this.analysisTimeoutMs,
      maxOutputBytes: 8 * 1024 * 1024,
    });
    if (!successful(result)) throw new FilmAnalyzerError("scene_analysis_failed");
    return deduplicateEvents(parseSceneEvents(result.stderr), durationMs);
  }

  private async extractShots(
    paths: ControlledPaths,
    boundaries: readonly number[],
  ): Promise<FilmAnalysisResult["shots"]> {
    const shots = boundaries.slice(0, -1).map((startMs, index) => ({
      startMs,
      endMs: boundaries[index + 1] as number,
      midpointMs: Math.round((startMs + (boundaries[index + 1] as number)) / 2),
      index,
    }));
    const results = new Array<FilmAnalysisResult["shots"][number]>(shots.length);
    await runWithConcurrency(shots.slice(0, MAX_EXTRACTED_SHOT_FRAMES), FRAME_CONCURRENCY, async (shot) => {
      const filename = `shot-${shot.index.toString().padStart(4, "0")}.jpg`;
      const output = join(paths.framesDirectory, filename);
      const result = await this.runner.run({
        binary: "ffmpeg",
        args: [
          "-hide_banner", "-nostats", "-y",
          "-ss", formatSeconds(shot.midpointMs),
          "-i", paths.mediaPath,
          "-frames:v", "1", "-vf", "scale=256:144", "-an", output,
        ],
        timeoutMs: this.frameTimeoutMs,
        maxOutputBytes: 64 * 1024,
      });
      results[shot.index] = {
        startMs: shot.startMs,
        endMs: shot.endMs,
        frame: successful(result) && await nonemptyRegularFile(output)
          ? { index: shot.index, status: "ready", artifactRef: `frames/${filename}` }
          : { index: shot.index, status: "placeholder", reason: "frame_extract_failed" },
      };
    });
    for (const shot of shots.slice(MAX_EXTRACTED_SHOT_FRAMES)) {
      results[shot.index] = {
        startMs: shot.startMs,
        endMs: shot.endMs,
        frame: { index: shot.index, status: "placeholder", reason: "frame_budget_exceeded" },
      };
    }
    return results;
  }

  private async createContactSheets(
    paths: ControlledPaths,
    durationMs: number,
  ): Promise<{ readonly hook?: string; readonly full?: string }> {
    const hookPath = join(paths.contactDirectory, "contact-hook.jpg");
    const fullPath = join(paths.contactDirectory, "contact-full.jpg");
    const fullInterval = durationMs > 36_000 ? durationMs / 36_000 : 12;
    const [hookReady, fullReady] = await Promise.all([
      this.createContactSheet(paths.mediaPath, hookPath, [
        "-t", "30", "-vf", "fps=1/2,scale=384:216,tile=5x3",
      ]),
      this.createContactSheet(paths.mediaPath, fullPath, [
        "-vf", `fps=1/${formatDecimal(fullInterval)},scale=256:144,tile=6x6`,
      ]),
    ]);
    return {
      ...(hookReady ? { hook: "contact/contact-hook.jpg" } : {}),
      ...(fullReady ? { full: "contact/contact-full.jpg" } : {}),
    };
  }

  private async createContactSheet(
    mediaPath: string,
    output: string,
    filters: readonly string[],
  ): Promise<boolean> {
    const result = await this.runner.run({
      binary: "ffmpeg",
      args: ["-hide_banner", "-nostats", "-y", ...filters.slice(0, -2), "-i", mediaPath,
        ...filters.slice(-2), "-frames:v", "1", "-an", output],
      timeoutMs: this.frameTimeoutMs,
      maxOutputBytes: 64 * 1024,
    });
    return successful(result) && await nonemptyRegularFile(output);
  }

  private async createShotContactSheets(
    paths: ControlledPaths,
    shots: FilmAnalysisResult["shots"],
  ): Promise<readonly ShotContactSheet[]> {
    const pages = chunk(shots, SHOT_CONTACT_SHEET_SIZE);
    const results = new Array<ShotContactSheet>(pages.length);
    await runWithConcurrency(pages.map((pageShots, page) => ({ pageShots, page })),
      SHOT_CONTACT_SHEET_CONCURRENCY, async ({ pageShots, page }) => {
      const filename = `contact-shots-${page.toString().padStart(4, "0")}.jpg`;
      const artifactRef = `contact/${filename}`;
      const output = join(paths.contactDirectory, filename);
      const result = await this.runner.run({
        binary: "ffmpeg",
        args: shotContactSheetArgs(paths, pageShots, output),
        timeoutMs: this.frameTimeoutMs,
        maxOutputBytes: 256 * 1024,
      });
      const metadata = shotContactSheetMetadata(pageShots, page);
      results[page] = successful(result) && await nonemptyRegularFile(output)
        ? { ...metadata, status: "ready" as const, artifactRef }
        : { ...metadata, status: "unavailable" as const };
    });
    return results;
  }
}

function shotContactSheetMetadata(
  shots: FilmAnalysisResult["shots"],
  page: number,
): Omit<ShotContactSheet, "status" | "artifactRef"> {
  const first = shots[0];
  const last = shots.at(-1);
  if (first === undefined || last === undefined) throw new FilmAnalyzerError("invalid_media");
  return {
    page,
    fromShotIndex: first.frame.index,
    toShotIndex: last.frame.index,
    frameCount: shots.length,
  };
}

function shotContactSheetArgs(
  paths: ControlledPaths,
  shots: FilmAnalysisResult["shots"],
  output: string,
): string[] {
  const inputs = shots.flatMap(({ frame }) => frame.status === "ready"
    ? ["-i", join(paths.artifactDirectory, frame.artifactRef)]
    : ["-f", "lavfi", "-i", "color=c=0xd1d5db:s=256x144:d=1:r=1"]);
  const base = ["-hide_banner", "-nostats", "-y", ...inputs];
  if (shots.length === 1) {
    return [...base, "-vf", "scale=256:144", "-frames:v", "1", "-an", output];
  }
  const scales = shots.map((_, index) => `[${index}:v]scale=256:144[s${index}]`).join(";");
  const streams = shots.map((_, index) => `[s${index}]`).join("");
  const layout = shots.map((_, index) => {
    const column = index % SHOT_CONTACT_SHEET_COLUMNS;
    const row = Math.floor(index / SHOT_CONTACT_SHEET_COLUMNS);
    return `${column * 256}_${row * 144}`;
  }).join("|");
  return [
    ...base,
    "-filter_complex", `${scales};${streams}xstack=inputs=${shots.length}:layout=${layout}:fill=0xd1d5db:shortest=1[grid]`,
    "-map", "[grid]", "-frames:v", "1", "-an", output,
  ];
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

export function parseSceneEvents(stderr: string): SceneEvent[] {
  const events: SceneEvent[] = [];
  let pendingAtMs: number | undefined;
  for (const line of stderr.split("\n")) {
    const pts = line.match(PTS_PATTERN)?.[1];
    if (pts !== undefined) {
      const seconds = Number(pts);
      pendingAtMs = Number.isFinite(seconds) ? Math.round(seconds * 1_000) : undefined;
      continue;
    }
    const scoreText = line.match(SCENE_PATTERN)?.[1];
    if (scoreText !== undefined && pendingAtMs !== undefined) {
      const score = Number(scoreText);
      if (Number.isFinite(score) && score >= 0 && score <= 1) {
        events.push({ atMs: pendingAtMs, score });
      }
      pendingAtMs = undefined;
    }
  }
  return events;
}

interface ControlledPaths {
  mediaPath: string;
  artifactDirectory: string;
  framesDirectory: string;
  contactDirectory: string;
}

async function prepareControlledPaths(input: {
  mediaPath: string;
  artifactDirectory: string;
}): Promise<ControlledPaths> {
  if (!isAbsolute(input.mediaPath) || !isAbsolute(input.artifactDirectory)) {
    throw new FilmAnalyzerError("unsafe_path");
  }
  const mediaPath = resolve(input.mediaPath);
  const artifactDirectory = resolve(input.artifactDirectory);
  if (
    basename(artifactDirectory) !== "artifacts" ||
    dirname(artifactDirectory) !== dirname(mediaPath)
  ) {
    throw new FilmAnalyzerError("unsafe_path");
  }
  const mediaStat = await safeLstat(mediaPath);
  if (mediaStat === null || !mediaStat.isFile() || mediaStat.isSymbolicLink()) {
    throw new FilmAnalyzerError("unsafe_path");
  }
  const artifactStat = await safeLstat(artifactDirectory);
  if (artifactStat === null) {
    await mkdir(artifactDirectory, { mode: 0o700 });
  } else if (!artifactStat.isDirectory() || artifactStat.isSymbolicLink()) {
    throw new FilmAnalyzerError("unsafe_path");
  }
  const [realMedia, realArtifacts] = await Promise.all([realpath(mediaPath), realpath(artifactDirectory)]);
  if (dirname(realMedia) !== dirname(realArtifacts)) throw new FilmAnalyzerError("unsafe_path");
  const framesDirectory = await prepareArtifactSubdirectory(realArtifacts, "frames");
  const contactDirectory = await prepareArtifactSubdirectory(realArtifacts, "contact");
  return {
    mediaPath: realMedia,
    artifactDirectory: realArtifacts,
    framesDirectory,
    contactDirectory,
  };
}

async function prepareArtifactSubdirectory(root: string, name: "frames" | "contact"): Promise<string> {
  const path = join(root, name);
  const existing = await safeLstat(path);
  if (existing === null) {
    await mkdir(path, { mode: 0o700 });
  } else if (!existing.isDirectory() || existing.isSymbolicLink()) {
    throw new FilmAnalyzerError("unsafe_path");
  }
  const resolved = await realpath(path);
  if (dirname(resolved) !== root) throw new FilmAnalyzerError("unsafe_path");
  return resolved;
}

function parseProbeOutput(value: string): FilmAnalysisResult["media"] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new FilmAnalyzerError("invalid_media");
  }
  if (!isRecord(parsed) || !isRecord(parsed.format) || !Array.isArray(parsed.streams)) {
    throw new FilmAnalyzerError("invalid_media");
  }
  const durationSeconds = Number(parsed.format.duration);
  const durationMs = Math.round(durationSeconds * 1_000);
  const video = parsed.streams.find((stream) => isRecord(stream) && stream.codec_type === "video");
  if (!isRecord(video)) throw new FilmAnalyzerError("invalid_media");
  const width = video.width;
  const height = video.height;
  if (
    !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS ||
    !Number.isSafeInteger(width) || (width as number) <= 0 || (width as number) > 16_384 ||
    !Number.isSafeInteger(height) || (height as number) <= 0 || (height as number) > 16_384
  ) {
    throw new FilmAnalyzerError("invalid_media");
  }
  return { durationMs, width: width as number, height: height as number };
}

function deduplicateEvents(events: readonly SceneEvent[], durationMs: number): SceneEvent[] {
  const byTime = new Map<number, number>();
  for (const event of events) {
    if (event.atMs <= 0 || event.atMs >= durationMs || event.score <= VISUAL_EVENT_THRESHOLD) continue;
    byTime.set(event.atMs, Math.max(byTime.get(event.atMs) ?? 0, event.score));
  }
  return [...byTime.entries()]
    .sort(([first], [second]) => first - second)
    .map(([atMs, score]) => ({ atMs, score }));
}

function normalizedCutPoints(events: readonly SceneEvent[], durationMs: number): number[] {
  const points: number[] = [];
  let previous = 0;
  for (const event of events) {
    if (event.atMs - previous <= 50 || durationMs - event.atMs <= 50) continue;
    points.push(event.atMs);
    previous = event.atMs;
  }
  return points;
}

function successful(result: MediaProcessResult): boolean {
  return result.exitCode === 0 && !result.timedOut && result.outputTruncated !== true;
}

async function nonemptyRegularFile(path: string): Promise<boolean> {
  const result = await safeLstat(path);
  return result !== null && result.isFile() && !result.isSymbolicLink() && result.size > 0;
}

async function safeLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
}

function formatSeconds(milliseconds: number): string {
  return formatDecimal(milliseconds / 1_000);
}

function formatDecimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error("timeout must be a positive integer");
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
