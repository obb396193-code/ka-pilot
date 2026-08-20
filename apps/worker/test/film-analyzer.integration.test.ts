import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FilmAnalyzer } from "../src/materials/film-analyzer.js";
import { NodeMediaProcessRunner } from "../src/materials/media-process-runner.js";

const ffmpegPath = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
  .find(existsSync);
const ffprobePath = ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]
  .find(existsSync);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FilmAnalyzer real FFmpeg", () => {
  it.runIf(ffmpegPath !== undefined && ffprobePath !== undefined)(
    "probes and extracts a generated three-scene vertical video",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ka-film-integration-"));
      roots.push(root);
      const mediaPath = join(root, "source.media");
      const artifactDirectory = join(root, "artifacts");
      const runner = new NodeMediaProcessRunner({ ffmpegPath: ffmpegPath!, ffprobePath: ffprobePath! });
      const generated = await runner.run({
        binary: "ffmpeg",
        args: [
          "-hide_banner", "-loglevel", "error", "-y",
          "-f", "lavfi", "-i", "color=c=red:s=320x568:d=1:r=25",
          "-f", "lavfi", "-i", "color=c=blue:s=320x568:d=1:r=25",
          "-f", "lavfi", "-i", "color=c=white:s=320x568:d=1:r=25",
          "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[out]",
          "-map", "[out]", "-f", "mp4", mediaPath,
        ],
        timeoutMs: 30_000,
      });
      expect(generated).toMatchObject({ exitCode: 0, timedOut: false, outputTruncated: false });

      const analyzer = new FilmAnalyzer({
        runner,
        analysisTimeoutMs: 30_000,
        frameTimeoutMs: 30_000,
      });
      const result = await analyzer.analyze({ mediaPath, artifactDirectory });

      expect(result.media.durationMs).toBeGreaterThanOrEqual(2_900);
      expect(result.media.durationMs).toBeLessThanOrEqual(3_100);
      expect(result.media).toMatchObject({ width: 320, height: 568 });
      expect(result.visualSummary.visualEventCount).toBeGreaterThanOrEqual(1);
      expect(result.visualSummary.hardCutCount).toBeGreaterThanOrEqual(1);
      expect(result.shots).toHaveLength(result.cutPointsMs.length + 1);
      expect(result.shots[0]?.startMs).toBe(0);
      expect(result.shots.at(-1)?.endMs).toBe(result.media.durationMs);
      for (const shot of result.shots) {
        if (shot.frame.status === "ready") {
          const frame = await stat(join(artifactDirectory, shot.frame.artifactRef));
          expect(frame.size).toBeGreaterThan(0);
        }
      }
    },
    60_000,
  );
});
