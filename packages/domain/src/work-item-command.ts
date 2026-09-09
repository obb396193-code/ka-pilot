import { z } from "zod";

// Internal storage command. Not a substitute for the public action response DTO.
const workItemId = z.string().uuid();
const reason = z.string().max(4096).refine(value => value.trim().length > 0);
export const workItemCommandSchema = z.discriminatedUnion("action", [
  z.object({ workItemId, action: z.literal("start_processing") }).strict(),
  z.object({ workItemId, action: z.literal("ignore"), reason: reason.optional() }).strict(),
  z.object({ workItemId, action: z.literal("reject"), reason }).strict(),
]);
export type WorkItemCommand = z.infer<typeof workItemCommandSchema>;
