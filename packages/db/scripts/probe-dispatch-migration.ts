/** Local, synthetic, rollback-only probe. Not a migration or runtime entry. */
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname))
  throw new Error("Probe restricted to local55432 isolated ka_*_test");
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = await readFile(path.join(packageRoot, "../contract/schema.sql"), "utf8");
const frozen = /CREATE TABLE dispatches\s*\([\s\S]*?\n\);/.exec(contract)?.[0];
if (!frozen || /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\b/.test(frozen.replace(/--[^\n]*/g, "")))
  throw new Error("Missing expected frozen CREATE-only dispatches DDL");
const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
const schema = `probe_dispatch_${randomUUID().replaceAll("-", "")}`;
const workspaceId = randomUUID(), otherWorkspaceId = randomUUID(), userId = randomUUID();
const workItemId = randomUUID(), otherWorkItemId = randomUUID();
let sameWorkspaceAccepted = false, crossWorkspaceAccepted = false, rolledBack = false, orderRejected = false;
let temporaryDirectory: string | undefined;
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query(`CREATE SCHEMA ${schema}`); // code-owned random identifier, never caller input
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query("INSERT INTO public.workspaces(id,name) VALUES($1,'synthetic probe'),($2,'synthetic probe')", [workspaceId, otherWorkspaceId]);
    await client.query("INSERT INTO public.users(id,workspace_id,name) VALUES($1,$2,'synthetic')", [userId, workspaceId]);
    await client.query(`INSERT INTO public.work_items(id,workspace_id,type,title)
      VALUES($1,$2,'self','synthetic'),($3,$4,'self','synthetic')`, [workItemId, workspaceId, otherWorkItemId, otherWorkspaceId]);
    await client.query(frozen);
    const insert = "INSERT INTO dispatches(workspace_id,work_item_id,from_user,to_user) VALUES($1,$2,$3,$3) RETURNING id";
    sameWorkspaceAccepted = (await client.query(insert, [workspaceId, workItemId, userId])).rows.length === 1;
    await client.query("SAVEPOINT cross_workspace_probe");
    try {
      crossWorkspaceAccepted = (await client.query(insert, [workspaceId, otherWorkItemId, userId])).rows.length === 1;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT cross_workspace_probe");
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "23503"))
        throw new Error("Unexpected frozen FK probe failure");
    }
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
  rolledBack = (await pool.query("SELECT to_regclass($1) IS NULL AND NOT EXISTS(SELECT 1 FROM workspaces WHERE id=ANY($2::uuid[])) AS clean",
    [`${schema}.dispatches`, [workspaceId, otherWorkspaceId]])).rows[0]?.clean === true;
  if (!rolledBack) throw new Error("Synthetic probe rollback could not be verified");
  const before = (await pool.query("SELECT id,name,run_on FROM pgmigrations ORDER BY id")).rows;
  if (!before.some(row => /^015_/.test(row.name)) || before.some(row => /^014_/.test(row.name)))
    throw new Error("Order probe needs the existing gap014 / applied015 test baseline");
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "ka-dispatch-order-probe-"));
  const dir = path.join(temporaryDirectory, "migrations");
  await cp(path.join(packageRoot, "migrations"), dir, { recursive: true });
  await writeFile(path.join(dir, "014_dispatches_probe.cjs"),
    "exports.up=()=>{throw new Error('Probe DDL must never execute')};exports.down=exports.up;\n", { flag: "wx" });
  try {
    await runner({ databaseUrl, dir, direction: "up", migrationsTable: "pgmigrations", checkOrder: true,
      singleTransaction: true, log: () => undefined, logger: { info: () => undefined, warn: () => undefined, error: () => undefined } });
  } catch (error) {
    orderRejected = error instanceof Error && /^Not run migration 014_dispatches_probe is preceding already run migration 015_/.test(error.message);
    if (!orderRejected) throw new Error("Unexpected migration order probe failure");
  }
  const after = (await pool.query("SELECT id,name,run_on FROM pgmigrations ORDER BY id")).rows;
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Probe changed installed migration history");
  console.log(JSON.stringify({ sameWorkspaceAccepted, crossWorkspaceAccepted, rolledBack, orderRejected,
    installedMigrationCount: before.length, migrationHistoryUnchanged: true, productionMigrationAdded: false }));
} finally {
  await pool.end();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }); // only this invocation's mkdtemp directory
}
