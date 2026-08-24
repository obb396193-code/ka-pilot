import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MaterialDownloadError,
  MaterialDownloadService,
} from "../src/materials/download-service.js";

const roots: string[] = [];
const candidate = {
  signature: "material-signature",
  materialType: "VIDEO",
  materialUrl: "https://cdn.example.com/private/original-name.mp4?token=secret",
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function testRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ka-material-download-test-"));
  roots.push(root);
  return root;
}

function sourceFetch(body: Uint8Array, contentType = "video/mp4") {
  return vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-length": body.byteLength.toString(),
        },
      });
    }
    return new Response(Buffer.from(body), {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": body.byteLength.toString(),
      },
    });
  });
}

describe("MaterialDownloadService", () => {
  it("downloads into a random task directory, hashes bytes and releases idempotently", async () => {
    const root = await testRoot();
    const body = new TextEncoder().encode("bounded-video-body");
    const fetchFn = sourceFetch(body);
    const service = new MaterialDownloadService({
      allowedHosts: ["*.example.com"],
      fetchFn,
      tempRoot: root,
      maxContentBytes: 1024,
    });

    const handle = await service.download(candidate);

    expect(basename(handle.path)).toBe("source.media");
    expect(handle.path).not.toContain("original-name");
    expect(handle.byteLength).toBe(body.byteLength);
    expect(handle.contentSha256).toBe(createHash("sha256").update(body).digest("hex"));
    expect(await readFile(handle.path)).toEqual(Buffer.from(body));
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await handle.release();
    await handle.release();
    await expect(stat(handle.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves the mandatory container-validation flag for octet-stream video", async () => {
    const root = await testRoot();
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn: sourceFetch(new Uint8Array([1, 2, 3]), "application/octet-stream"),
      tempRoot: root,
    });

    const handle = await service.download(candidate);

    expect(handle.contentType).toBe("application/octet-stream");
    expect(handle.requiresContainerValidation).toBe(true);
    await handle.release();
  });

  it("revalidates every redirect hop on the body GET", async () => {
    const root = await testRoot();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({
      code: "MATERIAL_DOWNLOAD_FAILED",
      reason: "source_blocked",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects body content-length drift before accepting output", async () => {
    const root = await testRoot();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "4" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
      maxContentBytes: 10,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({
      reason: "content_length_mismatch",
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects body content-type drift and removes the task directory", async () => {
    const root = await testRoot();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/webm", "content-length": "3" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({
      reason: "content_length_mismatch",
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects a malformed GET length and an empty response body", async () => {
    const root = await testRoot();
    const malformedLength = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "not-a-number" },
      }));
    await expect(new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn: malformedLength,
      tempRoot: root,
    }).download(candidate)).rejects.toMatchObject({ reason: "content_length_mismatch" });

    const emptyBody = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }));
    await expect(new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn: emptyBody,
      tempRoot: root,
    }).download(candidate)).rejects.toMatchObject({ reason: "download_failed" });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects a short body even when GET omits content-length", async () => {
    const root = await testRoot();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({
      reason: "content_length_mismatch",
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("stops streaming when actual bytes exceed the admitted length and removes partial files", async () => {
    const root = await testRoot();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
      maxContentBytes: 3,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({ reason: "content_too_large" });
    expect(await readdir(root)).toEqual([]);
  });

  it("removes partial files after a stream failure without exposing the signed URL", async () => {
    const root = await testRoot();
    const brokenBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error(`failed ${candidate.materialUrl}`));
      },
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }))
      .mockResolvedValueOnce(new Response(brokenBody, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }));
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
    });

    let error: unknown;
    try {
      await service.download(candidate);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MaterialDownloadError);
    expect(error).toMatchObject({ reason: "download_failed" });
    expect(String(error)).not.toContain("cdn.example.com");
    expect(String(error)).not.toContain("token=secret");
    expect(await readdir(root)).toEqual([]);
  });

  it("aborts a body request that exceeds the configured download deadline", async () => {
    const root = await testRoot();
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "3" },
        });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn,
      tempRoot: root,
      timeoutMs: 1_000,
      downloadTimeoutMs: 10,
    });

    await expect(service.download(candidate)).rejects.toMatchObject({ reason: "source_blocked" });
    expect(await readdir(root)).toEqual([]);
  });

  it("uses distinct directories for concurrent downloads", async () => {
    const root = await testRoot();
    const service = new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      fetchFn: sourceFetch(new Uint8Array([1, 2, 3])),
      tempRoot: root,
    });

    const [first, second] = await Promise.all([
      service.download(candidate),
      service.download(candidate),
    ]);

    expect(first.path).not.toBe(second.path);
    await Promise.all([first.release(), second.release()]);
    expect(await readdir(root)).toEqual([]);
  });

  it("validates resource limits before any network access", () => {
    expect(() => new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      maxContentBytes: 0,
    })).toThrow("maxContentBytes must be a positive integer");
    expect(() => new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      downloadTimeoutMs: Number.NaN,
    })).toThrow("maxContentBytes must be a positive integer");
    expect(() => new MaterialDownloadService({
      allowedHosts: ["cdn.example.com"],
      tempRoot: "   ",
    })).toThrow("tempRoot must not be empty");
  });
});
