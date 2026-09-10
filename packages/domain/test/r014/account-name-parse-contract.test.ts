import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EMPTY_DIMENSIONS_DTO, PARSED_DIMENSIONS, accountDimensionsDtoSchema, accountDimensionsSchema,
  applyOverride, computeConflicts, extractTaskIds, namingRuleSchema, parseAccountName,
  pendingSegmentDefs, resolveAccountDimensions, segmentMapsTo, statusWithConflicts, toDimensionsDto,
  type NamingRule,
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

describe("v1.8 T5 dimension source switch", () => {
  const parsed = parseAccountName(
    "DAU-CVR有端(1803240580)-自投-张三-单出价-安卓-优选-订单-有R-常规-KK70-13177", KUAISHOU,
  );

  it("prefers the nickname over the platform for all ten dimensions", () => {
    const dimensions = resolveAccountDimensions({
      segments: parsed.segments,
      overriddenKeys: [],
      // 平台说联盟、昵称说优选 —— v1.8 主源改昵称，所以取优选。
      platform: { placement: "联盟", device: "IOS" },
    });
    expect(dimensions.placement).toEqual({ value: "优选", source: "nickname" });
    expect(dimensions.device).toEqual({ value: "安卓", source: "nickname" });
    expect(dimensions.agent_type).toEqual({ value: "自投", source: "nickname" });
    expect(PARSED_DIMENSIONS).toHaveLength(10);
  });

  it("falls back to the platform only where the nickname said nothing", () => {
    const withoutPlacement = parseAccountName(
      "DAU-通投-自投-张三-单出价-安卓-未知版位-订单-非R-常规-KK70-13177", KUAISHOU,
    );
    const dimensions = resolveAccountDimensions({
      segments: withoutPlacement.segments, overriddenKeys: [], platform: { placement: "联盟" },
    });
    expect(dimensions.placement).toEqual({ value: "联盟", source: "platform" });
    expect(dimensions.device).toEqual({ value: "安卓", source: "nickname" });
  });

  it("marks a human-edited segment as manual, outranking the nickname", () => {
    const overridden = applyOverride(parsed, { placement: "主站" }, KUAISHOU);
    const dimensions = resolveAccountDimensions({
      segments: overridden.segments, overriddenKeys: ["placement"], platform: { placement: "联盟" },
    });
    // 优先级：人工 > 昵称 > 平台。
    expect(dimensions.placement).toEqual({ value: "主站", source: "manual" });
  });

  it("leaves a dimension null rather than writing 'unknown' as a value", () => {
    const dimensions = resolveAccountDimensions({ segments: {}, overriddenKeys: [], platform: {} });
    for (const key of PARSED_DIMENSIONS) {
      // 写 "unknown" 当值会让「没标注」和「标注为未知」在页面上分不出来（v1.7.9 agent_type 那条踩过）。
      expect(dimensions[key], key).toEqual({ value: null, source: null });
    }
  });

  it("refuses a half-filled dimension entry", () => {
    expect(() => accountDimensionsSchema.parse({
      ...resolveAccountDimensions({ segments: {}, overriddenKeys: [], platform: {} }),
      placement: { value: "优选", source: null },
    })).toThrow(/both be present or both be null/);
  });
});

describe("R-017 T5 dimensions DTO (v1.9.3)", () => {
  it("maps the snake_case internal keys to the frozen camelCase DTO keys", () => {
    const resolved = resolveAccountDimensions({
      segments: {
        s1: { key: "s1", value: "优选", mapsTo: "placement", taskIds: [] },
        s2: { key: "s2", value: "单出价", mapsTo: "bid_mode", taskIds: [] },
        s3: { key: "s3", value: "自投", mapsTo: "agent_type", taskIds: [] },
      },
      overriddenKeys: [],
      platform: {},
    });
    const dto = toDimensionsDto(resolved);
    expect(dto.placement).toEqual({ value: "优选", source: "nickname" });
    expect(dto.bidMode).toEqual({ value: "单出价", source: "nickname" });
    expect(dto.agentType).toEqual({ value: "自投", source: "nickname" });
    // 没解析到的维度两个字段都是 null——不写 "unknown"。
    expect(dto.special).toEqual({ value: null, source: null });
    expect(Object.keys(dto)).toHaveLength(10);
  });

  it("matches the frozen fixture's dimension keys exactly", () => {
    const fixture = JSON.parse(readFileSync(
      new URL("../../../contract/fixtures/account-list/ready-v193-dimensions.json", import.meta.url), "utf8",
    )) as { data: { items: { dimensions: Record<string, unknown> }[] } };
    const frozen = Object.keys(fixture.data.items[0]!.dimensions).sort();
    expect(Object.keys(EMPTY_DIMENSIONS_DTO).sort()).toEqual(frozen);
    // fixture 里那行也必须过 schema：形状对不上就是我理解错了契约。
    expect(() => accountDimensionsDtoSchema.parse(fixture.data.items[0]!.dimensions)).not.toThrow();
  });

  it("keeps the empty DTO free of invented values", () => {
    for (const entry of Object.values(EMPTY_DIMENSIONS_DTO)) {
      expect(entry).toEqual({ value: null, source: null });
    }
  });
});

