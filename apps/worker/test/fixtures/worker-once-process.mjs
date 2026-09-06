// Synthetic child only. No DB, source, credential or network access.
const event = { jobId: "00000000-0000-4000-8000-000000000103", jobType: "etl_full", status: "running" };
process.send?.(process.argv[2] === "bad" ? { ...event, payload: "synthetic-private-body" } : event);
if (process.argv[2] === "complete") process.disconnect();
else setInterval(() => {}, 1000);
import process from "node:process";
import { setInterval } from "node:timers";
