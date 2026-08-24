import { z } from "zod";

export const CAPABILITY_KINDS = [
  "data",
  "compute",
  "agent",
  "action",
  "collaboration",
  "control",
] as const;

export const CAPABILITY_MODES = ["read", "preview", "execute"] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];
export type CapabilityMode = (typeof CAPABILITY_MODES)[number];
export type CapabilityIdempotencyScope = "run" | "node" | "object";

export interface CapabilityDefinition {
  id: string;
  version: string;
  kind: CapabilityKind;
  mode: CapabilityMode;
  description: string;
  requiredPermissions: readonly string[];
  supportsSimulation: boolean;
  timeoutMs: number;
  maxAttempts: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<unknown>;
  idempotencyScope?: CapabilityIdempotencyScope;
  requiresConfirmation?: boolean;
  exposeToAgent?: boolean;
}

export type CapabilityMetadata = Pick<
  CapabilityDefinition,
  "id" | "description" | "mode"
>;

const SAFE_ID = /^[a-z][a-z0-9_]{1,63}$/;
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_PERMISSION = /^[a-z][a-z0-9:_-]{1,127}$/;

export function assertCapabilityMetadata(input: CapabilityMetadata): void {
  if (!SAFE_ID.test(input.id)) {
    throw new Error("Capability id must be a safe snake_case token");
  }
  if (input.description.trim() === "" || input.description.length > 1_000) {
    throw new Error("Capability description is invalid");
  }
  if (!(CAPABILITY_MODES as readonly string[]).includes(input.mode)) {
    throw new Error("Capability mode is invalid");
  }
}

export function assertCapabilityDefinition(input: CapabilityDefinition): void {
  assertCapabilityMetadata(input);
  if (!SEMANTIC_VERSION.test(input.version) || input.version.length > 64) {
    throw new Error("Capability version must be a semantic version");
  }
  if (!(CAPABILITY_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error("Capability kind is invalid");
  }
  assertPermissions(input.requiredPermissions);
  assertLimits(input);
  assertExecutionSafety(input);
  if (!(input.inputSchema instanceof z.ZodType) || !(input.outputSchema instanceof z.ZodType)) {
    throw new Error("Capability inputSchema and outputSchema must be Zod schemas");
  }
}

function assertPermissions(permissions: readonly string[]): void {
  const unique = new Set<string>();
  for (const permission of permissions) {
    if (!SAFE_PERMISSION.test(permission)) {
      throw new Error("Capability permission is invalid");
    }
    if (unique.has(permission)) {
      throw new Error("Capability has a duplicate permission");
    }
    unique.add(permission);
  }
}

function assertLimits(input: CapabilityDefinition): void {
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 900_000) {
    throw new Error("Capability timeoutMs must be an integer between 1 and 900000");
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10) {
    throw new Error("Capability maxAttempts must be an integer between 1 and 10");
  }
}

function assertExecutionSafety(input: CapabilityDefinition): void {
  if (input.mode !== "execute") {
    return;
  }
  if (!input.idempotencyScope) {
    throw new Error("Execute capability requires idempotencyScope");
  }
  if (input.requiresConfirmation !== true) {
    throw new Error("Execute capability requiresConfirmation must be true");
  }
  if (!input.supportsSimulation) {
    throw new Error("Execute capability requires a simulation preview");
  }
  if (input.exposeToAgent) {
    throw new Error("Execute capability cannot be exposed directly to an Agent");
  }
}

function capabilityKey(id: string, version: string): string {
  return `${id}@${version}`;
}

export class CapabilityRegistry {
  private readonly definitions = new Map<string, CapabilityDefinition>();

  constructor(entries: readonly CapabilityDefinition[] = []) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(input: CapabilityDefinition): void {
    assertCapabilityDefinition(input);
    const key = capabilityKey(input.id, input.version);
    if (this.definitions.has(key)) {
      throw new Error(`Duplicate capability ${key}`);
    }
    this.definitions.set(key, Object.freeze({
      ...input,
      requiredPermissions: Object.freeze([...input.requiredPermissions]),
    }));
  }

  resolve(id: string, version: string): CapabilityDefinition {
    const found = this.definitions.get(capabilityKey(id, version));
    if (!found) {
      throw new Error(`Unknown capability version ${id}@${version}`);
    }
    return found;
  }

  list(): readonly CapabilityDefinition[] {
    return [...this.definitions.values()].sort((left, right) => {
      const byId = left.id.localeCompare(right.id);
      return byId === 0 ? left.version.localeCompare(right.version) : byId;
    });
  }
}
