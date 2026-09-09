import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DAILY_REPORT_MODULES, UNLABELLED_DIMENSION, dailyDeliverySchema, dailyReportSchema, groupRowsByDimension, unsupportedModule,
} from "../../src/r014/daily-report-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/reports/${name}`, import.meta.url), "utf8"));

describe("v1.5 1.8 daily report (D7)", () => {
  it("parses both frozen fixtures", () => {
    const sent = dailyReportSchema.parse(fixture("daily-v1.json").data);
    expect(sent.modules).toHaveLength(13);
    expect(sent.delivery).toMatchObject({ status: "sent", target: "dingtalk:KA 快手投放群" });
    const notSent = dailyReportSchema.parse(fixture("daily-v1-not-sent.json").data);
    expect(notSent.delivery).toEqual({ status: "not_sent", at: null, target: null });
  });

  it("pins the thirteen module keys and their order", () => {
    const good = dailyReportSchema.parse(fixture("daily-v1.json").data);
    expect(good.modules.map((module) => module.key)).toEqual(DAILY_REPORT_MODULES.map((module) => module.key));
    expect(() => dailyReportSchema.parse({ ...good, modules: [...good.modules].reverse() }))
      .toThrow(/frozen order/);
    expect(() => dailyReportSchema.parse({ ...good, modules: good.modules.slice(1) })).toThrow();
  });

  it("keeps 'source not wired' distinguishable from 'looked and found nothing'", () => {
    const missing = unsupportedModule("dim_bid_tool");
    expect(missing).toEqual({ key: "dim_bid_tool", title: "出价工具", rows: [], unsupported: true });
    // 空 rows + unsupported:false 才是「查了确实没有」；两者在页面上必须分得开。
    const empty = { key: "dim_bid_tool", title: "出价工具", rows: [], unsupported: false };
    expect(missing).not.toEqual(empty);
    expect(() => unsupportedModule("no_such_module" as never)).toThrow(/unknown daily report module/);
  });

  it("refuses a delivery that claims to be sent without a timestamp, or the reverse", () => {
    expect(() => dailyDeliverySchema.parse({ status: "sent", at: null, target: "群" }))
      .toThrow(/must carry its timestamp/);
    expect(() => dailyDeliverySchema.parse({
      status: "not_sent", at: "2026-09-05T08:05:00.000+08:00", target: null,
    })).toThrow(/must carry its timestamp/);
    expect(() => dailyDeliverySchema.parse({ status: "queued", at: null, target: null })).not.toThrow();
    expect(() => dailyDeliverySchema.parse({ status: "failed", at: null, target: "群" })).not.toThrow();
  });

  it("keeps the action flags meaning 'available', not 'already done'", () => {
    const good = dailyReportSchema.parse(fixture("daily-v1.json").data);
    // 推送可用 + 尚未送达，这两件事同时成立是正常的。
    expect(() => dailyReportSchema.parse({
      ...good, actions: { pushDingtalk: true, exportPdf: true },
      delivery: { status: "not_sent", at: null, target: null },
    })).not.toThrow();
  });
});

describe("v1.9.2 dimension grouping", () => {
  const rows = [
    { key: "KUAISHOU:a1", metrics: { cost: 100, click: 10 } },
    { key: "KUAISHOU:a2", metrics: { cost: 50, click: null } },
    { key: "KUAISHOU:a3", metrics: { cost: 20, click: 3 } },
  ];

  it("merges accounts that share a dimension value and sorts by cost", () => {
    const grouped = groupRowsByDimension(rows, (row) =>
      row.key === "KUAISHOU:a3" ? "自投" : "代投");
    expect(grouped.map((row) => [row.key, row.metrics.cost])).toEqual([["代投", 150], ["自投", 20]]);
    // 合并只是相加，不重算——所以和大盘卡天然同源。
    expect(grouped[0]!.metrics.click).toBe(10);
  });

  it("buckets accounts with no parsed value under 未标注 instead of dropping them", () => {
    const grouped = groupRowsByDimension(rows, () => null);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.key).toBe(UNLABELLED_DIMENSION);
    // 丢掉未标注的账户，会让维度加总对不上大盘卡。
    expect(grouped[0]!.metrics.cost).toBe(170);
  });

  it("keeps an all-null metric null rather than turning it into 0", () => {
    const grouped = groupRowsByDimension(
      [{ key: "a", metrics: { cost: null } }, { key: "b", metrics: { cost: null } }],
      () => "同一组",
    );
    expect(grouped[0]!.metrics.cost).toBeNull();
  });
});
