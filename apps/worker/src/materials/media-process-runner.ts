import { spawn } from "node:child_process";

export type MediaBinary = "ffmpeg" | "ffprobe";

export interface MediaProcessInvocation {
  readonly binary: MediaBinary;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes?: number;
}

export interface MediaProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly outputTruncated?: boolean;
}

export interface MediaProcessRunner {
  run(invocation: MediaProcessInvocation): Promise<MediaProcessResult>;
}

export interface NodeMediaProcessRunnerOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
}

export class NodeMediaProcessRunner implements MediaProcessRunner {
  private readonly binaries: Record<MediaBinary, string>;

  constructor(options: NodeMediaProcessRunnerOptions = {}) {
    this.binaries = {
      ffmpeg: safeBinary(options.ffmpegPath ?? "ffmpeg"),
      ffprobe: safeBinary(options.ffprobePath ?? "ffprobe"),
    };
  }

  async run(invocation: MediaProcessInvocation): Promise<MediaProcessResult> {
    const timeoutMs = positiveInteger(invocation.timeoutMs, "timeoutMs");
    const maxOutputBytes = positiveInteger(invocation.maxOutputBytes ?? 4 * 1024 * 1024, "maxOutputBytes");
    const args = invocation.args.map(safeArgument);
    return new Promise((resolve) => {
      const child = spawn(this.binaries[invocation.binary], args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout = boundedCollector(maxOutputBytes);
      const stderr = boundedCollector(maxOutputBytes);
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

      let settled = false;
      let timedOut = false;
      const finish = (exitCode: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode,
          stdout: stdout.text(),
          stderr: stderr.text(),
          timedOut,
          outputTruncated: stdout.truncated() || stderr.truncated(),
        });
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.once("error", () => finish(null));
      child.once("close", (code) => finish(code));
    });
  }
}

function boundedCollector(maximumBytes: number): {
  push(value: Buffer): void;
  text(): string;
  truncated(): boolean;
} {
  const chunks: Buffer[] = [];
  let capturedBytes = 0;
  let wasTruncated = false;
  return {
    push(value) {
      const remaining = maximumBytes - capturedBytes;
      if (remaining <= 0) {
        wasTruncated = true;
        return;
      }
      if (value.byteLength > remaining) wasTruncated = true;
      const captured = value.subarray(0, remaining);
      chunks.push(captured);
      capturedBytes += captured.byteLength;
    },
    text: () => Buffer.concat(chunks).toString("utf8"),
    truncated: () => wasTruncated,
  };
}

function safeBinary(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.includes("\0")) throw new Error("Invalid media binary path");
  return trimmed;
}

function safeArgument(value: string): string {
  if (typeof value !== "string" || value.includes("\0")) throw new Error("Invalid media argument");
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
