import { initialCoefficientSeedRows, parseCoefficientSeed, type CoefficientSeed } from "@ka/domain";

export interface CoefficientSeedClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  release(destroy?: boolean): void;
}
export interface CoefficientSeedPool { connect(): Promise<CoefficientSeedClient> }
export interface CoefficientSeedResult { inserted: number; skipped: number }
const failed = () => new Error("Coefficient seed failed");
class RetrySeedTransaction extends Error {}

function exactDecimal(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/.test(value)) throw failed();
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole!.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

/** Initial deployment only; future changes must use the versioning/recompute workflow. */
export class CoefficientSeedRepository {
  constructor(private readonly pool: CoefficientSeedPool) {}

  async seed(value: unknown): Promise<CoefficientSeedResult> {
    try {
      const input = parseCoefficientSeed(value);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { return await this.transaction(input); } catch (error) {
          if (!(error instanceof RetrySeedTransaction) || attempt === 2) throw failed();
        }
      }
      throw failed();
    } catch {
      throw failed();
    }
  }

  private async transaction(input: CoefficientSeed): Promise<CoefficientSeedResult> {
    const client = await this.pool.connect();
    let destroy = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      const result = await this.seedInTransaction(client, input);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { destroy = true; }
      if (!destroy && error !== null && typeof error === "object" && "code" in error && error.code === "40001") throw new RetrySeedTransaction();
      throw failed();
    } finally {
      client.release(destroy);
    }
  }

  private async seedInTransaction(client: CoefficientSeedClient, input: CoefficientSeed): Promise<CoefficientSeedResult> {
    const workspace = await client.query(
      `/* coefficient-seed-workspace */ SELECT kind, is_active FROM workspaces WHERE id=$1 FOR UPDATE`,
      [input.workspace_id],
    );
    if (workspace.rows.length !== 1 || workspace.rows[0]?.kind !== "personal" || workspace.rows[0]?.is_active !== true) throw failed();
    const initial = initialCoefficientSeedRows();
    const existing = await client.query(
      `/* coefficient-seed-existing */ SELECT media, op, coefficient::text, effective_date::text
       FROM channel_coefficients WHERE workspace_id=$1 AND media=ANY($2::text[])
       ORDER BY media COLLATE "C", effective_date, id LIMIT 5`,
      [input.workspace_id, initial.map((row) => row.media)],
    );
    if (existing.rows.length > initial.length) throw failed();
    const seen = new Set<string>();
    for (const row of existing.rows) {
      const expected = initial.find((candidate) => candidate.media === row.media);
      if (expected === undefined || seen.has(expected.media) || row.op !== expected.op ||
        row.effective_date !== input.effective_date || exactDecimal(row.coefficient) !== expected.coefficient) throw failed();
      seen.add(expected.media);
    }
    let inserted = 0;
    for (const row of initial) {
      if (seen.has(row.media)) continue;
      const result = await client.query(
        `INSERT INTO channel_coefficients (workspace_id, media, op, coefficient, effective_date, changed_by)
         VALUES ($1,$2,$3,$4::numeric,$5::date,NULL)`,
        [input.workspace_id, row.media, row.op, row.coefficient, input.effective_date],
      );
      if (result.rowCount !== 1) throw failed();
      inserted += 1;
    }
    return { inserted, skipped: seen.size };
  }
}
