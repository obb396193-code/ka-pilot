import {
  DEFAULT_IDENTITY_PREFERENCES,
  applyPreferencesPatch,
  identityPreferencesPatchSchema,
  identityPreferencesSchema,
  type IdentityPreferences,
  type IdentityPreferencesPatch,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, inTransaction, lockActiveIdentity, requireTimestamp, requireUuid,
} from "./workspace-authority.js";

// v1.7.1：偏好挂在 identity 上，跨 workspace 共用一行；不改 AUTH-001 的 session 响应。
function mapRow(row: Record<string, unknown>): IdentityPreferences {
  const stored = row.preferences;
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    throw new R014RepositoryError("INVALID_RESULT");
  }
  const updatedAt = row.updated_at === null ? null : requireTimestamp(row.updated_at).toISOString();
  const candidate = stored as Record<string, unknown>;
  const parsed = identityPreferencesSchema.safeParse({
    theme: candidate.theme ?? DEFAULT_IDENTITY_PREFERENCES.theme,
    locale: candidate.locale ?? null,
    updatedAt,
  });
  // 存量 JSONB 是自由结构；解析不了就当"没设置过"返回默认，而不是把坏值透给前端。
  if (!parsed.success) return { ...DEFAULT_IDENTITY_PREFERENCES, updatedAt };
  return parsed.data;
}

export class IdentityPreferencesRepository {
  constructor(private readonly pool: Pool) {}

  /** 从未设置过 → 返回默认（mode=bw），不建行；读不产生写。 */
  async get(identityId: string): Promise<IdentityPreferences> {
    const identity = requireUuid(identityId);
    const result = await this.pool.query(
      "SELECT preferences, updated_at FROM identity_preferences WHERE identity_id=$1",
      [identity],
    );
    if (result.rows.length === 0) return DEFAULT_IDENTITY_PREFERENCES;
    if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  async patch(identityId: string, patch: IdentityPreferencesPatch): Promise<IdentityPreferences> {
    const identity = requireUuid(identityId);
    const parsedPatch = identityPreferencesPatchSchema.safeParse(patch);
    if (!parsedPatch.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = parsedPatch.data; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockActiveIdentity(client, identity);
      const existing = await client.query(
        "SELECT preferences, updated_at FROM identity_preferences WHERE identity_id=$1 FOR UPDATE",
        [identity],
      );
      const current = existing.rows.length === 1
        ? mapRow(existing.rows[0] as Record<string, unknown>)
        : DEFAULT_IDENTITY_PREFERENCES;
      const next = applyPreferencesPatch(current, fixed);
      const result = await client.query(
        `INSERT INTO identity_preferences (identity_id, preferences, updated_at)
         VALUES ($1,$2::jsonb,now())
         ON CONFLICT (identity_id) DO UPDATE SET preferences=EXCLUDED.preferences, updated_at=now()
         RETURNING preferences, updated_at`,
        [identity, JSON.stringify(next)],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      const saved = mapRow(result.rows[0] as Record<string, unknown>);
      if (saved.theme.mode !== next.theme.mode || saved.locale !== next.locale) {
        throw new R014RepositoryError("INVALID_RESULT");
      }
      return saved;
    });
  }
}
