import { agentModelCapabilityRowSchema, agentModelCatalogSchema, approvedWorkspaceAuthContextSchema, type AgentModelCatalog } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

export class AgentModelCatalogError extends Error {
  constructor(readonly code: "FORBIDDEN" | "SOURCE_UNAVAILABLE" | "SOURCE_TRUNCATED" | "UPSTREAM_INVALID_RESPONSE") {
    super(`Model catalog: ${code}`);
  }
}

/** Global non-business capability metadata. No credential or account table is read.
 * A catalog entry is not proof of per-user credentials or runtime readiness.
 */
export class AgentModelCatalogRepository {
  constructor(private readonly pool: Pool) {}
  async list(rawAuth: unknown): Promise<AgentModelCatalog> {
    if (!approvedWorkspaceAuthContextSchema.safeParse(rawAuth).success) throw new AgentModelCatalogError("FORBIDDEN");
    try {
      return await withSemanticReadSnapshot(this.pool, async connection => {
        const { rows } = await connection.query<Record<string, unknown>>(`/* agent-model-catalog */
          SELECT CASE WHEN octet_length(provider_id)<=256 THEN provider_id END AS provider_id,
            CASE WHEN octet_length(model)<=256 THEN model END AS model,
            CASE WHEN octet_length(status)<=64 THEN status END AS status, tested_at,
            CASE WHEN test_version IS NULL OR octet_length(test_version)<=1024 THEN test_version ELSE '' END AS test_version
          FROM provider_model_capabilities
          ORDER BY provider_id COLLATE "C", model COLLATE "C" LIMIT 1001`);
        if (rows.length > 1000) throw new AgentModelCatalogError("SOURCE_TRUNCATED");
        const items = rows.map(row => {
          const timestamp = row.tested_at instanceof Date && Number.isFinite(row.tested_at.valueOf())
            ? row.tested_at.toISOString() : row.tested_at;
          const parsed = agentModelCapabilityRowSchema.safeParse({ ...row, tested_at: timestamp });
          if (!parsed.success) throw new AgentModelCatalogError("UPSTREAM_INVALID_RESPONSE");
          const value = parsed.data;
          const status = value.status === "failed" ? "disabled" : value.status === "verified" &&
            (value.tested_at === null || value.test_version === null) ? "documented_unverified" : value.status;
          return { id: value.model, provider: value.provider_id, label: value.model, default: false, status };
        });
        const result = agentModelCatalogSchema.safeParse({ items });
        if (!result.success) throw new AgentModelCatalogError("UPSTREAM_INVALID_RESPONSE");
        return result.data;
      });
    } catch (error) {
      if (error instanceof AgentModelCatalogError) throw error;
      throw new AgentModelCatalogError("SOURCE_UNAVAILABLE");
    }
  }
}
