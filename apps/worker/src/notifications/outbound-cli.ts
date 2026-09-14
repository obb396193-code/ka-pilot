import { parseOutboundConfig } from "./outbound-config.js";
import { runOutboundOnceProcess } from "./outbound-process.js";
async function main():Promise<void>{
  if(process.argv.length!==2)throw new Error();
  const config=parseOutboundConfig(process.env),controller=new AbortController();const stop=()=>controller.abort();
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  try{
    const result=await runOutboundOnceProcess(config,controller.signal);
    if(result.status==="aborted")throw new Error();
    process.stdout.write(result.status==="budget"?"Outbound round budget reached (child stopped; pending rows retained)\n":
      result.status==="locked"?"Outbound round skipped (another worker round holds this workspace)\n":
      "Outbound round finished (bounded; pending rows may remain)\n");
  }finally{process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);}
}
await main().catch(()=>{process.stderr.write("Outbound round failed\n");process.exitCode=1;});
