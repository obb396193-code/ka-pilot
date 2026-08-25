import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  JobRepository,
  WorkspaceSyncRepository,
  createPool,
} from "@ka/db";
import { workspaceSyncTickModeSchema, type WorkspaceSyncTickResult } from "@ka/domain";
import { z } from "zod";

import { WorkspaceSyncTickService } from "./workspace-sync-service.js";

const selectorSchema = z.object({
  workspaceId: z.string().uuid(),
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  mode: workspaceSyncTickModeSchema,
}).strict();

export interface SyncTickCliSelector {
  workspaceId: string;
  media: string;
  mode: "auto" | "full" | "incr";
}

export interface SyncTickCommandService {
  execute(input: unknown): Promise<WorkspaceSyncTickResult>;
}

export interface SyncTickCommandOptions {
  args: readonly string[];
  now: Date;
  service: SyncTickCommandService;
  write: (output: string) => void;
}

const ARGUMENTS: ReadonlyMap<string, "workspaceId" | "media" | "mode"> = new Map([
  ["--workspace-id", "workspaceId"],
  ["--media", "media"],
  ["--mode", "mode"],
] as const);

export function parseSyncTickCliArgs(args: readonly string[]): SyncTickCliSelector {
  const values: Record<string, string> = { mode: "auto" };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    const field = name === undefined ? undefined : ARGUMENTS.get(name);
    if (field === undefined) throw new Error(`Unknown argument: ${name ?? ""}`);
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }
    if (values[field] !== undefined && !(field === "mode" && values[field] === "auto")) {
      throw new Error(`Duplicate argument: ${name}`);
    }
    values[field] = value;
  }
  return selectorSchema.parse(values);
}

export async function executeSyncTickCommand(options: SyncTickCommandOptions): Promise<void> {
  if (!Number.isFinite(options.now.valueOf())) throw new Error("now must be a valid instant");
  const selector = parseSyncTickCliArgs(options.args);
  const result = await options.service.execute({
    ...selector,
    triggeredAt: options.now.toISOString(),
  });
  options.write(`${JSON.stringify(result)}\n`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = createPool(databaseUrl);
  try {
    await executeSyncTickCommand({
      args: process.argv.slice(2),
      now: new Date(),
      service: new WorkspaceSyncTickService(
        new WorkspaceSyncRepository(pool),
        new JobRepository(pool),
      ),
      write: (output) => process.stdout.write(output),
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(() => {
    process.stderr.write("Sync tick failed\n");
    process.exitCode = 1;
  });
}
