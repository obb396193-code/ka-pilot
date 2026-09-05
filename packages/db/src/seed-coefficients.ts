import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCoefficientSeed, type CoefficientSeed } from "@ka/domain";
import { CoefficientSeedRepository, type CoefficientSeedResult } from "./coefficient-seed-repository.js";
import { createPool } from "./pool.js";

interface SeedService {
  seed(input: CoefficientSeed): Promise<CoefficientSeedResult>;
  close(): Promise<void>;
}
interface CoefficientSeedCommandOptions {
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  open?: (databaseUrl: string) => SeedService;
  write: (output: string) => void;
}

function open(databaseUrl: string): SeedService {
  const pool = createPool(databaseUrl);
  const repository = new CoefficientSeedRepository(pool);
  return { seed: (input) => repository.seed(input), close: () => pool.end() };
}

export async function runCoefficientSeedCommand(options: CoefficientSeedCommandOptions): Promise<void> {
  try {
    const json = options.args[0];
    if (options.args.length !== 1 || json === undefined || Buffer.byteLength(json) >= 64 * 1024) throw new Error();
    const input = parseCoefficientSeed(JSON.parse(json) as unknown);
    const databaseUrl = options.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim() === "") throw new Error();
    const service = (options.open ?? open)(databaseUrl);
    let result: CoefficientSeedResult;
    try { result = await service.seed(input); } finally { await service.close(); }
    options.write(`${JSON.stringify(result)}\n`);
  } catch {
    throw new Error("Coefficient seed failed");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCoefficientSeedCommand({ args: process.argv.slice(2), env: process.env, write: (output) => { process.stdout.write(output); } }).catch(() => {
    process.stderr.write("Coefficient seed failed\n");
    process.exitCode = 1;
  });
}
