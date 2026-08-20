import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FilmAnalyzer,
  FilmAnalyzerError,
  parseSceneEvents,
} from "../src/materials/film-analyzer.js";
import type {
  MediaProcessInvocation,
  MediaProcessResult,
  MediaProcessRunner,
} from "../src/materials/media-process-runner.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<{ root: string; mediaPath: string; artifactDirectory: string }> {
  const root = await mkdtemp(join(tmpdir(), "ka-film-test-"));
  roots.push(root);
  const mediaPath = join(root, "source.media");
  await writeFile(mediaPath, "fake-media");
  return { root, mediaPath, artifactDirectory: join(root, "artifacts") };
}

class FakeRunner implements MediaProcessRunner {
  readonly calls: MediaProcessInvocation[] = [];
  failFrameIndex: number | undefined;
  failContactPage: number | undefined;
  activeContactSheets = 0;
  maxActiveContactSheets = 0;
  probe = {
    format: { duration: "3.000000" },
    streams: [{ codec_type: "video", width: 1080, height: 1920 }],
  };
  sceneStderr = [
    "frame:0 pts_time:0.500",
    "lavfi.scene_score=0.200000",
    "frame:1 pts_time:1.000",
    "lavfi.scene_score=0.450000",
    "frame:2 pts_time:2.000",
    "lavfi.scene_score=0.900000",
  ].join("\n");

  async run(invocation: MediaProcessInvocation): Promise<MediaProcessResult> {
    this.calls.push(invocation);
    if (invocation.binary === "ffprobe") {
      return { exitCode: 0, stdout: JSON.stringify(this.probe), stderr: "", timedOut: false };
    }
    if (invocation.args.includes("-f") && invocation.args.includes("null")) {
      return { exitCode: 0, stdout: "", stderr: this.sceneStderr, timedOut: false };
    }
    const output = invocation.args.at(-1);
    if (output === undefined) throw new Error("missing output");
    const match = output.match(/shot-(\d{4})\.jpg$/);
    if (match?.[1] !== undefined && Number(match[1]) === this.failFrameIndex) {
      return { exitCode: 1, stdout: "", stderr: "signed-url-must-not-escape", timedOut: false };
    }
    const pageMatch = output.match(/contact-shots-(\d{4})\.jpg$/);
    if (pageMatch?.[1] !== undefined) {
      this.activeContactSheets += 1;
      this.maxActiveContactSheets = Math.max(this.maxActiveContactSheets, this.activeContactSheets);
      await new Promise((resolve) => setTimeout(resolve, 2));
      this.activeContactSheets -= 1;
      if (Number(pageMatch[1]) === this.failContactPage) {
        return { exitCode: 1, stdout: "", stderr: "page-failed", timedOut: false };
      }
    }
    await writeFile(output, "image");
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
  }
}

describe("parseSceneEvents", () => {
  it("pairs ordered pts and scene scores while ignoring malformed lines", () => {
    expect(parseSceneEvents([
      "frame:0 pts_time:0.25",
      "lavfi.scene_score=0.16",
      "garbage",
      "frame:1 pts_time:1.5",
      "lavfi.scene_score=0.42",
    ].join("\n"))).toEqual([
      { atMs: 250, score: 0.16 },
      { atMs: 1500, score: 0.42 },
    ]);
  });
});

