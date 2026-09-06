import { randomUUID } from "node:crypto";
import { parseBootstrapSeed, type BootstrapSeed } from "@ka/domain";

interface BootstrapClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  release(destroy?: boolean): void;
}
interface BootstrapPool { connect(): Promise<BootstrapClient> }
export interface BootstrapSeedResult {
  inserted: number;
  workspaces: Array<{ id: string; kind: "personal" | "team" }>;
  memberships: Array<{ workspaceId: string; identityId: string; userId: string }>;
}
const fail = () => new Error("Bootstrap seed failed");
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class RetryBootstrap extends Error {}

/** Operator-only initial provisioning. No UPDATE, credentials, automatic grant discovery or media writes. */
export class BootstrapSeedRepository {
  constructor(private readonly pool: BootstrapPool) {}

  async seed(value: unknown): Promise<BootstrapSeedResult> {
    try {
      const input = parseBootstrapSeed(value);
      for (let attempt = 0; attempt < 3; attempt++) {
        try { return await this.transaction(input); } catch (error) {
          if (!(error instanceof RetryBootstrap) || attempt === 2) throw fail();
        }
      }
      throw fail();
    } catch { throw fail(); }
  }

  private async transaction(input: BootstrapSeed): Promise<BootstrapSeedResult> {
    const client = await this.pool.connect();
    let destroy = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      // One initial-provisioning lock also serializes missing (kind,name) rows between seeds.
      await client.query("SELECT pg_advisory_xact_lock(126257, 13013)");
      const result = await new BootstrapTransaction(client).run(input);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { destroy = true; }
      // Concurrent non-seed provisioning can also race a unique key; retry the full read/validate transaction.
      if (!destroy && error !== null && typeof error === "object" && "code" in error &&
        (error.code === "40001" || error.code === "23505")) throw new RetryBootstrap();
      throw fail();
    } finally { client.release(destroy); }
  }
}

class BootstrapTransaction {
  private readonly result: BootstrapSeedResult = { inserted: 0, workspaces: [], memberships: [] };
  private readonly identities = new Set<string>();
  private readonly personalSpaces = new Set<string>();
  constructor(private readonly client: BootstrapClient) {}

  private async one(sql: string, values: unknown[]): Promise<Record<string, unknown> | undefined> {
    const { rows } = await this.client.query(sql, values);
    if (rows.length > 1) throw fail();
    return rows[0];
  }
  private async insert(sql: string, values: unknown[], allowConflict = false): Promise<void> {
    const { rowCount } = await this.client.query(sql, values);
    if (rowCount !== 1 && !(allowConflict && rowCount === 0)) throw fail();
    this.result.inserted += rowCount;
  }
  private async identity(id: string): Promise<Record<string, unknown>> {
    const row = await this.one("/* bootstrap-identity */ SELECT id,display_name,is_active FROM auth_identities WHERE id=$1 FOR UPDATE", [id]);
    if (row?.id !== id || row.is_active !== true || typeof row.display_name !== "string" || !row.display_name.trim()) throw fail();
    this.identities.add(id);
    return row;
  }
  private async workspace(id: string): Promise<Record<string, unknown>> {
    const row = await this.one("/* bootstrap-workspace */ SELECT id,name,kind,is_active FROM workspaces WHERE id=$1 FOR UPDATE", [id]);
    if (row?.id !== id || row.is_active !== true || (row.kind !== "personal" && row.kind !== "team")) throw fail();
    if (row.kind === "personal") this.personalSpaces.add(id);
    return row;
  }
  private async actor(id: string, workspaceId: string, role: string): Promise<void> {
    const row = await this.one("/* bootstrap-actor */ SELECT id,workspace_id,role,is_active FROM users WHERE id=$1 FOR UPDATE", [id]);
    if (row?.id !== id || row.workspace_id !== workspaceId || row.role !== role || row.is_active !== true) throw fail();
  }

