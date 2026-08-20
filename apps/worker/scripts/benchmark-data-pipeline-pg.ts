import {
  parsePgBenchmarkArgs,
  runPgDataPipelineBenchmark,
} from "../src/benchmark/data-pipeline-pg.js";

const options = parsePgBenchmarkArgs(process.argv.slice(2));
const report = await runPgDataPipelineBenchmark(options);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
