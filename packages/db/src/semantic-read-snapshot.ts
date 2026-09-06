import type { Pool, PoolClient } from "pg";

export type SemanticReadConnection = Pick<PoolClient, "query">;

/** Internal server callback only. Multi-query pages must not obtain fresh pool connections midway. */
export async function withSemanticReadSnapshot<T>(
  pool: Pick<Pool, "connect">,
  read: (connection: SemanticReadConnection) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  const onError = (): void => { destroy = true; };
  client.on("error", onError);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='15s'");
    const result = await read(client);
    if (destroy) throw new Error("Semantic read connection was lost");
    await client.query("COMMIT");
    if (destroy) throw new Error("Semantic read connection was lost");
    return result;
  } catch (error) {
    if (!destroy) {
      try { await client.query("ROLLBACK"); } catch { destroy = true; }
    }
    throw error;
  } finally {
    client.removeListener("error", onError);
    client.release(destroy);
  }
}