  async run(input: BootstrapSeed): Promise<BootstrapSeedResult> {
    for (const item of input.identities) {
      await this.insert(`INSERT INTO auth_identities(id,provider,provider_subject,display_name)
        VALUES($1::uuid,'internal_test',$1::text,$2) ON CONFLICT (id) DO NOTHING`, [item.id, item.display_name], true);
      await this.identity(item.id); // Existing provider/subject/name deliberately remain unchanged.
    }
    for (const item of input.workspaces) {
      let row = await this.one(`/* bootstrap-workspace */ SELECT id,name,kind,is_active FROM workspaces
        WHERE ($1::uuid IS NOT NULL AND id=$1) OR ($1::uuid IS NULL AND kind=$2 AND name=$3)
        ORDER BY id LIMIT 2 FOR UPDATE`, [item.id ?? null, item.kind, item.name]);
      if (!row) {
        const id = item.id ?? randomUUID();
        await this.insert("INSERT INTO workspaces(id,kind,name) VALUES($1,$2,$3)", [id, item.kind, item.name]);
        row = await this.workspace(id);
      }
      if (!uuid(row.id) || row.kind !== item.kind || row.name !== item.name || row.is_active !== true) throw fail();
      if (row.kind === "personal") this.personalSpaces.add(row.id);
      if (!this.result.workspaces.some((saved) => saved.id === row.id)) this.result.workspaces.push({ id: row.id, kind: item.kind });
    }
    for (const item of input.memberships) {
      const identity = await this.identity(item.identity_id);
      await this.workspace(item.workspace_id);
      const existing = await this.one(`/* bootstrap-member */ SELECT workspace_id,identity_id,user_id,role,is_active
        FROM workspace_memberships WHERE workspace_id=$1 AND identity_id=$2 FOR UPDATE`, [item.workspace_id, item.identity_id]);
      if (existing && (existing.workspace_id !== item.workspace_id || existing.identity_id !== item.identity_id ||
        existing.is_active !== true || existing.role !== item.role || !uuid(existing.user_id) ||
        (item.user_id !== undefined && existing.user_id !== item.user_id))) throw fail();
      const userId = existing ? existing.user_id as string : item.user_id ?? randomUUID();
      if (!existing) {
        await this.insert(`INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,$3,$4)
          ON CONFLICT (id) DO NOTHING`, [userId, item.workspace_id, identity.display_name, item.role], true);
      }
      await this.actor(userId, item.workspace_id, item.role);
      if (!existing) await this.insert(`INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role)
        VALUES($1,$2,$3,$4)`, [item.workspace_id, item.identity_id, userId, item.role]);
      if (!this.result.memberships.some((row) => row.workspaceId === item.workspace_id && row.identityId === item.identity_id)) {
        this.result.memberships.push({ workspaceId: item.workspace_id, identityId: item.identity_id, userId });
      }
    }
    for (const item of input.grants) {
      const workspace = await this.workspace(item.workspace_id);
      if (workspace.kind !== "personal") throw fail();
      const member = await this.one(`/* bootstrap-grant-member */ SELECT workspace_id,identity_id,user_id,role,is_active
        FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 LIMIT 2 FOR UPDATE`, [item.workspace_id, item.user_id]);
      if (!member || member.workspace_id !== item.workspace_id || member.user_id !== item.user_id || member.is_active !== true ||
        !uuid(member.identity_id) || typeof member.role !== "string") throw fail();
      await this.identity(member.identity_id); await this.actor(item.user_id, item.workspace_id, member.role);
      // status defaults to active on legacy schema, so explicitly preserve unknown here.
      await this.insert(`INSERT INTO accounts(workspace_id,media,account_id,status) VALUES($1,$2,$3,NULL)
        ON CONFLICT (workspace_id,media,account_id) DO NOTHING`, [item.workspace_id, item.media, item.account_id], true);
      await this.insert(`INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level)
        VALUES($1,$2,$3,$4,'read') ON CONFLICT (workspace_id,identity_id,media,account_id) DO NOTHING`,
      [item.workspace_id, member.identity_id, item.media, item.account_id], true);
    }
    for (const id of this.identities) {
      const { rows } = await this.client.query(`/* bootstrap-personal-count */ SELECT membership.workspace_id
        FROM workspace_memberships membership JOIN workspaces workspace ON workspace.id=membership.workspace_id
        WHERE membership.identity_id=$1 AND membership.is_active AND workspace.is_active AND workspace.kind='personal'
        ORDER BY membership.workspace_id LIMIT 2`, [id]);
      if (rows.length > 1) throw fail();
      const grants = await this.client.query(`/* bootstrap-grant-count */ SELECT access_grant.account_id
        FROM account_access_grants access_grant JOIN workspaces workspace ON workspace.id=access_grant.workspace_id
        WHERE access_grant.identity_id=$1 AND workspace.is_active AND workspace.kind='personal'
        ORDER BY access_grant.workspace_id,access_grant.media,access_grant.account_id LIMIT 1001`, [id]);
      if (grants.rows.length > 1000) throw fail();
    }
    for (const workspaceId of this.personalSpaces) {
      const { rows } = await this.client.query(`/* bootstrap-shared-count */ SELECT identity_id FROM workspace_memberships
        WHERE workspace_id=$1 AND is_active ORDER BY identity_id LIMIT 2`, [workspaceId]);
      if (rows.length > 1) throw fail();
    }
    return this.result;
  }
}
