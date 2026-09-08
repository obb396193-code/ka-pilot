import { adminCalendarDataSchema, approvedWorkspaceAuthContextSchema, type AdminCalendarData } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

export class AdminCalendarError extends Error {
  constructor(readonly code: "FORBIDDEN" | "SOURCE_TRUNCATED" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT") {
    super(`Calendar request: ${code}`);
  }
}
export interface AdminCalendarSnapshot extends AdminCalendarData { workspaceId: string }
/** Workspace configuration, not account data. Never infer admin from the browser. */
export class AdminCalendarRepository {
  constructor(private readonly pool: Pool) {}
  async list(rawAuth: unknown): Promise<AdminCalendarSnapshot> {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success || auth.data.role !== "admin") throw new AdminCalendarError("FORBIDDEN");
    try {
      return await withSemanticReadSnapshot(this.pool, async client => {
        const { rows } = await client.query(`/* admin-calendar */
          SELECT workspace_id, id::text AS id, to_char(event_date,'YYYY-MM-DD') AS event_date,
            CASE WHEN octet_length(event_type)<=64 THEN event_type END AS event_type,
            CASE WHEN octet_length(label)<=2048 THEN label END AS label, affects_baseline,
            CASE WHEN threshold_profile IS NULL OR octet_length(threshold_profile)<=1024 THEN threshold_profile ELSE '' END AS threshold_profile
          FROM business_calendar WHERE workspace_id=$1
          ORDER BY business_calendar.event_date DESC,business_calendar.id DESC LIMIT 10001`, [auth.data.workspaceId]);
        if (rows.length > 10000) throw new AdminCalendarError("SOURCE_TRUNCATED");
        const items = rows.map(row => {
          if (row.workspace_id !== auth.data.workspaceId || typeof row.id !== "string" || !/^[1-9][0-9]{0,18}$/.test(row.id))
            throw new AdminCalendarError("UPSTREAM_INVALID_RESPONSE");
          return { id: Number(row.id), eventDate: row.event_date, eventType: row.event_type,
            label: row.label, affectsBaseline: row.affects_baseline, thresholdProfile: row.threshold_profile };
        });
        const result = adminCalendarDataSchema.safeParse({ items });
        if (!result.success) throw new AdminCalendarError("UPSTREAM_INVALID_RESPONSE");
        return { workspaceId: auth.data.workspaceId, ...result.data };
      });
    } catch (error) {
      if (error instanceof AdminCalendarError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "57014") throw new AdminCalendarError("UPSTREAM_TIMEOUT");
      throw new AdminCalendarError("SOURCE_UNAVAILABLE");
    }
  }
}
