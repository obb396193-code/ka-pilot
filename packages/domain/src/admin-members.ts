import { z } from "zod";
import { internalTestLoginRequestSchema, sessionViewSchema } from "./session-http-contract.js";
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

// v1.9.21: additive until the new provisioning/list HTTP composition is wired.
// A plain `$` also matches before a final newline in JavaScript: require true end.
const loginName = z.string().min(1).max(128).regex(/^[A-Za-z0-9._@-]{1,128}$(?![\s\S])/);
// New identities must be able to pass the EXISTING login/session wire contract:
// password max512, displayName max200. Storage's wider bounds are not login support.
const initialPassword = internalTestLoginRequestSchema.shape.password.min(12);
const createBase = z.object({ display_name: sessionViewSchema.shape.identity.shape.displayName,
  provider_subject: loginName, role: adminMemberSchema.shape.role }).strict();
export const adminMemberCreateRequestSchema = z.discriminatedUnion("provider", [
  createBase.extend({ provider: z.literal("internal_test"), initial_password: initialPassword.optional() }).strict(),
  createBase.extend({ provider: z.literal("buc") }).strict(),
]);
export const adminMemberResetPasswordRequestSchema = z.object({}).strict();
export const adminMemberV195Schema = adminMemberSchema.extend({ mustChangePassword: z.boolean() }).strict();
export const adminMembersV195DataSchema = z.object({ items: z.array(adminMemberV195Schema).max(1000) }).strict().refine(({ items }) =>
  new Set(items.map(x => x.identityId)).size === items.length && new Set(items.map(x => x.userId)).size === items.length, "Duplicate member");
export const adminMemberCreatedDataSchema = z.discriminatedUnion("provider", [
  adminMemberV195Schema.extend({ provider: z.literal("internal_test"), loginName, initialPassword }).strict(),
  adminMemberV195Schema.extend({ provider: z.literal("buc"), loginName }).strict(),
]);
export const adminMemberResetPasswordDataSchema = z.object({ identityId: uuid, initialPassword,
  sessionsRevoked: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const commandError = error.extend({ error: error.shape.error.extend({
  code: z.enum([...error.shape.error.shape.code.options, "CONFLICT", "READ_ONLY_ROLE"]),
}).strict() }).strict();
export const adminMemberCreatedResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: adminMemberCreatedDataSchema, meta }).strict(), commandError,
]);
export const adminMemberResetPasswordResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: adminMemberResetPasswordDataSchema, meta }).strict(), commandError,
]);
export const adminMembersV195ResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: adminMembersV195DataSchema, meta }).strict(), commandError,
]);
export type AdminMemberCreateRequest = z.infer<typeof adminMemberCreateRequestSchema>;
export type AdminMemberCreatedData = z.infer<typeof adminMemberCreatedDataSchema>;
export type AdminMemberResetPasswordData = z.infer<typeof adminMemberResetPasswordDataSchema>;
