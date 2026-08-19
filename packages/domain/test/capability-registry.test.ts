import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CapabilityRegistry,
  assertCapabilityMetadata,
  type CapabilityDefinition,
} from "../src/capability-registry.js";

function capability(
  overrides: Partial<CapabilityDefinition> = {},
): CapabilityDefinition {
  return {
    id: "query_account_metrics",
    version: "1.0.0",
    kind: "data",
    mode: "read",
    description: "Query canonical account metrics",
    requiredPermissions: ["metrics:read"],
    supportsSimulation: true,
    timeoutMs: 10_000,
    maxAttempts: 2,
    inputSchema: z.object({ accountId: z.string().uuid() }).strict(),
    outputSchema: z.object({ cost: z.number().nonnegative() }).strict(),
    ...overrides,
  };
}

describe("CapabilityRegistry", () => {
  it("registers exact versions and resolves without silent upgrades", () => {
    const v1 = capability();
    const v2 = capability({ version: "2.0.0", description: "New query implementation" });
    const registry = new CapabilityRegistry([v2, v1]);

    expect(registry.resolve(v1.id, "1.0.0")).toMatchObject({ version: "1.0.0" });
    expect(registry.resolve(v1.id, "2.0.0")).toMatchObject({ version: "2.0.0" });
    expect(registry.list().map((entry) => `${entry.id}@${entry.version}`)).toEqual([
      "query_account_metrics@1.0.0",
      "query_account_metrics@2.0.0",
    ]);
    expect(() => registry.resolve(v1.id, "3.0.0")).toThrow("Unknown capability version");
  });

  it("rejects duplicate exact capability versions", () => {
    expect(() => new CapabilityRegistry([capability(), capability()])).toThrow(
      "Duplicate capability",
    );
  });

  it.each([
    [{ id: "Unsafe-ID" }, "safe snake_case"],
    [{ version: "latest" }, "semantic version"],
    [{ description: " " }, "description"],
    [{ requiredPermissions: ["metrics:read", "metrics:read"] }, "duplicate permission"],
    [{ requiredPermissions: ["../../secret"] }, "permission"],
    [{ timeoutMs: 0 }, "timeoutMs"],
    [{ timeoutMs: 900_001 }, "timeoutMs"],
    [{ maxAttempts: 0 }, "maxAttempts"],
    [{ maxAttempts: 11 }, "maxAttempts"],
  ] as const)("rejects malformed capability metadata %#", (overrides, message) => {
    expect(() => new CapabilityRegistry([capability(overrides)])).toThrow(message);
  });

  it("requires execute capabilities to be confirmable and idempotent", () => {
    expect(() =>
      new CapabilityRegistry([
        capability({ kind: "action", mode: "execute", supportsSimulation: true }),
      ]),
    ).toThrow("idempotencyScope");

    expect(() =>
      new CapabilityRegistry([
        capability({
          kind: "action",
          mode: "execute",
          supportsSimulation: true,
          idempotencyScope: "node",
        }),
      ]),
    ).toThrow("requiresConfirmation");

    expect(() =>
      new CapabilityRegistry([
        capability({
          kind: "action",
          mode: "execute",
          supportsSimulation: false,
          idempotencyScope: "node",
          requiresConfirmation: true,
        }),
      ]),
    ).toThrow("simulation preview");
  });

  it("never allows execute capabilities to be exposed directly to an Agent", () => {
    expect(() =>
      new CapabilityRegistry([
        capability({
          kind: "action",
          mode: "execute",
          supportsSimulation: true,
          idempotencyScope: "object",
          requiresConfirmation: true,
          exposeToAgent: true,
        }),
      ]),
    ).toThrow("cannot be exposed directly to an Agent");
  });

  it("accepts a confirmable, simulatable execute capability", () => {
    const execute = capability({
      id: "change_bid",
      kind: "action",
      mode: "execute",
      supportsSimulation: true,
      idempotencyScope: "object",
      requiresConfirmation: true,
    });

    expect(new CapabilityRegistry([execute]).resolve("change_bid", "1.0.0")).toMatchObject({
      mode: "execute",
      requiresConfirmation: true,
    });
  });

  it("shares metadata validation with non-workflow adapters", () => {
    expect(() =>
      assertCapabilityMetadata({ id: "unsafe id", description: "Read", mode: "read" }),
    ).toThrow("safe snake_case");
    expect(() =>
      assertCapabilityMetadata({ id: "read_metrics", description: "Read", mode: "execute" }),
    ).not.toThrow();
  });
});
