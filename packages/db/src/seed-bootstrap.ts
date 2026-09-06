import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBootstrapSeed, type BootstrapSeed } from "@ka/domain";
import { BootstrapSeedRepository, type BootstrapSeedResult } from "./bootstrap-seed-repository.js";
import { createPool } from "./pool.js";

interface BootstrapService {
  seed(input: BootstrapSeed): Promise<BootstrapSeedResult>;
  close(): Promise<void>;
}
interface BootstrapCommandOptions {
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  open?: (databaseUrl: string) => BootstrapService;
  write: (output: string) => void;
}
function open(databaseUrl: string): BootstrapService {
  const pool = createPool(databaseUrl);
  const repository = new BootstrapSeedRepository(pool);
  return { seed: (input) => repository.seed(input), close: () => pool.end() };
}
export async function runBootstrapSeedCommand(options: BootstrapCommandOptions): Promise<void> {
  try {
    const serialized = options.args[0];
    if (options.args.length !== 1 || serialized === undefined || Buffer.byteLength(serialized) >= 1024 * 1024) throw new Error();
    const input = parseBootstrapSeed(JSON.parse(serialized) as unknown);
    const databaseUrl = options.env.DATABASE_URL;
    if (!databaseUrl?.trim()) throw new Error();
    const service = (options.open ?? open)(databaseUrl);
    let result: BootstrapSeedResult;
    try { result = await service.seed(input); } finally { await service.close(); }
    options.write(`${JSON.stringify(result)}\n`);
  } catch { throw new Error("Bootstrap seed failed"); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runBootstrapSeedCommand({ args: process.argv.slice(2), env: process.env, write: (output) => { process.stdout.write(output); } }).catch(() => {
    process.stderr.write("Bootstrap seed failed\n");
    process.exitCode = 1;
  });
}
