import {
  parseDataPipelineBenchmarkArgs,
  runDataPipelineBenchmark,
} from "../src/benchmark/data-pipeline.js";

const options = parseDataPipelineBenchmarkArgs(process.argv.slice(2));
const report = await runDataPipelineBenchmark(
  options.accountCounts,
  options.iterationsPerSample,
  options.chunkSize,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
