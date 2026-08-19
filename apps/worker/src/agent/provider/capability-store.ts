import type { ProviderCapabilitySnapshot } from "@ka/domain";

export interface ProviderCapabilityStore {
  get(providerId: string, model: string, version: string): Promise<ProviderCapabilitySnapshot | null>;
  save(snapshot: ProviderCapabilitySnapshot): Promise<void>;
}

export class MemoryProviderCapabilityStore implements ProviderCapabilityStore {
  private readonly snapshots = new Map<string, ProviderCapabilitySnapshot>();

  async get(
    providerId: string,
    model: string,
    version: string,
  ): Promise<ProviderCapabilitySnapshot | null> {
    const snapshot = this.snapshots.get(key(providerId, model));
    if (snapshot === undefined || snapshot.version !== version) return null;
    return structuredClone(snapshot);
  }

  async save(snapshot: ProviderCapabilitySnapshot): Promise<void> {
    this.snapshots.set(key(snapshot.providerId, snapshot.model), structuredClone(snapshot));
  }
}

function key(providerId: string, model: string): string {
  return JSON.stringify([providerId, model]);
}
