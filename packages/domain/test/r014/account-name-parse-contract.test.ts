import { describe, expect, it } from "vitest";

import {
  applyOverride, computeConflicts, extractTaskIds, namingRuleSchema, parseAccountName,
  statusWithConflicts, type NamingRule,
} from "../../src/r014/account-name-parse-contract.js";

/**
 * 规范用快手第 1 版的**形状**（12 段、专项可 `-` 连多值、括号带任务 ID），
 * 但枚举值只取够用的几个——解析器本身不认识任何渠道，全从规则读。
 */
const KUAISHOU: NamingRule = namingRuleSchema.parse({
  media: "KUAISHOU",
  version: 1,
  separators: ["-", "－", "_"],
  segments: [
    { key: "channel", label: "渠道", order: 0, source: "enum", values: ["DAU", "达人"], required: true, mapsTo: null },
    {
      key: "biz", label: "业务", order: 1, source: "enum", required: true, mapsTo: "biz",
      values: ["CVR有端(1803240580)", "促活UV（630935345、42616810）", "M闪购综合（834946613）", "通投"],
    },
    { key: "agent_type", label: "运营方", order: 2, source: "enum", values: ["自投", "代投"], required: true, mapsTo: "agent_type" },
    { key: "optimizer", label: "优化师", order: 3, source: "free", required: true, mapsTo: "optimizer" },
    { key: "bid_mode", label: "出价模式", order: 4, source: "enum", values: ["单出价", "双出价"], required: true, mapsTo: "bid_mode" },
    { key: "device", label: "设备", order: 5, source: "enum", values: ["安卓", "IOS", "双端"], required: true, mapsTo: "device" },
    { key: "placement", label: "流量版位", order: 6, source: "enum", values: ["优选", "联盟", "主站", "开屏"], required: true, mapsTo: "placement" },
    { key: "goal", label: "出价目标", order: 7, source: "enum", values: ["订单", "付费", "激活", "唤起"], required: true, mapsTo: "goal" },
    { key: "rta", label: "RTA", order: 8, source: "enum", values: ["有R", "非R"], required: true, mapsTo: "rta" },
    { key: "special", label: "专项", order: 9, source: "enum", multi: true, mapsTo: "special",
      values: ["常规", "一户一品", "年轻人", "1分", "水果1分", "商品卡"] },
    { key: "rebate", label: "增量扣量", order: 10, source: "regex", pattern: "^(ZZ|KK)\\d+$", mapsTo: "rebate" },
    { key: "landing", label: "承接", order: 11, source: "regex", pattern: "^\\d+$", mapsTo: "landing" },
  ],
});

