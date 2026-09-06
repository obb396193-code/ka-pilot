import { z } from "zod";

import { authRoleSchema, workspaceKindSchema } from "./auth-context.js";

const uuid = z.string().uuid();
const label = z.string().min(1).max(200).refine((value) =>
  value.trim().length > 0 && [...value].every((char) => {
    const point = char.codePointAt(0)!;
    return point >= 32 && point !== 127;
  }), "Invalid label");

const identity = z.object({ id: uuid, display_name: label }).strict();
const workspace = z.object({ id: uuid.optional(), kind: workspaceKindSchema, name: label }).strict();
const membership = z.object({
  identity_id: uuid,
  workspace_id: uuid,
  user_id: uuid.optional(),
  role: authRoleSchema,
}).strict();
const grant = z.object({
  workspace_id: uuid,
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  account_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  user_id: uuid,
}).strict();

/** Operator-only input: never accepts credentials or implicit account discovery. */
export const bootstrapSeedSchema = z.object({
  identities: z.array(identity).max(1_000),
  workspaces: z.array(workspace).max(1_000),
  memberships: z.array(membership).max(1_000),
  grants: z.array(grant).max(1_000),
}).strict().superRefine((seed, context) => {
  const consistent = <T>(rows: readonly T[], key: (row: T) => string) => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const id = key(row);
      const serialized = JSON.stringify(row);
      const previous = seen.get(id);
      if (previous !== undefined && previous !== serialized) {
        context.addIssue({ code: "custom", message: "Conflicting seed entries" });
        return;
      }
      seen.set(id, serialized);
    }
  };
  consistent(seed.identities, (row) => row.id);
  consistent(seed.workspaces, (row) => row.id ?? JSON.stringify([row.kind, row.name]));
  consistent(seed.memberships, (row) => JSON.stringify([row.workspace_id, row.identity_id]));
});

export type BootstrapSeed = z.infer<typeof bootstrapSeedSchema>;

/** Fixed error text deliberately omits Zod issues, input keys and values. */
export function parseBootstrapSeed(value: unknown): BootstrapSeed {
  const parsed = bootstrapSeedSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid bootstrap seed");
  return parsed.data;
}
