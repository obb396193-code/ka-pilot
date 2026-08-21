import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FfmpegWavAudioExtractor } from "../src/materials/wav-audio-extractor.js";
import { NodeMediaProcessRunner } from "../src/materials/media-process-runner.js";

const ffmpegPath = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
  .find(existsSync);
const ffprobePath = ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]
  .find(existsSync);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FfmpegWavAudioExtractor real FFmpeg", () => {
  it.runIf(ffmpegPath !== undefined && ffprobePath !== undefined)(
    "extracts 16kHz mono PCM from a generated MP4",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ka-asr-wav-integration-"));
      roots.push(root);
      const mediaPath = join(root, "source.mp4");
      const runner = new NodeMediaProcessRunner({ ffmpegPath: ffmpegPath!, ffprobePath: ffprobePath! });
      const generated = await runner.run({
        binary: "ffmpeg",
        args: [
          "-hide_banner", "-loglevel", "error", "-y",
          "-f", "lavfi", "-i", "color=c=black:s=160x284:d=1:r=25",
          "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100:duration=1",
          "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mediaPath,
        ],
        timeoutMs: 30_000,
      });
      expect(generated).toMatchObject({ exitCode: 0, timedOut: false });

      const handle = await new FfmpegWavAudioExtractor({
        runner,
        maxWavBytes: 1024 * 1024,
        timeoutMs: 30_000,
      }).extract({ mediaHandle: mediaPath });
      const probe = await runner.run({
        binary: "ffprobe",
        args: [
          "-v", "error", "-select_streams", "a:0",
          "-show_entries", "stream=codec_name,sample_rate,channels",
          "-of", "json", handle.path,
        ],
        timeoutMs: 30_000,
      });
      expect(probe).toMatchObject({ exitCode: 0, timedOut: false });
      expect(JSON.parse(probe.stdout)).toMatchObject({
        streams: [{ codec_name: "pcm_s16le", sample_rate: "16000", channels: 1 }],
      });
      expect(handle.byteLength).toBeGreaterThan(0);
      await handle.release();
    },
    60_000,
  );
});

