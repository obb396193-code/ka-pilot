import { z } from "zod";

const contextKindSchema = z.enum([
  "workspace",
  "page",
  "task",
  "account",
  "report",
  "workflow",
  "dataset",
  "changeset",
]);

export const agentContextRefSchema = z
  .object({
    kind: contextKindSchema,
    id: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200).optional(),
    snapshotVersion: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type AgentContextKind = z.infer<typeof contextKindSchema>;
export type AgentContextRef = z.infer<typeof agentContextRefSchema>;

export function parseAgentContextRefs(input: unknown): AgentContextRef[] {
  const refs = z.array(agentContextRefSchema).max(50).parse(input);
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) throw new Error(`Duplicate Agent context reference: ${key}`);
    seen.add(key);
  }
  return refs;
}