describe("FilmAnalyzer", () => {
  it("probes a real video container, derives cuts and extracts midpoint evidence", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.failFrameIndex = 1;
    const analyzer = new FilmAnalyzer({ runner });

    const result = await analyzer.analyze(paths);

    expect(result.media).toEqual({ durationMs: 3000, width: 1080, height: 1920 });
    expect(result.cutPointsMs).toEqual([1000, 2000]);
    expect(result.shots).toHaveLength(3);
    expect(result.shots.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 3000],
    ]);
    expect(result.shots[0]?.frame).toEqual({
      index: 0,
      status: "ready",
      artifactRef: "frames/shot-0000.jpg",
    });
    expect(result.shots[1]?.frame).toEqual({
      index: 1,
      status: "placeholder",
      reason: "frame_extract_failed",
    });
    expect(result.visualSummary).toEqual({
      hardCutCount: 2,
      visualEventCount: 3,
      averageShotLengthMs: 1000,
      hookVisualDensity: 1,
    });
    expect(result.contactSheets).toEqual({
      hook: "contact/contact-hook.jpg",
      full: "contact/contact-full.jpg",
      shots: [{
        page: 0,
        fromShotIndex: 0,
        toShotIndex: 2,
        frameCount: 3,
        status: "ready",
        artifactRef: "contact/contact-shots-0000.jpg",
      }],
    });
    const shotSheet = runner.calls.find((call) => call.args.at(-1)?.endsWith("contact-shots-0000.jpg"));
    expect(shotSheet?.args.join(" ")).toContain("xstack=inputs=3");
    expect(shotSheet?.args.join(" ")).toContain("color=c=0xd1d5db");
  });

  it("uses the ContentRadar thresholds and fixed frame budgets", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    const analyzer = new FilmAnalyzer({ runner });

    await analyzer.analyze(paths);

    const scene = runner.calls.find((call) => call.args.includes("null"));
    expect(scene?.binary).toBe("ffmpeg");
    expect(scene?.args).toContain("select='gt(scene,0.15)',metadata=print");
    const hook = runner.calls.find((call) => call.args.at(-1)?.endsWith("contact-hook.jpg"));
    expect(hook?.args).toContain("fps=1/2,scale=384:216,tile=5x3");
    const full = runner.calls.find((call) => call.args.at(-1)?.endsWith("contact-full.jpg"));
    expect(full?.args).toContain("fps=1/12,scale=256:144,tile=6x6");
    expect(runner.calls.every((call) => Array.isArray(call.args))).toBe(true);
  });

  it("caps extracted shot frames at 216 and preserves later indices as placeholders", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.probe.format.duration = "300";
    runner.sceneStderr = Array.from({ length: 250 }, (_, index) => [
      `frame:${index} pts_time:${index + 1}`,
      "lavfi.scene_score=0.8",
    ].join("\n")).join("\n");
    const analyzer = new FilmAnalyzer({ runner });

    const result = await analyzer.analyze(paths);

    expect(result.shots).toHaveLength(251);
    expect(result.shots[215]?.frame.status).toBe("ready");
    expect(result.shots[216]?.frame).toEqual({
      index: 216,
      status: "placeholder",
      reason: "frame_budget_exceeded",
    });
    const shotCommands = runner.calls.filter((call) => call.args.at(-1)?.includes("/frames/shot-"));
    expect(shotCommands).toHaveLength(216);
    expect(result.contactSheets.shots).toHaveLength(7);
    expect(result.contactSheets.shots[0]).toMatchObject({
      page: 0,
      fromShotIndex: 0,
      toShotIndex: 35,
      frameCount: 36,
      status: "ready",
    });
    expect(result.contactSheets.shots.at(-1)).toMatchObject({
      page: 6,
      fromShotIndex: 216,
      toShotIndex: 250,
      frameCount: 35,
      status: "ready",
    });
    expect(runner.maxActiveContactSheets).toBeLessThanOrEqual(2);
  });

  it("degrades one failed shot contact page without shifting later page metadata", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.probe.format.duration = "40";
    runner.sceneStderr = Array.from({ length: 36 }, (_, index) => [
      `frame:${index} pts_time:${index + 1}`,
      "lavfi.scene_score=0.8",
    ].join("\n")).join("\n");
    runner.failContactPage = 0;
    const analyzer = new FilmAnalyzer({ runner });

    const result = await analyzer.analyze(paths);

    expect(result.contactSheets.shots).toEqual([
      { page: 0, fromShotIndex: 0, toShotIndex: 35, frameCount: 36, status: "unavailable" },
      {
        page: 1,
        fromShotIndex: 36,
        toShotIndex: 36,
        frameCount: 1,
        status: "ready",
        artifactRef: "contact/contact-shots-0001.jpg",
      },
    ]);
  });

  it("caps pathological cut collections without breaking full timeline coverage", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.probe.format.duration = "1000";
    runner.sceneStderr = Array.from({ length: 700 }, (_, index) => [
      `frame:${index} pts_time:${index + 1}`,
      "lavfi.scene_score=0.8",
    ].join("\n")).join("\n");
    const analyzer = new FilmAnalyzer({ runner });

    const result = await analyzer.analyze(paths);

    expect(result.cutPointsMs).toHaveLength(499);
    expect(result.cutPointsTruncated).toBe(true);
    expect(result.shots).toHaveLength(500);
    expect(result.shots.at(-1)?.endMs).toBe(1_000_000);
  });

  it.each([
    ["no video stream", { format: { duration: "3" }, streams: [{ codec_type: "audio" }] }],
    ["zero duration", { format: { duration: "0" }, streams: [{ codec_type: "video", width: 1, height: 1 }] }],
    ["oversized duration", { format: { duration: "999999" }, streams: [{ codec_type: "video", width: 1, height: 1 }] }],
  ])("rejects invalid media: %s", async (_label, probe) => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.probe = probe as typeof runner.probe;
    const analyzer = new FilmAnalyzer({ runner });

    await expect(analyzer.analyze(paths)).rejects.toBeInstanceOf(FilmAnalyzerError);
    expect(runner.calls.filter((call) => call.binary === "ffmpeg")).toHaveLength(0);
  });

  it("rejects media or artifact paths outside the same controlled task directory", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    const analyzer = new FilmAnalyzer({ runner });

    await expect(analyzer.analyze({
      mediaPath: paths.mediaPath,
      artifactDirectory: join(tmpdir(), "other-task", "artifacts"),
    })).rejects.toMatchObject({ code: "FILM_ANALYSIS_FAILED", reason: "unsafe_path" });
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects a pre-existing artifact symlink before creating any child output", async () => {
    const paths = await workspace();
    const outside = await mkdtemp(join(tmpdir(), "ka-film-outside-"));
    roots.push(outside);
    await mkdir(outside, { recursive: true });
    await symlink(outside, paths.artifactDirectory);
    const runner = new FakeRunner();
    const analyzer = new FilmAnalyzer({ runner });

    await expect(analyzer.analyze(paths)).rejects.toMatchObject({ reason: "unsafe_path" });
    expect(runner.calls).toHaveLength(0);
  });

  it("fails safely when scene analysis times out and does not expose stderr", async () => {
    const paths = await workspace();
    const runner = new FakeRunner();
    runner.run = async (invocation) => {
      runner.calls.push(invocation);
      if (invocation.binary === "ffprobe") {
        return { exitCode: 0, stdout: JSON.stringify(runner.probe), stderr: "", timedOut: false };
      }
      return {
        exitCode: null,
        stdout: "",
        stderr: "https://cdn.example.com/video.mp4?token=secret",
        timedOut: true,
      };
    };
    const analyzer = new FilmAnalyzer({ runner });

    let error: unknown;
    try {
      await analyzer.analyze(paths);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ reason: "scene_analysis_failed" });
    expect(String(error)).not.toContain("cdn.example.com");
  });
});
