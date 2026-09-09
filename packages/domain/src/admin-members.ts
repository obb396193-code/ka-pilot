import { z } from "zod";
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`); return !v.startsWith("0000-") && Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
});
const timestamp = z.string().datetime({ offset: true }).refine(v => date.safeParse(v.slice(0, 10)).success);
const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const meta = z.object({ requestId, dataAsOf: timestamp.nullable(), businessDate: date,
  workspaceKind: z.enum(["personal", "team"]), selectedSource: z.literal("platform") }).strict();
export const adminMemberSchema = z.object({ identityId: uuid, userId: uuid, displayName: z.string().min(1).max(256),
  provider: z.enum(["internal_test", "buc"]), role: z.enum(["admin", "lead", "operator", "optimizer"]), isActive: z.boolean(),
  joinedAt: date, grantsCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), lastSeenAt: timestamp.nullable() }).strict();
export const adminMemberGrantSchema = z.object({ media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), accessLevel: z.enum(["read", "preview", "execute"]), grantedAt: date }).strict();
export const adminMembersDataSchema = z.object({ items: z.array(adminMemberSchema).max(1000) }).strict().refine(({ items }) =>
  new Set(items.map(x => x.identityId)).size === items.length && new Set(items.map(x => x.userId)).size === items.length, "Duplicate member");
export const adminMemberGrantsDataSchema = z.object({ identityId: uuid, items: z.array(adminMemberGrantSchema).max(1000) }).strict().refine(({ items }) =>
  new Set(items.map(x => `${x.media}:${x.accountId}`)).size === items.length, "Duplicate grant tuple");
const error = z.object({ ok: z.literal(false), error: z.object({
  code: z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR"]),
  message: z.string().min(1).max(512), requestId, retryable: z.boolean(),
}).strict() }).strict();
export const adminMembersResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: adminMembersDataSchema, meta }).strict(), error]);
export const adminMemberGrantsResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: adminMemberGrantsDataSchema, meta }).strict(), error]);
export type AdminMembersData = z.infer<typeof adminMembersDataSchema>;
export type AdminMemberGrantsData = z.infer<typeof adminMemberGrantsDataSchema>;
