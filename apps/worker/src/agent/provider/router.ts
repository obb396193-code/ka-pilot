import { createHash } from "node:crypto";

import { assessProviderReadiness, type AgentTaskKind } from "@ka/domain";

import type { ProviderCapabilityStore } from "./capability-store.js";
import type {
  ProviderCandidate,
  ProviderProfile,
  ProviderRouteDecision,
  RejectedProviderCandidate,
} from "./types.js";

export class ProviderRouter {
  private readonly profiles: ProviderProfile[];

  constructor(
    profiles: readonly ProviderProfile[],
    private readonly capabilities: ProviderCapabilityStore,
  ) {
    assertProfiles(profiles);
    this.profiles = profiles.map((profile) => structuredClone(profile));
  }

  async route(input: {
    taskKind: AgentTaskKind;
    preferredProviderId?: string | undefined;
    preferredModel?: string | undefined;
  }): Promise<ProviderRouteDecision> {
    if (
      input.preferredProviderId !== undefined &&
      !this.profiles.some((profile) => profile.id === input.preferredProviderId)
    ) {
      return {
        taskKind: input.taskKind,
        selected: null,
        candidates: [],
        rejected: [
          {
            providerId: input.preferredProviderId,
            model: input.preferredModel ?? null,
            reasons: ["preferred_provider_not_found"],
          },
        ],
      };
    }
    const candidates: ProviderCandidate[] = [];
    const rejected: RejectedProviderCandidate[] = [];
    const ordered = orderProfiles(this.profiles, input.preferredProviderId);
    for (const profile of ordered) {
      const model = selectModel(profile, input);
      const structuralReasons = structuralRejectionReasons(profile, input.taskKind, model);
      if (structuralReasons.length > 0 || model === null) {
        rejected.push({ providerId: profile.id, model, reasons: structuralReasons });
        continue;
      }
      const version = providerProfileVersion(profile);
      const snapshot = await this.capabilities.get(profile.id, model, version);
      if (snapshot === null) {
        rejected.push({ providerId: profile.id, model, reasons: ["capability_not_probed"] });
        continue;
      }
      const readiness = assessProviderReadiness(snapshot, input.taskKind);
      if (!readiness.eligible) {
        rejected.push({ providerId: profile.id, model, reasons: readiness.reasons });
        continue;
      }
      candidates.push({
        providerId: profile.id,
        model,
        profileVersion: version,
        protocol: profile.protocol,
      });
    }
    return {
      taskKind: input.taskKind,
      selected: candidates[0] ?? null,
      candidates,
      rejected,
    };
  }
}

export function providerProfileVersion(profile: ProviderProfile): string {
  const canonical = JSON.stringify({
    id: profile.id,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    models: profile.models,
    defaultModel: profile.defaultModel,
    enabled: profile.enabled,
    taskKinds: profile.taskKinds,
    fallbackProviderIds: profile.fallbackProviderIds,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function assertProfiles(profiles: readonly ProviderProfile[]): void {
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (profile.id.trim() === "") throw new Error("Provider id is required");
    if (ids.has(profile.id)) throw new Error(`Duplicate provider profile: ${profile.id}`);
    ids.add(profile.id);
    if (profile.models.length === 0 || new Set(profile.models).size !== profile.models.length) {
      throw new Error(`Provider ${profile.id} requires unique models`);
    }
    if (!profile.models.includes(profile.defaultModel)) {
      throw new Error(`Provider ${profile.id} defaultModel must be present in models`);
    }
  }
}

function orderProfiles(
  profiles: readonly ProviderProfile[],
  preferredProviderId: string | undefined,
): ProviderProfile[] {
  if (preferredProviderId === undefined) return [...profiles];
  const preferred = profiles.find((profile) => profile.id === preferredProviderId);
  if (preferred === undefined) return [...profiles];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const orderedIds = [preferred.id, ...preferred.fallbackProviderIds, ...profiles.map((profile) => profile.id)];
  const seen = new Set<string>();
  return orderedIds.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const profile = byId.get(id);
    return profile === undefined ? [] : [profile];
  });
}

function selectModel(
  profile: ProviderProfile,
  input: { preferredProviderId?: string | undefined; preferredModel?: string | undefined },
): string | null {
  if (input.preferredModel === undefined) return profile.defaultModel;
  if (input.preferredProviderId === undefined || input.preferredProviderId === profile.id) {
    return profile.models.includes(input.preferredModel) ? input.preferredModel : null;
  }
  return profile.defaultModel;
}

function structuralRejectionReasons(
  profile: ProviderProfile,
  taskKind: AgentTaskKind,
  model: string | null,
): string[] {
  if (!profile.enabled) return ["provider_disabled"];
  if (!profile.taskKinds.includes(taskKind)) return ["task_not_supported"];
  if (model === null) return ["model_not_supported"];
  return [];
}
