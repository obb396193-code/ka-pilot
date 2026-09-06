import path from "node:path";
import { fileURLToPath } from "node:url";

import { QihangClient, type QihangClientOptions, type QihangRow } from "./client.js";

const PAGE_SIZE = 50;
const MAX_ACCOUNTS = 10_000;
const MAX_BYTES = 16 * 1024 * 1024;
const invalid = () => new Error("Account discovery failed");

interface DiscoveredAccount {
  media: string;
  account_id: string;
  account_name: string | null;
  task_id: string | null;
  biz_name: string | null;
}

export interface DiscoverAccountsOptions {
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  fetchFn?: QihangClientOptions["fetchFn"];
  write: (output: string) => void;
}

function identifier(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) return value;
  throw invalid();
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 256) throw invalid();
  return value;
}

function mapAccount(row: QihangRow, media: string): DiscoveredAccount {
  if (row.media !== undefined && row.media !== null && row.media !== media) throw invalid();
  return {
    media,
    account_id: identifier(row.account_id),
    account_name: optionalText(row.account_name),
    task_id: row.task_id === undefined || row.task_id === null ? null : identifier(row.task_id),
    biz_name: optionalText(row.biz_name),
  };
}

function integer(value: unknown): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) throw invalid();
  return parsed;
}

function sourcePage(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw invalid();
  const page = data as Record<string, unknown>;
  if (!Array.isArray(page.rows)) throw invalid();
  for (const key of ["truncated", "limit_clamped", "hasMore"]) {
    // Unknown pagination flags may not be silently interpreted as completeness.
    if (page[key] !== undefined && page[key] !== false) throw invalid();
  }
  return page;
}

/** Operator-only GET discovery. No DB import, job enqueue, grants or media actions. */
export async function runDiscoverAccounts(options: DiscoverAccountsOptions): Promise<void> {
  try {
    const media = options.args[1];
    if (options.args.length !== 2 || options.args[0] !== "--media" || media === undefined || !/^[A-Z0-9_]{1,32}$/.test(media)) throw invalid();
    const userId = options.env.WORKER_SERVICE_QIHANG_USER_ID;
    const baseUrl = options.env.QIHANG_BASE_URL;
    if (userId === undefined || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) || baseUrl === undefined) throw invalid();
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw invalid();
    const fetchFn = options.fetchFn ?? fetch;
    const client = new QihangClient({
      baseUrl, fetchFn: (input, init) => fetchFn(input, { ...init, redirect: "error" }),
      maxRetries: 0, timeoutMs: 30_000, maxRows: PAGE_SIZE, maxResponseBytes: MAX_BYTES - 1,
    });
    const collected: DiscoveredAccount[] = [];
    const seen = new Set<string>();
    let expectedTotal: number | undefined;
    for (let pageNum = 1; pageNum <= MAX_ACCOUNTS / PAGE_SIZE; pageNum += 1) {
      const result = await client.query({ resource: "account", userId, media, pageNum, pageSize: PAGE_SIZE });
      const raw = sourcePage(result.envelope.data);
      for (const key of ["truncated", "limit_clamped"]) {
        if (result.envelope[key] !== undefined && result.envelope[key] !== false) throw invalid();
      }
      const total = integer(raw.totalNum);
      if (total > MAX_ACCOUNTS || (expectedTotal !== undefined && total !== expectedTotal)) throw invalid();
      expectedTotal = total;
      if (raw.pageNum != null && integer(raw.pageNum) !== pageNum) throw invalid();
      if (raw.pageSize != null && integer(raw.pageSize) !== PAGE_SIZE) throw invalid();
      if (result.rows.length !== Math.min(PAGE_SIZE, total - collected.length)) throw invalid();
      for (const row of result.rows) {
        const account = mapAccount(row, media);
        if (seen.has(account.account_id)) throw invalid();
        seen.add(account.account_id);
        collected.push(account);
      }
      if (collected.length === total) {
        const output = `${JSON.stringify(collected)}\n`;
        if (Buffer.byteLength(output) >= MAX_BYTES) throw invalid();
        options.write(output);
        return;
      }
    }
    throw invalid();
  } catch {
    // Never expose query URL/userId, upstream body, errors or a partial account prefix.
    throw invalid();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runDiscoverAccounts({ args: process.argv.slice(2), env: process.env, write: (output) => { process.stdout.write(output); } }).catch(() => {
    process.stderr.write("Account discovery failed\n");
    process.exitCode = 1;
  });
}
