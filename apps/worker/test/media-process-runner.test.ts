import { describe, expect, it } from "vitest";

import { NodeMediaProcessRunner } from "../src/materials/media-process-runner.js";

describe("NodeMediaProcessRunner", () => {
  it("fails closed when the configured binary cannot be started", async () => {
    const runner = new NodeMediaProcessRunner({ ffprobePath: "/not/a/real/ffprobe" });

    await expect(runner.run({
      binary: "ffprobe",
      args: [],
      timeoutMs: 1_000,
    })).resolves.toMatchObject({ exitCode: null, timedOut: false });
  });

  it("kills a process that exceeds its deadline", async () => {
    const runner = new NodeMediaProcessRunner({ ffprobePath: "/bin/sleep" });

    await expect(runner.run({
      binary: "ffprobe",
      args: ["1"],
      timeoutMs: 10,
    })).resolves.toMatchObject({ exitCode: null, timedOut: true });
  });

  it("caps subprocess output without retaining the overflow", async () => {
    const runner = new NodeMediaProcessRunner({ ffprobePath: "/usr/bin/printf" });

    const result = await runner.run({
      binary: "ffprobe",
      args: ["1234567890"],
      timeoutMs: 1_000,
      maxOutputBytes: 4,
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "1234",
      timedOut: false,
      outputTruncated: true,
    });
  });

  it("rejects unsafe configuration and arguments before spawn", async () => {
    expect(() => new NodeMediaProcessRunner({ ffmpegPath: "\0" })).toThrow("Invalid media binary path");
    const runner = new NodeMediaProcessRunner();
    await expect(runner.run({
      binary: "ffmpeg",
      args: ["bad\0arg"],
      timeoutMs: 1_000,
    })).rejects.toThrow("Invalid media argument");
    await expect(runner.run({
      binary: "ffmpeg",
      args: [],
      timeoutMs: 0,
    })).rejects.toThrow("timeoutMs must be a positive integer");
  });
});
