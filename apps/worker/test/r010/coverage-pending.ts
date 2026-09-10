import { z } from "zod";

const schema = z.object({
  path: z.string().regex(/^\/api\/v1\/[A-Za-z0-9_/:.-]+$/),
  owner: z.string().trim().min(1),
  direction: z.enum(["backend_to_bff", "bff_to_backend"]),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();
export type PendingCoverage = z.infer<typeof schema>;

// Explicit arch v1.9.19 debt only. No permanent exemption; Shanghai deadline is inclusive.
export const PENDING: readonly PendingCoverage[] = [
  { path: "/api/v1/system/etl-runs", owner: "F8-15", direction: "backend_to_bff", expiresAt: "2026-09-12T00:00:00+08:00" },
  { path: "/api/v1/admin/data/reconcile", owner: "F8-15", direction: "backend_to_bff", expiresAt: "2026-09-12T00:00:00+08:00" },
  { path: "/api/v1/admin/members/:p/reset-password", owner: "F-OS-004", direction: "bff_to_backend", expiresAt: "2026-09-12T00:00:00+08:00" },
  // arch 2026-09-10 主门禁修复：这两条后端**已实现**（be2 task-tab-routes 一条正则 `(materials|review)` 交替组回 501），
  // 是本盘点器不展开交替组才看成「后端不存在」。登记到 Codex P-196（展开交替组）落地为止，落地后必须删。
  { path: "/api/v1/tasks/:p/materials", owner: "P-196", direction: "bff_to_backend", expiresAt: "2026-09-12T00:00:00+08:00" },
  { path: "/api/v1/tasks/:p/review", owner: "P-196", direction: "bff_to_backend", expiresAt: "2026-09-12T00:00:00+08:00" },
];

export function pendingCoveragePaths(
  entries: readonly PendingCoverage[], direction: PendingCoverage["direction"], missing: readonly string[], now: Date,
): string[] {
  if (!Number.isFinite(now.valueOf())) throw new Error("Invalid coverage clock");
  const seen = new Set<string>();
  const active: string[] = [];
  for (const raw of entries) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error("Invalid pending coverage metadata");
    const entry = parsed.data, key = `${entry.direction}:${entry.path}`;
    if (seen.has(key)) throw new Error("Duplicate pending coverage entry");
    seen.add(key);
    if (entry.direction !== direction) continue;
    if (!missing.includes(entry.path)) throw new Error(`Remove resolved coverage debt: ${entry.owner} ${entry.path}`);
    if (now.valueOf() < Date.parse(entry.expiresAt)) active.push(entry.path);
  }
  return active;
}
