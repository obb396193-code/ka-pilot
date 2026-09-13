import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseOutboundConfig, outboundChildEnvironment } from "./outbound-config.js";
import { superviseWorkerOnce } from "../scheduling/worker-once-supervisor.js";
async function main():Promise<void>{
  if(process.argv.length!==2)throw new Error();
  const config=parseOutboundConfig(process.env),controller=new AbortController();const stop=()=>controller.abort();
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  try{
    const result=await superviseWorkerOnce({maxMs:config.maxMs,signal:controller.signal,
      startChild:()=>fork(new URL("./outbound-runtime.ts",import.meta.url),[],{cwd:fileURLToPath(new URL("../../",import.meta.url)),
        execArgv:["--import","tsx"],env:outboundChildEnvironment(config,process.env),stdio:["ignore","ignore","ignore","ipc"]})});
    if(result.status==="aborted"||result.status==="blocked_auth")throw new Error();
    process.stdout.write(result.status==="budget"?"Outbound round budget reached (child stopped; pending rows retained)\n":
      "Outbound round finished (bounded; pending rows may remain)\n");
  }finally{process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);}
}
await main().catch(()=>{process.stderr.write("Outbound round failed\n");process.exitCode=1;});
