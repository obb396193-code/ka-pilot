import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { superviseWorkerOnce } from "../scheduling/worker-once-supervisor.js";
import type { OutboundPassCounts } from "../scheduling/worker-once-protocol.js";
import { outboundChildEnvironment, parseOutboundConfig, type OutboundRuntimeConfig } from "./outbound-config.js";

export type OutboundProcessResult =
  | { status: "locked" | "drained" | "batch_limit"; outbound: OutboundPassCounts }
  | { status: "budget" | "aborted"; outbound: null };

/**
 * P-198：一轮受监督的出站子进程。CLI 与 worker HTTP 入口共用这一个。
 *
 * **调用方不得先拿 workerOnceLock**：child 自己拿同一把按空间的会话级 advisory 锁，
 * 调用方拿着的话 child 每次都只会报 `locked`。child 不继承触发令牌、ETL 身份或别的空间的群凭证。
 */
export async function runOutboundOnceProcess(config: OutboundRuntimeConfig, signal?: AbortSignal): Promise<OutboundProcessResult> {
  const result = await superviseWorkerOnce({ maxMs: config.maxMs, ...(signal === undefined ? {} : { signal }),
    startChild: () => fork(new URL("./outbound-runtime.ts", import.meta.url), [], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), execArgv: ["--import", "tsx"],
      env: outboundChildEnvironment(config, process.env), stdio: ["ignore", "ignore", "ignore", "ipc"],
    }),
  });
  if (result.status === "budget" || result.status === "aborted") return { status: result.status, outbound: null };
  // 正常结束却没报本轮结果（或报了 ETL 才有的 blocked_auth）：说不清发了什么，按失败处理。
  if (result.status !== "completed" || result.outbound === undefined) throw new Error("OUTBOUND_PROCESS_FAILED");
  return { status: result.outbound.status, outbound: result.outbound.counts };
}

/**
 * worker HTTP 入口的出站配置。没配 `OUTBOUND_WORKSPACE_ID` → null（出站路由回 503）；
 * 配了但不合法、或与 worker 的空间不同 → 启动即失败：两个空间各拿各的锁，单飞就不再是单飞，
 * 也不能让一个空间的触发口替另一个空间发消息。
 */
export function outboundConfigForWorkerHttp(env: Readonly<NodeJS.ProcessEnv>, workerWorkspaceId: string): OutboundRuntimeConfig | null {
  if (env.OUTBOUND_WORKSPACE_ID === undefined) return null;
  const config = parseOutboundConfig(env);
  if (config.workspaceId !== workerWorkspaceId) throw new Error("OUTBOUND_CONFIG_INVALID");
  return config;
}