describe("v1.8 account nickname parsing (two-end anchored)", () => {
  it("parses a full 12-segment name", () => {
    const parsed = parseAccountName("DAU-CVR有端(1803240580)-自投-张三-单出价-安卓-优选-订单-有R-常规-KK70-13177", KUAISHOU);
    expect(parsed.status).toBe("parsed");
    expect(parsed.segments.channel!.value).toBe("DAU");
    expect(parsed.segments.biz!.value).toBe("CVR有端");
    expect(parsed.segments.special!.value).toBe("常规");
    expect(parsed.segments.rebate!.value).toBe("KK70");
    expect(parsed.segments.landing!.value).toBe("13177");
    expect(parsed.taskIds).toEqual(["1803240580"]);
    expect(parsed.unmatched).toEqual([]);
  });

  it("keeps a multi-valued special segment whole even though it uses the field separator", () => {
    // 这正是「按分隔符硬切必炸」的那一条：专项用同一个 `-` 连了三个值。
    const parsed = parseAccountName("DAU-通投-自投-李四-双出价-IOS-主站-付费-非R-一户一品-年轻人-1分-ZZ50-2086", KUAISHOU);
    expect(parsed.status).toBe("parsed");
    expect(parsed.segments.special!.value).toBe("一户一品-年轻人-1分");
    expect(parsed.segments.rebate!.value).toBe("ZZ50");
    expect(parsed.segments.landing!.value).toBe("2086");
  });

  it("treats every tail segment as optional, because the spec says the rebate may be omitted", () => {
    const noRebate = parseAccountName("DAU-通投-自投-李四-双出价-IOS-主站-付费-非R-常规-13177", KUAISHOU);
    expect(noRebate.segments.landing!.value).toBe("13177");
    expect(noRebate.segments.rebate).toBeUndefined();
    expect(noRebate.unmatched).toEqual(["rebate"]);
    expect(noRebate.status).toBe("partial");

    const neither = parseAccountName("DAU-通投-自投-李四-双出价-IOS-主站-付费-非R-常规", KUAISHOU);
    expect(neither.segments.special!.value).toBe("常规");
    expect(new Set(neither.unmatched)).toEqual(new Set(["rebate", "landing"]));
  });

  it("reads both half-width and full-width brackets and keeps every task id", () => {
    expect(extractTaskIds("促活UV（630935345、42616810）")).toEqual({
      bare: "促活UV", taskIds: ["630935345", "42616810"],
    });
    expect(extractTaskIds("CVR有端(1803240580)")).toEqual({ bare: "CVR有端", taskIds: ["1803240580"] });
    expect(extractTaskIds("通投")).toEqual({ bare: "通投", taskIds: [] });
    const parsed = parseAccountName("DAU-促活UV（630935345、42616810）-自投-张三-单出价-安卓-优选-订单-有R-常规-KK70-13177", KUAISHOU);
    expect(parsed.taskIds).toEqual(["630935345", "42616810"]);
  });

  it("accepts any configured separator, including the full-width dash", () => {
    const parsed = parseAccountName("DAU－通投－自投－张三－单出价－安卓－优选－订单－非R－常规－ZZ50－2086", KUAISHOU);
    expect(parsed.status).toBe("parsed");
    expect(parsed.segments.landing!.value).toBe("2086");
  });

  it("marks a name partial rather than discarding it when one segment is off-spec", () => {
    // 「未知版位」不在枚举里：那一段显 −，其余照用，绝不整条丢。
    const parsed = parseAccountName("DAU-通投-自投-张三-单出价-安卓-未知版位-订单-非R-常规-ZZ50-2086", KUAISHOU);
    expect(parsed.status).toBe("partial");
    expect(parsed.unmatched).toEqual(["placement"]);
    expect(parsed.segments.goal!.value).toBe("订单");
    expect(parsed.segments.landing!.value).toBe("2086");
  });

  it("reports failed only when nothing at all matches the spec", () => {
    const parsed = parseAccountName("随便起的名字", KUAISHOU);
    expect(parsed.status).toBe("failed");
    expect(Object.keys(parsed.segments)).toEqual([]);
  });

  it("does not invent a special segment when the middle is empty", () => {
    const parsed = parseAccountName("DAU-通投-自投-张三-单出价-安卓-优选-订单-非R-ZZ50-2086", KUAISHOU);
    expect(parsed.segments.special).toBeUndefined();
    expect(parsed.unmatched).toContain("special");
    expect(parsed.segments.rebate!.value).toBe("ZZ50");
  });

  it("carries mapsTo so the dimension source switch has something to read", () => {
    const parsed = parseAccountName("DAU-通投-代投-某代理-单出价-双端-联盟-唤起-有R-商品卡-KK30-2088", KUAISHOU);
    expect(parsed.segments.agent_type).toMatchObject({ value: "代投", mapsTo: "agent_type" });
    expect(parsed.segments.placement).toMatchObject({ value: "联盟", mapsTo: "placement" });
    expect(parsed.segments.channel!.mapsTo).toBeNull();
  });

  it("refuses a rule with two absorbing segments, which would make the middle undecidable", () => {
    expect(() => namingRuleSchema.parse({
      ...KUAISHOU,
      segments: KUAISHOU.segments.map((segment) =>
        segment.key === "landing" ? { ...segment, multi: true, source: "free" } : segment),
    })).toThrow(/at most one segment may be multi/);
  });

  it("refuses an enum segment with no values and a regex segment with no pattern", () => {
    expect(() => namingRuleSchema.parse({
      ...KUAISHOU, segments: [{ key: "k", label: "l", order: 0, source: "enum" }],
    })).toThrow(/must list its values/);
    expect(() => namingRuleSchema.parse({
      ...KUAISHOU, segments: [{ key: "k", label: "l", order: 0, source: "regex" }],
    })).toThrow(/must carry its pattern/);
  });
});

