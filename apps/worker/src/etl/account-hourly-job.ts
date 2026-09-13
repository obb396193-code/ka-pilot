/**
 * v1.9.47（Q-042）：小时采样。把启航 `account_realtime` 的**按小时累计**落进
 * `account_metrics_hourly`（迁移 025），盯盘那一屏读的就是这张表。
 *
 * 为什么挂在增量 ETL 的一次 attempt 里、而不是自己起一个定时器：
 * `AccountHourlyWriteRepository` 的写入守卫要求 `job_type='etl_incr'` 的活跃租约 +
 * `run_kind='incr'` 的运行中 run（见该文件顶部的注释）。这不是顺手为之——
 * 它保证「同一时刻只有一个持租约的进程在写这批账户」，另起一条路等于把那道并发闸绕过去。
 *
 * 契约（api.md F-P153-1）：每小时 HH:05 抓 `hh=HH−1`（那个小时已完整）与 `hh=HH`
 * （当前小时，还在涨，`complete=false`，下一轮覆盖）。缺行就是缺行，**永不补 0**。
 */
import { normalizeAccountHourlySample, sourceUtcOffsetFor } from "@ka/domain";

import type { QihangQuery } from "../qihang/client.js";
import type { QihangQueryPort } from "./types.js";

export interface AccountHourlyWritePort {
  persist(batch: unknown): Promise<{ rawRows: number; writtenRows: number }>;
}

export interface AccountHourlySampleContext {
  workspaceId: string;
  jobId: string;
  leaseToken: string;
  runId: string;
  userId: string;
  media: string;
  accountIds: readonly string[];
  /** 源时区（IANA）。没配就不采——见 `sourceUtcOffsetFor`，不拿服务器本地时区蒙。 */
  timeZone: string | null;
  /** 注入的「现在」，便于用例固定小时；生产传 `new Date()`。 */
  now: Date;
}

/** 一次最多 50 户，与写入契约（`accountHourlyStorageBatchSchema`）的上限一致。 */
const BATCH = 50;

/**
 * 要采的两个小时：上一个整点（已完整）与当前小时（还在涨）。
 * 跨日时上一个小时属于**前一天的 23 点**——直接用 `hh-1` 会把它记到今天，
 * 那一格会盖掉今天 00 点真正的累计值。
 */
export function hourlySampleTargets(now: Date, timeZone: string): { ds: string; hh: number }[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const at = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const ds = `${at("year")}-${at("month")}-${at("day")}`;
  const hh = Number(at("hour"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || !Number.isInteger(hh)) return [];
  if (hh === 0) {
    const yesterday = new Date(Date.parse(`${ds}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    return [{ ds: yesterday, hh: 23 }, { ds, hh: 0 }];
  }
  return [{ ds, hh: hh - 1 }, { ds, hh }];
}

/**
 * 采一次。**任何一步失败都只影响这一批**：小时数据是盯盘用的辅助面，
 * 不该让它把整条增量 ETL 拖失败——日级 canonical 才是账面数字的来源。
 * 返回实际写入的行数，调用方记进 run 的计数即可。
 */
export async function sampleAccountHourly(
  qihang: QihangQueryPort,
  writer: AccountHourlyWritePort,
  context: AccountHourlySampleContext,
): Promise<{ writtenRows: number; skipped: "no_timezone" | "no_accounts" | null }> {
  if (context.accountIds.length === 0) return { writtenRows: 0, skipped: "no_accounts" };
  if (context.timeZone === null) return { writtenRows: 0, skipped: "no_timezone" };
  let writtenRows = 0;
  for (const target of hourlySampleTargets(context.now, context.timeZone)) {
    const sourceUtcOffset = sourceUtcOffsetFor(context.timeZone, target.ds);
    if (sourceUtcOffset === null) continue;
    for (let index = 0; index < context.accountIds.length; index += BATCH) {
      const accountIds = context.accountIds.slice(index, index + BATCH);
      const query: QihangQuery = {
        resource: "account_realtime", userId: context.userId, media: context.media,
        accountIds: [...accountIds], ds: target.ds, hh: target.hh,
      };
      // 采样时刻要在**拿到响应之后**取：先取的话，一次慢请求会让这一格早早够到
      // 「小时末 + 5 分钟」而被判成 complete，于是一个还在涨的小时被冻住。
      const result = await qihang.query(query);
      const sampledAt = new Date().toISOString();
      const normalized = normalizeAccountHourlySample({
        workspaceId: context.workspaceId, media: context.media, accountIds: [...accountIds],
        ds: target.ds, hh: target.hh, sampledAt, sourceUtcOffset,
        sourceRunId: context.runId, rows: result.rows,
      });
      if (normalized.rows.length === 0) continue;
      const written = await writer.persist({
        workspaceId: context.workspaceId, jobId: context.jobId, leaseToken: context.leaseToken,
        runId: context.runId, media: context.media, accountIds: [...accountIds],
        ds: target.ds, hh: target.hh, sampledAt, sourceUtcOffset,
        rows: [...normalized.rows],
        rawRows: result.rows as Record<string, unknown>[],
      });
      writtenRows += written.writtenRows;
    }
  }
  return { writtenRows, skipped: null };
}
