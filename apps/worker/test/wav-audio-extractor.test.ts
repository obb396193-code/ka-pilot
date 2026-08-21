import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FfmpegWavAudioExtractor,
  WavAudioExtractorError,
} from "../src/materials/wav-audio-extractor.js";
import type {
  MediaProcessInvocation,
  MediaProcessResult,
  MediaProcessRunner,
} from "../src/materials/media-process-runner.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function sourceFile(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ka-wav-unit-"));
  roots.push(root);
  const source = join(root, "source.media");
  await writeFile(source, "fake media");
  return source;
}

class FakeRunner implements MediaProcessRunner {
  readonly calls: MediaProcessInvocation[] = [];

  constructor(
    private readonly execute: (invocation: MediaProcessInvocation) => Promise<MediaProcessResult>,
  ) {}

  async run(invocation: MediaProcessInvocation): Promise<MediaProcessResult> {
    this.calls.push(invocation);
    return this.execute(invocation);
  }
}

const okResult: MediaProcessResult = {
  exitCode: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  outputTruncated: false,
};

describe("FfmpegWavAudioExtractor", () => {
  it("extracts a bounded 16kHz mono PCM WAV and releases only its task directory", async () => {
    const mediaHandle = await sourceFile();
    let outputPath = "";
    const runner = new FakeRunner(async (invocation) => {
      outputPath = invocation.args.at(-1) ?? "";
      await writeFile(outputPath, Buffer.from("RIFF-safe-wav"));
      return okResult;
    });
    const extractor = new FfmpegWavAudioExtractor({ runner, maxWavBytes: 1024, timeoutMs: 12_000 });

    const handle = await extractor.extract({ mediaHandle });

    expect(runner.calls).toEqual([{
      binary: "ffmpeg",
      args: [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", mediaHandle,
        "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        outputPath,
      ],
      timeoutMs: 12_000,
      maxOutputBytes: 64 * 1024,
    }]);
    expect(handle.path).toBe(outputPath);
    expect(handle.byteLength).toBe(13);
    expect(await readFile(mediaHandle, "utf8")).toBe("fake media");
    expect((await lstat(handle.path)).isFile()).toBe(true);

    await handle.release();
    await handle.release();
    await expect(lstat(dirname(outputPath))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(mediaHandle, "utf8")).toBe("fake media");
  });

  it.each([
    { result: { ...okResult, exitCode: 1 }, reason: "ffmpeg_failed" },
    { result: { ...okResult, timedOut: true }, reason: "ffmpeg_failed" },
    { result: { ...okResult, outputTruncated: true }, reason: "ffmpeg_failed" },
  ] as const)("cleans partial output after $reason", async ({ result, reason }) => {
    const mediaHandle = await sourceFile();
    let taskRoot = "";
    const runner = new FakeRunner(async (invocation) => {
      taskRoot = dirname(invocation.args.at(-1) ?? "");
      await writeFile(join(taskRoot, "audio.wav"), "partial");
      return result;
    });

    await expect(new FfmpegWavAudioExtractor({ runner }).extract({ mediaHandle }))
      .rejects.toMatchObject({ reason });
    await expect(lstat(taskRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects empty, oversized and symbolic-link output", async () => {
    for (const kind of ["empty", "oversized", "symlink"] as const) {
      const mediaHandle = await sourceFile();
      let taskRoot = "";
      const runner = new FakeRunner(async (invocation) => {
        const output = invocation.args.at(-1) ?? "";
        taskRoot = dirname(output);
        if (kind === "empty") await writeFile(output, "");
        if (kind === "oversized") await writeFile(output, "12345");
        if (kind === "symlink") await symlink(mediaHandle, output);
        return okResult;
      });

      await expect(new FfmpegWavAudioExtractor({ runner, maxWavBytes: 4 }).extract({ mediaHandle }))
        .rejects.toMatchObject({ reason: "invalid_output" });
      await expect(lstat(taskRoot)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects relative, missing, directory and symbolic-link inputs before FFmpeg", async () => {
    const source = await sourceFile();
    const sourceRoot = dirname(source);
    const link = join(sourceRoot, "source-link");
    await symlink(source, link);
    const run = vi.fn(async () => okResult);
    const extractor = new FfmpegWavAudioExtractor({ runner: { run } });

    for (const mediaHandle of ["relative.mp4", join(sourceRoot, "missing"), sourceRoot, link]) {
      await expect(extractor.extract({ mediaHandle })).rejects.toMatchObject({ reason: "invalid_input" });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects unsafe configuration without invoking the runner", async () => {
    const runner = { run: vi.fn(async () => okResult) };
    expect(() => new FfmpegWavAudioExtractor({ runner, maxWavBytes: 0 }))
      .toThrow(WavAudioExtractorError);
    expect(() => new FfmpegWavAudioExtractor({ runner, timeoutMs: Number.NaN }))
      .toThrow(WavAudioExtractorError);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("does not leak paths or FFmpeg stderr in its stable error", async () => {
    const mediaHandle = await sourceFile();
    const runner = new FakeRunner(async () => ({
      ...okResult,
      exitCode: 1,
      stderr: `secret path ${mediaHandle}`,
    }));

    let error: unknown;
    try {
      await new FfmpegWavAudioExtractor({ runner }).extract({ mediaHandle });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).not.toContain(mediaHandle);
    expect(String(error)).not.toContain("secret");
  });
});

