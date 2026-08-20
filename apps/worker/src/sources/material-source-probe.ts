type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type MaterialSourceBlockedReason =
  | "not_video_material"
  | "unsafe_url"
  | "host_not_allowed"
  | "redirect_limit"
  | "invalid_redirect"
  | "upstream_status"
  | "unknown_length"
  | "content_too_large"
  | "content_type_not_allowed";

export class MaterialSourceBlockedError extends Error {
  readonly code = "MATERIAL_SOURCE_BLOCKED";

  constructor(readonly reason: MaterialSourceBlockedReason) {
    super(`Material source blocked: ${reason}`);
    this.name = "MaterialSourceBlockedError";
  }
}

export interface MaterialSourceCandidate {
  signature: string;
  materialType: string;
  materialUrl: string;
}

export interface MaterialSourceProbeResult {
  ready: true;
  contentType: string;
  contentLength: number;
  method: "HEAD" | "RANGE";
  redirectCount: number;
  requiresContainerValidation: boolean;
}

export interface MaterialSourceProbeOptions {
  allowedHosts: readonly string[];
  fetchFn?: FetchLike;
  maxContentBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export function toMaterialSourceCandidate(row: MaterialPoolRow): MaterialSourceCandidate {
  const signature = row.signature.trim();
  const materialType = row.material_type.trim().toUpperCase();
  const materialUrl = row.material_url?.trim();
  if (signature === "" || materialUrl === undefined || materialUrl === "") {
    throw new MaterialSourceBlockedError("unsafe_url");
  }
  return { signature, materialType, materialUrl };
}

interface ProbeResponse {
  response: Response;
  redirectCount: number;
}

export class MaterialSourceProbe {
  private readonly allowedHosts: readonly string[];
  private readonly fetchFn: FetchLike;
  private readonly maxContentBytes: number;
  private readonly maxRedirects: number;
  private readonly timeoutMs: number;

  constructor(options: MaterialSourceProbeOptions) {
    this.allowedHosts = options.allowedHosts.map(normalizeHostPattern);
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxContentBytes = positiveInteger(options.maxContentBytes ?? 500 * 1024 * 1024, "maxContentBytes");
    this.maxRedirects = boundedInteger(options.maxRedirects ?? 3, 0, 10, "maxRedirects");
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 15_000, "timeoutMs");
  }

  async inspect(candidate: MaterialSourceCandidate): Promise<MaterialSourceProbeResult> {
    if (candidate.materialType.trim().toUpperCase() !== "VIDEO") {
      throw new MaterialSourceBlockedError("not_video_material");
    }
    const initialUrl = this.admitUrl(candidate.materialUrl);
    let probe = await this.requestFollowingRedirects(initialUrl, "HEAD");
    let method: "HEAD" | "RANGE" = "HEAD";
    if ([405, 501].includes(probe.response.status)) {
      await cancelBody(probe.response);
      probe = await this.requestFollowingRedirects(initialUrl, "RANGE");
      method = "RANGE";
    }
    try {
      if (!probe.response.ok) throw new MaterialSourceBlockedError("upstream_status");
      const contentType = normalizedContentType(probe.response.headers.get("content-type"));
      const requiresContainerValidation = contentType === "application/octet-stream";
      if (!contentType.startsWith("video/") && !requiresContainerValidation) {
        throw new MaterialSourceBlockedError("content_type_not_allowed");
      }
      const contentLength = responseContentLength(probe.response, method);
      if (contentLength === null) throw new MaterialSourceBlockedError("unknown_length");
      if (contentLength > this.maxContentBytes) {
        throw new MaterialSourceBlockedError("content_too_large");
      }
      return {
        ready: true,
        contentType,
        contentLength,
        method,
        redirectCount: probe.redirectCount,
        requiresContainerValidation,
      };
    } finally {
      await cancelBody(probe.response);
    }
  }

  private async requestFollowingRedirects(
    initialUrl: URL,
    method: "HEAD" | "RANGE",
  ): Promise<ProbeResponse> {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        try {
          response = await this.fetchFn(currentUrl, {
            method: method === "HEAD" ? "HEAD" : "GET",
            ...(method === "RANGE" ? { headers: { range: "bytes=0-0" } } : {}),
            redirect: "manual",
            signal: controller.signal,
          });
        } catch {
          throw new MaterialSourceBlockedError("upstream_status");
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!isRedirect(response.status)) return { response, redirectCount };
      const location = response.headers.get("location");
      await cancelBody(response);
      if (location === null) throw new MaterialSourceBlockedError("invalid_redirect");
      if (redirectCount === this.maxRedirects) {
        throw new MaterialSourceBlockedError("redirect_limit");
      }
      let redirected: URL;
      try {
        redirected = new URL(location, currentUrl);
      } catch {
        throw new MaterialSourceBlockedError("invalid_redirect");
      }
      currentUrl = this.admitUrl(redirected.toString());
    }
    throw new MaterialSourceBlockedError("redirect_limit");
  }

  private admitUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new MaterialSourceBlockedError("unsafe_url");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    ) {
      throw new MaterialSourceBlockedError("unsafe_url");
    }
    if (isForbiddenHost(url.hostname) || !this.allowedHosts.some((pattern) => hostMatches(url.hostname, pattern))) {
      throw new MaterialSourceBlockedError("host_not_allowed");
    }
    return url;
  }
}

function normalizeHostPattern(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:\*\.)?[a-z0-9.-]+$/.test(normalized) || normalized.includes("..")) {
    throw new MaterialSourceBlockedError("host_not_allowed");
  }
  return normalized;
}

function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  if (!pattern.startsWith("*.")) return host === pattern;
  const suffix = pattern.slice(1);
  return host.endsWith(suffix) && host.length > suffix.length;
}

function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const unwrapped = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return host === "localhost" || isIP(unwrapped) !== 0;
}

function responseContentLength(response: Response, method: "HEAD" | "RANGE"): number | null {
  if (method === "RANGE") {
    const contentRange = response.headers.get("content-range");
    const match = contentRange?.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
    if (match?.[1] !== undefined) return safeLength(match[1]);
  }
  return safeLength(response.headers.get("content-length"));
}

function safeLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function cancelBody(response: Response): Promise<void> {
  if (response.body !== null) {
    try {
      await response.body.cancel();
    } catch {
      // A consumed or already cancelled probe body is harmless.
    }
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is outside its configured boundary`);
  }
  return value;
}
import { isIP } from "node:net";

import type { MaterialPoolRow } from "./material-schemas.js";
