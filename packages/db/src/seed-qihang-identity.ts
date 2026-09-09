import path from "node:path";
import { fileURLToPath } from "node:url";
import { qihangIdentitySeedSchema, qihangIdentitySeedResultSchema, type QihangIdentitySeed } from "@ka/domain";
import { createPool } from "./pool.js";
import { QihangIdentitySeedError, QihangIdentitySeedRepository } from "./qihang-identity-seed-repository.js";

interface SeedService { bind(input: QihangIdentitySeed, force: boolean): Promise<unknown>; close(): Promise<void> }
function open(databaseUrl: string): SeedService {
  const pool = createPool(databaseUrl), repository = new QihangIdentitySeedRepository(pool);
  return { bind: (input, force) => repository.bind(input, force), close: () => pool.end() };
}
export async function runQihangIdentitySeedCommand(options: {
  args: readonly string[]; env: Readonly<Record<string, string | undefined>>;
  open?: (databaseUrl: string) => SeedService; write(output: string): void;
}): Promise<void> {
  try {
    const args = options.args.filter(value => value !== "--force");
    if (args.length !== 1 || options.args.length > 2 || Buffer.byteLength(args[0]!) >= 65536) throw new QihangIdentitySeedError("INVALID_INPUT");
    let input: QihangIdentitySeed;
    try { input = qihangIdentitySeedSchema.parse(JSON.parse(args[0]!)); }
    catch { throw new QihangIdentitySeedError("INVALID_INPUT"); }
    const databaseUrl = options.env.DATABASE_URL;
    if (!databaseUrl?.trim()) throw new QihangIdentitySeedError("INVALID_INPUT");
    const service = (options.open ?? open)(databaseUrl);
    let output: unknown;
    try { output = qihangIdentitySeedResultSchema.parse(await service.bind(input, options.args.includes("--force"))); }
    finally { await service.close(); }
    options.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    throw error instanceof QihangIdentitySeedError ? error : new QihangIdentitySeedError("DATABASE_ERROR");
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runQihangIdentitySeedCommand({ args: process.argv.slice(2), env: process.env,
    write: output => { process.stdout.write(output); },
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof QihangIdentitySeedError ? error.message : "Qihang identity seed failed: DATABASE_ERROR"}\n`);
    process.exitCode = 1;
  });
}
