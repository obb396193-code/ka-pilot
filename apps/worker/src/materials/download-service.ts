import { createHash } from "node:crypto";
import { open, mkdtemp, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MaterialSourceBlockedError,
  MaterialSourceProbe,
  type MaterialSourceCandidate,
} from "../sources/material-source-probe.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type MaterialDownloadFailureReason =
  | "source_blocked"
  | "content_length_mismatch"
  | "content_too_large"
  | "download_failed";

export class MaterialDownloadError extends Error {
  readonly code = "MATERIAL_DOWNLOAD_FAILED";

  constructor(readonly reason: MaterialDownloadFailureReason) {
    super(`Material download failed: ${reason}`);
    this.name = "MaterialDownloadError";
  }
}

export interface MaterialDownloadServiceOptions {
  allowedHosts: readonly string[];
  fetchFn?: FetchLike;
  tempRoot?: string;
  maxContentBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  downloadTimeoutMs?: number;
}

export interface DownloadedMaterialHandle {
  readonly path: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly contentType: string;
  readonly requiresContainerValidation: boolean;
  release(): Promise<void>;
}

export class MaterialDownloadService {
  private readonly probe: MaterialSourceProbe;
  private readonly tempRoot: string;
  private readonly maxContentBytes: number;
  private readonly downloadTimeoutMs: number;

  constructor(options: MaterialDownloadServiceOptions) {
    this.maxContentBytes = positiveInteger(options.maxContentBytes ?? 500 * 1024 * 1024);
    this.downloadTimeoutMs = positiveInteger(options.downloadTimeoutMs ?? 120_000);
    this.tempRoot = options.tempRoot ?? tmpdir();
    if (this.tempRoot.trim() === "") throw new Error("tempRoot must not be empty");
    this.probe = new MaterialSourceProbe({
      allowedHosts: options.allowedHosts,
      ...(options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn }),
      maxContentBytes: this.maxContentBytes,
      ...(options.maxRedirects === undefined ? {} : { maxRedirects: options.maxRedirects }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
  }

  async download(candidate: MaterialSourceCandidate): Promise<DownloadedMaterialHandle> {
    let taskDirectory: string | undefined;
    try {
      const admission = await this.probe.inspect(candidate);
      taskDirectory = await mkdtemp(join(this.tempRoot, "ka-material-"));
      const path = join(taskDirectory, "source.media");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
      const downloaded = await (async () => {
        try {
          const stream = await this.probe.openDownload(candidate, controller.signal);
          const contentType = normalizeContentType(stream.response.headers.get("content-type"));
          if (contentType !== admission.contentType) {
            await cancelResponse(stream.response);
            throw new MaterialDownloadError("content_length_mismatch");
          }
          const declaredLength = parseOptionalLength(stream.response.headers.get("content-length"));
          if (declaredLength !== null && declaredLength !== admission.contentLength) {
            await cancelResponse(stream.response);
            throw new MaterialDownloadError("content_length_mismatch");
          }
          const body = await writeBoundedBody(
            stream.response,
            path,
            Math.min(this.maxContentBytes, admission.contentLength),
          );
          return { ...body, contentType };
        } finally {
          clearTimeout(timeout);
        }
      })();
      if (downloaded.byteLength !== admission.contentLength) {
        throw new MaterialDownloadError("content_length_mismatch");
      }
      return createHandle({
        taskDirectory,
        path,
        contentSha256: downloaded.contentSha256,
        byteLength: downloaded.byteLength,
        contentType: downloaded.contentType,
        requiresContainerValidation: admission.requiresContainerValidation,
      });
    } catch (error) {
      if (taskDirectory !== undefined) await safeRemoveDirectory(taskDirectory);
      if (error instanceof MaterialDownloadError) throw error;
      if (error instanceof MaterialSourceBlockedError) {
        throw new MaterialDownloadError("source_blocked");
      }
      throw new MaterialDownloadError("download_failed");
    }
  }
}

async function writeBoundedBody(
  response: Response,
  path: string,
  maximumBytes: number,
): Promise<{ contentSha256: string; byteLength: number }> {
  if (response.body === null) throw new MaterialDownloadError("download_failed");
  let file: FileHandle | undefined;
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let byteLength = 0;
  try {
    file = await open(path, "wx", 0o600);
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        throw new MaterialDownloadError("download_failed");
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new MaterialDownloadError("content_too_large");
      }
      hash.update(chunk.value);
      await writeAll(file, chunk.value);
    }
    await file.sync();
    return { contentSha256: hash.digest("hex"), byteLength };
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be errored or closed.
    }
    throw error;
  } finally {
    reader.releaseLock();
    if (file !== undefined) await file.close();
  }
}

async function writeAll(file: FileHandle, value: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < value.byteLength) {
    const result = await file.write(value, offset, value.byteLength - offset, null);
    if (result.bytesWritten <= 0) throw new MaterialDownloadError("download_failed");
    offset += result.bytesWritten;
  }
}

function createHandle(input: {
  taskDirectory: string;
  path: string;
  contentSha256: string;
  byteLength: number;
  contentType: string;
  requiresContainerValidation: boolean;
}): DownloadedMaterialHandle {
  let released = false;
  return Object.freeze({
    path: input.path,
    contentSha256: input.contentSha256,
    byteLength: input.byteLength,
    contentType: input.contentType,
    requiresContainerValidation: input.requiresContainerValidation,
    async release(): Promise<void> {
      if (released) return;
      released = true;
      await safeRemoveDirectory(input.taskDirectory);
    },
  });
}

async function safeRemoveDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

async function cancelResponse(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // A consumed or already failed body needs no further cleanup.
  }
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function parseOptionalLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new MaterialDownloadError("content_length_mismatch");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MaterialDownloadError("content_length_mismatch");
  }
  return parsed;
}

function positiveInteger(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("maxContentBytes must be a positive integer");
  }
  return value;
}
