import { once } from "node:events";
import { fileURLToPath } from "node:url";

// Synthetic harness: arrange parent disconnect BEFORE the production entry module loads.
if (!process.send || !process.connected) process.exit(1);
const disconnected = once(process, "disconnect");
process.send({ ready: true });
await disconnected;
const entry = new URL("../../src/scheduling/worker-once-child.ts", import.meta.url);
process.argv = [process.execPath, fileURLToPath(entry), new Date().toISOString()];
await import(entry.href);
