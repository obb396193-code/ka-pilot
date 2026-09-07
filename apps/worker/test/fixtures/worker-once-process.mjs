// Synthetic child only. No DB, source, credential or network access.
const event = { jobId: "00000000-0000-4000-8000-000000000103", jobType: "etl_full", status: "running" };
const emit = (status) => process.send?.({ ...event, status, kind: "job_state", phase: "consumer" });
if (process.argv[2] === "bad") process.send?.({ ...event, payload: "synthetic-private-body" });
else { emit("leased"); emit("running"); }
if (process.argv[2] === "complete") {
  emit("done"); process.send?.({ kind: "terminal", status: "completed" }, () => process.disconnect());
}
else setInterval(() => {}, 1000);
import process from "node:process";
import { setInterval } from "node:timers";
