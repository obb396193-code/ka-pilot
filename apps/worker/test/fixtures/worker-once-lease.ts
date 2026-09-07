import { createPool, JobRepository } from "@ka/db";

// Synthetic PG test child only. No source, credentials, or production runtime.
if (!process.env.TEST_DATABASE_URL || !process.argv[2] || !process.send) process.exit(1);
const pool = createPool(process.env.TEST_DATABASE_URL);
const job = await new JobRepository(pool, { workspaceId: process.argv[2], jobTypes: ["data_quality_check"] }).leaseNext(60);
if (!job) { await pool.end(); process.exit(1); }
process.send({ kind: "job_state", phase: "consumer", jobId: job.id, jobType: job.jobType, status: "leased" });
setInterval(() => {}, 1000);