describe("v1.9.22 ① anchor segments and longest-alias matching", () => {
  const anchoredRule = (): NamingRule => namingRuleSchema.parse({
    media: "KUAISHOU",
    version: 1,
    separators: ["-"],
    segments: [
      { key: "biz", label: "业务", order: 1, source: "free", required: false, multi: false, mapsTo: "biz" },
      { key: "agent", label: "运营方", order: 2, source: "enum", required: false, multi: false,
        mapsTo: "agent_type", values: ["自投", "代投"], anchor: true },
      { key: "optimizer", label: "优化师", order: 3, source: "free", required: false, multi: false,
        mapsTo: "optimizer" },
    ],
  });

  it("realigns the remaining segments when a leading segment is missing", () => {
    // 昵称少写了业务段：按位置硬切会把「自投」当业务、把优化师当运营方，全线错位。
    const parsed = parseAccountName("自投-张三", anchoredRule());
    expect(parsed.segments.agent?.value).toBe("自投");
    expect(parsed.segments.optimizer?.value).toBe("张三");
    // 少写的那段如实记为未匹配，不拿别的段顶上。
    expect(parsed.unmatched).toContain("biz");
  });

  it("still parses the full-length nickname the same way", () => {
    const parsed = parseAccountName("CVR有端-代投-李四", anchoredRule());
    expect(parsed.segments.biz?.value).toBe("CVR有端");
    expect(parsed.segments.agent?.value).toBe("代投");
    expect(parsed.segments.optimizer?.value).toBe("李四");
  });

  it("falls back to positional slicing when the anchor value is absent", () => {
    // 找不到锚点就退回原来的纯位置切法——不猜，也不因此整条失败。
    const parsed = parseAccountName("CVR有端-未知运营方-王五", anchoredRule());
    expect(parsed.segments.biz?.value).toBe("CVR有端");
    expect(parsed.unmatched).toContain("agent");
  });

  it("prefers the longest alias so a long value is not cut short by a shorter one", () => {
    const longest = namingRuleSchema.parse({
      media: "KUAISHOU", version: 1, separators: ["-"],
      segments: [{
        key: "placement", label: "版位", order: 1, source: "enum", required: false, multi: false,
        mapsTo: "placement", values: ["优选", "优选广告位"], matchLongest: true,
      }],
    });
    // 两个别名共享前缀时，「谁先匹配算谁」会把长的截成短的；开了最长命中就该完整命中。
    expect(parseAccountName("优选广告位", longest).segments.placement?.value).toBe("优选广告位");
    expect(parseAccountName("优选", longest).segments.placement?.value).toBe("优选");
  });
});

describe("v1.9.23 pending segments (腾讯第 10 段·待确认)", () => {
  /** 腾讯规则的形状：前面几段照常，末尾一段含义还没定，先占位。 */
  const withPending = (mapsTo: string | null = null): NamingRule => namingRuleSchema.parse({
    media: "TENCENT",
    version: 1,
    separators: ["-"],
    segments: [
      { key: "operator", label: "运营方", order: 1, source: "enum", required: true, multi: false,
        mapsTo: "agent_type", values: ["自投", "代投"] },
      { key: "optimizer", label: "优化师", order: 2, source: "free", required: true, multi: false,
        mapsTo: "optimizer" },
      { key: "unknown_1", label: "第 10 段·待确认", order: 3, source: "free", required: false,
        multi: false, mapsTo, pending: true },
    ],
  });

  it("keeps the pending segment's value but never maps it to a dimension", () => {
    const parsed = parseAccountName("自投-张三-XYZ", withPending());
    // 值要存下来——优化师就是靠这些取值来确认这段是什么。
    expect(parsed.segments.unknown_1?.value).toBe("XYZ");
    // 但它不许带 mapsTo：带了就会进 resolveAccountDimensions，交叉表里出现一列猜出来的维度。
    expect(parsed.segments.unknown_1?.mapsTo).toBeNull();
    expect(parsed.status).toBe("parsed");
  });

  it("refuses a rule that maps a pending segment to a dimension", () => {
    // 规则上写着映射、运行时又忽略，是两份互相矛盾的事实，直接在校验闸拦掉。
    expect(() => withPending("placement")).toThrow();
  });

  it("ignores a mapsTo smuggled past the schema into stored JSONB", () => {
    // 库里的 JSONB 是能手写的：旧规则带着 pending + mapsTo 读回来，运行时也不认。
    const smuggled = { key: "unknown_1", label: "第 10 段·待确认", order: 3, source: "free" as const,
      required: false, multi: false, mapsTo: "placement", pending: true };
    expect(segmentMapsTo(smuggled)).toBeNull();
  });

  it("keeps a manual override on a pending segment out of the dimensions too", () => {
    const rule = withPending();
    const parsed = parseAccountName("自投-张三-XYZ", rule);
    const applied = applyOverride(parsed, { unknown_1: "人工填的值" }, rule);
    // 人改的是「这段写的是什么」，不是「这段算哪个维度」——后者要等段被确认。
    expect(applied.segments.unknown_1?.value).toBe("人工填的值");
    expect(applied.segments.unknown_1?.mapsTo).toBeNull();
    const dimensions = resolveAccountDimensions({
      segments: applied.segments, overriddenKeys: ["unknown_1"], platform: {},
    });
    expect(dimensions.placement).toEqual({ value: null, source: null });
  });

  it("lists pending segments in order for the cleaning page", () => {
    expect(pendingSegmentDefs(withPending())).toEqual([{ key: "unknown_1", label: "第 10 段·待确认" }]);
    // 没有待确认段的规范返回空数组，不是 null——前端照常渲染一个空区块。
    expect(pendingSegmentDefs(KUAISHOU)).toEqual([]);
  });
});
