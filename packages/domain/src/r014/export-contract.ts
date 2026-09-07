import { z } from "zod";

// v1.5 7.4 任务化导出。表 exports；文件是临时签名 URL，TTL 10 分钟。
export const exportKindSchema = z.enum(["query", "view", "report"]);
export const exportFormatSchema = z.enum(["xlsx", "png", "pdf"]);
export const exportStatusSchema = z.enum(["queued", "running", "done", "failed"]);
export type ExportStatus = z.infer<typeof exportStatusSchema>;

export const exportRefSchema = z.union([
  z.object({ queryId: z.string().min(1).max(120), params: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ viewId: z.string().uuid() }).strict(),
  z.object({ reportConfigId: z.string().uuid() }).strict(),
]);
export type ExportRef = z.infer<typeof exportRefSchema>;

export const exportCreateSchema = z.object({
  kind: exportKindSchema,
  ref: exportRefSchema,
  format: exportFormatSchema,
}).strict().superRefine((value, context) => {
  // kind 与 ref 必须同构，否则渲染器拿到的 ref 会和它以为的类型对不上。
  const matches =
    (value.kind === "query" && "queryId" in value.ref) ||
    (value.kind === "view" && "viewId" in value.ref) ||
    (value.kind === "report" && "reportConfigId" in value.ref);
  if (!matches) {
    context.addIssue({ code: "custom", message: `export ref does not match kind ${value.kind}`, path: ["ref"] });
  }
});
export type ExportCreate = z.infer<typeof exportCreateSchema>;

export const exportFileSchema = z.object({
  url: z.string().url(),
  bytes: z.number().int().nonnegative(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

// 排队回执（POST /export）只有四个键，没有 file/error——fixture exports/queued.json 即此形。
export const exportQueuedSchema = z.object({
  exportId: z.string().uuid(),
  status: z.literal("queued"),
  kind: exportKindSchema,
  format: exportFormatSchema,
}).strict();
export type ExportQueued = z.infer<typeof exportQueuedSchema>;

// 详情（GET /exports/:id）才带 file/error；未完成的详情两键可缺省，缺省即 null。
export const exportRecordSchema = z.object({
  exportId: z.string().uuid(),
  status: exportStatusSchema,
  kind: exportKindSchema,
  format: exportFormatSchema,
  file: exportFileSchema.nullable().default(null),
  error: z.string().nullable().default(null),
}).strict().superRefine((value, context) => {
  // done 必须有文件、失败必须有原因、未完成一律没有文件——不让前端拿到"完成但没文件"。
  if (value.status === "done" && value.file === null) {
    context.addIssue({ code: "custom", message: "a finished export must carry its file", path: ["file"] });
  }
  if (value.status !== "done" && value.file !== null) {
    context.addIssue({ code: "custom", message: "only a finished export may carry a file", path: ["file"] });
  }
  if (value.status === "failed" && value.error === null) {
    context.addIssue({ code: "custom", message: "a failed export must carry its error", path: ["error"] });
  }
  if (value.status !== "failed" && value.error !== null) {
    context.addIssue({ code: "custom", message: "only a failed export may carry an error", path: ["error"] });
  }
});
export type ExportRecord = z.infer<typeof exportRecordSchema>;