describe("v1.8 conflicts and manual override", () => {
  const parsed = parseAccountName(
    "DAU-CVR有端(1803240580)-自投-张三-单出价-安卓-优选-订单-有R-常规-KK70-13177", KUAISHOU,
  );

  it("records a conflict only when both sides have a value and they disagree", () => {
    const conflicts = computeConflicts(parsed, {
      platform: { agent_type: "代投", placement: "优选" },
      qihangTaskIds: ["1803240580"],
    });
    expect(conflicts).toEqual([
      { field: "agent_type", fromNickname: "自投", fromPlatform: "代投", source: "platform" },
    ]);
    expect(statusWithConflicts(parsed, conflicts)).toBe("conflict");
  });

  it("treats a missing platform value as no evidence, not as a conflict", () => {
    for (const platform of [{}, { agent_type: null }, { agent_type: undefined }, { agent_type: "" }]) {
      expect(computeConflicts(parsed, { platform, qihangTaskIds: [] })).toEqual([]);
    }
    expect(statusWithConflicts(parsed, [])).toBe("parsed");
  });

  it("compares task ids as a set, so one extra or one missing both count", () => {
    const extra = computeConflicts(parsed, { platform: {}, qihangTaskIds: ["1803240580", "999"] });
    expect(extra).toEqual([
      { field: "task_ids", fromNickname: "1803240580", fromPlatform: "1803240580,999", source: "qihang" },
    ]);
    const different = computeConflicts(parsed, { platform: {}, qihangTaskIds: ["999"] });
    expect(different[0]!.source).toBe("qihang");
    // 启航没有归属 = 没有证据，不算冲突。
    expect(computeConflicts(parsed, { platform: {}, qihangTaskIds: [] })).toEqual([]);
  });

  it("never escalates a failed parse into a conflict", () => {
    const failed = parseAccountName("随便起的名字", KUAISHOU);
    expect(statusWithConflicts(failed, [
      { field: "agent_type", fromNickname: "x", fromPlatform: "y", source: "platform" },
    ])).toBe("failed");
  });

  it("lets a manual override win and clears that segment from unmatched", () => {
    const partial = parseAccountName("DAU-通投-自投-张三-单出价-安卓-未知版位-订单-非R-常规-ZZ50-2086", KUAISHOU);
    expect(partial.unmatched).toEqual(["placement"]);
    const overridden = applyOverride(partial, { placement: "主站" }, KUAISHOU);
    // 被覆盖的段原本没解析出来，mapsTo 只能从规范里查——丢了它 T5 就不知道喂给哪个维度。
    expect(overridden.segments.placement).toMatchObject({ value: "主站", mapsTo: "placement" });
    expect(overridden.unmatched).toEqual([]);
    // 人工只改这一段的值，不动它带的任务 ID——那是从括号里读出来的事实。
    const keepTaskIds = applyOverride(parsed, { biz: "改过的业务" }, KUAISHOU);
    expect(keepTaskIds.segments.biz).toMatchObject({ value: "改过的业务", taskIds: ["1803240580"] });
  });

  it("leaves the parse untouched when the override is empty", () => {
    expect(applyOverride(parsed, {}, KUAISHOU)).toEqual(parsed);
  });
});
