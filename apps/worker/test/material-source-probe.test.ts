import { describe, expect, it, vi } from "vitest";

import {
  MaterialSourceBlockedError,
  MaterialSourceProbe,
  toMaterialSourceCandidate,
} from "../src/sources/material-source-probe.js";

const candidate = {
  signature: "material-signature",
  materialType: "VIDEO",
  materialUrl: "https://cdn.example.com/video.mp4",
};

describe("MaterialSourceProbe", () => {
  it("normalizes a material-pool video row into a probe candidate", () => {
    expect(toMaterialSourceCandidate({
      signature: " material-signature ",
      material_type: "video",
      material_url: "https://cdn.example.com/video.mp4",
    })).toEqual(candidate);

    expect(() => toMaterialSourceCandidate({
      signature: "material-signature",
      material_type: "VIDEO",
      material_url: null,
    })).toThrow(MaterialSourceBlockedError);
  });

  it("blocks every URL when no deployment host allowlist is configured", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const probe = new MaterialSourceProbe({ fetchFn, allowedHosts: [] });

    await expect(probe.inspect(candidate)).rejects.toMatchObject({
      code: "MATERIAL_SOURCE_BLOCKED",
      reason: "host_not_allowed",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("accepts an allowlisted bounded video using HEAD without reading the body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": "1024" },
    }));
    const probe = new MaterialSourceProbe({
      fetchFn,
      allowedHosts: ["*.example.com"],
      maxContentBytes: 2048,
    });

    const result = await probe.inspect(candidate);

    expect(result).toMatchObject({
      ready: true,
      contentType: "video/mp4",
      contentLength: 1024,
      method: "HEAD",
      redirectCount: 0,
    });
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD", redirect: "manual" });
    expect(JSON.stringify(result)).not.toContain("cdn.example.com");
  });

  it("falls back to a one-byte range probe when HEAD is unsupported", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response("x", {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-0/4096",
        },
      }));
    const probe = new MaterialSourceProbe({
      fetchFn,
      allowedHosts: ["cdn.example.com"],
      maxContentBytes: 5000,
    });

    await expect(probe.inspect(candidate)).resolves.toMatchObject({
      ready: true,
      method: "RANGE",
      contentLength: 4096,
    });
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
      headers: { range: "bytes=0-0" },
      redirect: "manual",
    });
  });

  it("validates every redirect hop against the allowlist", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.net/video.mp4" },
    }));
    const probe = new MaterialSourceProbe({
      fetchFn,
      allowedHosts: ["cdn.example.com"],
    });

    await expect(probe.inspect(candidate)).rejects.toMatchObject({
      code: "MATERIAL_SOURCE_BLOCKED",
      reason: "host_not_allowed",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["non video material", { ...candidate, materialType: "IMAGE" }, "not_video_material"],
    ["credential URL", { ...candidate, materialUrl: "https://user:pass@cdn.example.com/a.mp4" }, "unsafe_url"],
    ["fragment URL", { ...candidate, materialUrl: "https://cdn.example.com/a.mp4#secret" }, "unsafe_url"],
  ])("blocks %s before network", async (_label, value, reason) => {
    const fetchFn = vi.fn<typeof fetch>();
    const probe = new MaterialSourceProbe({ fetchFn, allowedHosts: ["cdn.example.com"] });
    await expect(probe.inspect(value)).rejects.toMatchObject({ reason });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown length", { "content-type": "video/mp4" }, "unknown_length"],
    ["zero length", { "content-type": "video/mp4", "content-length": "0" }, "unknown_length"],
    ["oversized", { "content-type": "video/mp4", "content-length": "9999" }, "content_too_large"],
    ["wrong type", { "content-type": "text/html", "content-length": "10" }, "content_type_not_allowed"],
  ])("blocks %s without exposing the URL", async (_label, headers, reason) => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 200, headers }));
    const probe = new MaterialSourceProbe({
      fetchFn,
      allowedHosts: ["cdn.example.com"],
      maxContentBytes: 100,
    });

    let error: unknown;
    try {
      await probe.inspect(candidate);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MaterialSourceBlockedError);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toContain("cdn.example.com");
  });

  it("blocks direct IP sources even when someone tries to allowlist one", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const probe = new MaterialSourceProbe({ fetchFn, allowedHosts: ["169.254.169.254"] });
    await expect(probe.inspect({
      ...candidate,
      materialUrl: "http://169.254.169.254/latest/meta-data",
    })).rejects.toMatchObject({ reason: "host_not_allowed" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sanitizes transport failures so source URLs do not escape through errors", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      throw new Error(`socket failed for ${String(input)}`);
    });
    const probe = new MaterialSourceProbe({ fetchFn, allowedHosts: ["cdn.example.com"] });

    let error: unknown;
    try {
      await probe.inspect(candidate);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MaterialSourceBlockedError);
    expect(String(error)).not.toContain("cdn.example.com");
  });
});
