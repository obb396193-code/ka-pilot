import type {
  ProviderCapabilities,
  ProviderCapability,
  ProviderCapabilitySnapshot,
} from "@ka/domain";

import type { ProviderCapabilityStore } from "./capability-store.js";
import { providerProfileVersion } from "./router.js";
import type { ProviderProfile, ProviderProbeTransport } from "./types.js";

const CAPABILITIES: readonly ProviderCapability[] = [
  "connectivity",
  "streaming",
  "toolCalling",
  "structuredOutput",
  "abort",
];

export class ProviderProbeService {
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(
    private readonly store: ProviderCapabilityStore,
    private readonly transport: ProviderProbeTransport,
    options: { now?: (() => Date) | undefined; timeoutMs?: number | undefined } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("Provider probe timeout must be a positive integer");
    }
  }

  async probe(profile: ProviderProfile, model: string): Promise<ProviderCapabilitySnapshot> {
    if (!profile.models.includes(model)) throw new Error("Cannot probe a model outside the provider profile");
    const version = providerProfileVersion(profile);
    await this.store.save(snapshot(profile, model, version, "probing", emptyCapabilities(), this.now()));
    const results = await Promise.all(
      CAPABILITIES.map(async (capability) => [
        capability,
        await this.probeCapability(profile, model, capability),
      ] as const),
    );
    const capabilities = Object.fromEntries(results) as unknown as ProviderCapabilities;
    const state = !capabilities.connectivity
      ? "blocked"
      : Object.values(capabilities).every(Boolean)
        ? "healthy"
        : "degraded";
    const result = snapshot(profile, model, version, state, capabilities, this.now());
    await this.store.save(result);
    return result;
  }

  private async probeCapability(
    profile: ProviderProfile,
    model: string,
    capability: ProviderCapability,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, this.timeoutMs);
    });
    const attempted = this.transport
      .probe({ capability, profile, model, signal: controller.signal })
      .then((result) => result === true)
      .catch(() => false);
    try {
      return await Promise.race([attempted, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function snapshot(
  profile: ProviderProfile,
  model: string,
  version: string,
  state: ProviderCapabilitySnapshot["state"],
  capabilities: ProviderCapabilities,
  now: Date,
): ProviderCapabilitySnapshot {
  if (!Number.isFinite(now.getTime())) throw new Error("Provider probe clock returned an invalid date");
  return {
    providerId: profile.id,
    model,
    version,
    state,
    capabilities,
    checkedAt: now.toISOString(),
  };
}

function emptyCapabilities(): ProviderCapabilities {
  return {
    connectivity: false,
    streaming: false,
    toolCalling: false,
    structuredOutput: false,
    abort: false,
  };
}
