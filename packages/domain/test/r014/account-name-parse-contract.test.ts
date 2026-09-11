import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EMPTY_DIMENSIONS_DTO, PARSED_DIMENSIONS, accountDimensionsDtoSchema, accountDimensionsSchema,
  analyzableSegmentDefs, applyOverride, computeConflicts, extractTaskIds, isSegmentAnalyzable,
  matchTaskAliasesLongest, namingRuleSchema, parseAccountName, pendingSegmentDefs,
  resolveAccountDimensions, segmentMapsTo, statusWithConflicts, toDimensionsDto,
  withEffectiveAnalyzable,
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
    // v1.9.26：可选的扣量回传段没对上「常规」时**不许把它吃掉**——「常规」是专项段的值，
    // 原来被吃掉后专项段解不出来，昵称里明明写着的值就这么丢了。
    expect(noRebate.segments.special!.value).toBe("常规");
    expect(noRebate.unmatched).toEqual(["rebate"]);
    // 缺的只是可选段 → 这条昵称完全合规，不该报 partial 去让优化师修一个没坏的东西。
    expect(noRebate.status).toBe("parsed");

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

/**
 * Q-038 腾讯（广点通）v1：12 段。规范本体在 `scripts/seed-naming-rule-tencent-v1.json`，
 * 这里**直接读那份 seed**——测试和灌进库的规范是同一份，改一处漏另一处会当场红。
 */
describe("Q-038 腾讯（广点通）v1 昵称规范", () => {
  const seed = JSON.parse(readFileSync(
    new URL("../../../../scripts/seed-naming-rule-tencent-v1.json", import.meta.url), "utf8",
  )) as { media: string; segments: unknown; separators: unknown };
  const TENCENT: NamingRule = namingRuleSchema.parse({
    media: seed.media, version: 1, segments: seed.segments, separators: seed.separators,
  });
  /** 老板给的那条真样例（优化师注释：「自动」是版位、「13244」是承接、「※」是他自己加的区分符）。 */
  const SAMPLE = "广点通-自投-刘晓佳-淘宝促活UVHS专项-安卓-联盟-自动-IPV-13244-10-页面投放831测-※";

  it("解出老板样例的每一段", () => {
    const parsed = parseAccountName(SAMPLE, TENCENT);
    expect(Object.fromEntries(Object.entries(parsed.segments).map(([key, segment]) => [key, segment.value])))
      .toEqual({
        channel: "广点通", agent_type: "自投", optimizer: "刘晓佳", biz: "淘宝促活UVHS专项",
        device: "安卓", resource_position: "联盟", ad_slot: "自动", goal: "IPV",
        landing: "13244", unknown_1: "10", note: "页面投放831测", marker: "※",
      });
    expect(parsed.status).toBe("parsed");
    expect(parsed.unmatched).toEqual([]);
    expect(parsed.leftover).toEqual([]);
  });

  it("末尾区分符「※」写不写都算 parsed", () => {
    // 规范里 marker 是可选段：没写不是「缺了东西」，不该推到优化师面前让他修。
    const withoutMarker = parseAccountName(SAMPLE.replace("-※", ""), TENCENT);
    expect(withoutMarker.status).toBe("parsed");
    expect(withoutMarker.segments.marker).toBeUndefined();
    // 前面每一段都不能因为少了末尾这一格而错位。
    expect(withoutMarker.segments.note?.value).toBe("页面投放831测");
    expect(withoutMarker.segments.unknown_1?.value).toBe("10");
  });

  it("第 10 段存值但不进任何维度（pending）", () => {
    const parsed = parseAccountName(SAMPLE, TENCENT);
    expect(parsed.segments.unknown_1?.value).toBe("10");
    // 含义还没确认就映射到维度 = 拿猜的值污染交叉表，比缺这一维更糟。
    expect(parsed.segments.unknown_1?.mapsTo).toBeNull();
    expect(pendingSegmentDefs(TENCENT)).toEqual([{ key: "unknown_1", label: "第 10 段·待确认" }]);
  });

  it("段落按草案表进对应维度：资源位→placement，版位段暂不映射", () => {
    const parsed = parseAccountName(SAMPLE, TENCENT);
    const dimensions = resolveAccountDimensions({
      segments: parsed.segments, overriddenKeys: [], platform: {},
    });
    expect(dimensions.placement).toEqual({ value: "联盟", source: "nickname" });
    expect(dimensions.agent_type).toEqual({ value: "自投", source: "nickname" });
    expect(dimensions.device).toEqual({ value: "安卓", source: "nickname" });
    expect(dimensions.goal).toEqual({ value: "IPV", source: "nickname" });
    expect(dimensions.landing).toEqual({ value: "13244", source: "nickname" });
    expect(dimensions.optimizer).toEqual({ value: "刘晓佳", source: "nickname" });
    // 快手有、腾讯规范里没有的维度保持「不知道」，不拿别的段硬凑。
    expect(dimensions.rta).toEqual({ value: null, source: null });
    expect(dimensions.bid_mode).toEqual({ value: null, source: null });
  });

  it("运营方是锚点段：少写前面一段也不整体错位", () => {
    // 少写渠道段（第 1 段）。按位置硬切会把「自投」当渠道、「刘晓佳」当运营方，全线错一格。
    const parsed = parseAccountName(SAMPLE.replace("广点通-", ""), TENCENT);
    expect(parsed.segments.agent_type?.value).toBe("自投");
    expect(parsed.segments.optimizer?.value).toBe("刘晓佳");
    expect(parsed.segments.goal?.value).toBe("IPV");
    // 少写的那段如实记为未匹配；它是必填段，所以这条确实是 partial。
    expect(parsed.unmatched).toContain("channel");
    expect(parsed.status).toBe("partial");
  });

  it("完全不按规范的腾讯户报 failed", () => {
    expect(parseAccountName("没按规范起的腾讯户", TENCENT).status).toBe("failed");
  });
});

/**
 * v1.9.27 ⑩：哪些段能当分析维度（`dimension_type: "segment:<key>"`）。
 * 老板要「每个清洗字段都能分析」，但**待确认段除外**——含义还没定，
 * 拿它拆出来的交叉表没人能解释。
 */
describe("v1.9.27 ⑩ 可分析段", () => {
  const rule = (extra: Record<string, unknown>[] = []): NamingRule => namingRuleSchema.parse({
    media: "TENCENT", version: 1, separators: ["-"],
    segments: [
      { key: "biz", label: "业务", order: 0, source: "free", required: true, multi: false, mapsTo: "biz" },
      { key: "ad_slot", label: "版位", order: 1, source: "enum", values: ["自动", "手动"],
        required: false, multi: false, mapsTo: null },
      { key: "unknown_1", label: "第 10 段·待确认", order: 2, source: "free",
        required: false, multi: false, mapsTo: null, pending: true },
      ...extra,
    ],
  });

  it("默认口径：进了归属维度的段就能分析", () => {
    expect(analyzableSegmentDefs(rule()).map((segment) => segment.key)).toEqual(["biz"]);
  });

  it("mapsTo 为空的段可以显式开成可分析", () => {
    // 腾讯的「版位」段不落任何归属维度，但业务上就是要按它拆数。
    const opted = namingRuleSchema.parse({
      ...rule(), segments: rule().segments.map((segment) =>
        (segment.key === "ad_slot" ? { ...segment, analyzable: true } : segment)),
    });
    expect(analyzableSegmentDefs(opted).map((segment) => segment.key)).toEqual(["biz", "ad_slot"]);
    expect(analyzableSegmentDefs(opted).find((segment) => segment.key === "ad_slot")?.mapsTo).toBeNull();
  });

  it("待确认段即便被显式开成可分析也不算", () => {
    const forced = namingRuleSchema.parse({
      ...rule(), segments: rule().segments.map((segment) =>
        (segment.key === "unknown_1" ? { ...segment, analyzable: true } : segment)),
    });
    expect(analyzableSegmentDefs(forced).map((segment) => segment.key)).not.toContain("unknown_1");
    expect(isSegmentAnalyzable(forced.segments.find((segment) => segment.key === "unknown_1")!)).toBe(false);
  });

  it("出到响应里的每一段都写着实际生效的 analyzable", () => {
    const shaped = withEffectiveAnalyzable(rule());
    expect(shaped.segments.map((segment) => [segment.key, segment.analyzable])).toEqual([
      ["biz", true], ["ad_slot", false], ["unknown_1", false],
    ]);
    // 物化过的规则再过一遍 schema 仍然合法：fe 原样 PUT 回来不会被拒。
    expect(() => namingRuleSchema.parse(shaped)).not.toThrow();
  });

  it("腾讯 v1 seed 的可分析段就是落维度的那几段", () => {
    const seed = JSON.parse(readFileSync(
      new URL("../../../../scripts/seed-naming-rule-tencent-v1.json", import.meta.url), "utf8",
    )) as { media: string; segments: unknown; separators: unknown };
    const tencent = namingRuleSchema.parse({
      media: seed.media, version: 1, segments: seed.segments, separators: seed.separators });
    // 落维度的那几段 + 显式开过的「版位」段（老板要每个清洗字段都能分析，
    // 版位在草案表里就是筛选维度，只是不落归属维度）。
    expect(analyzableSegmentDefs(tencent).map((segment) => segment.key))
      .toEqual(["agent_type", "optimizer", "biz", "device", "resource_position", "ad_slot", "goal", "landing"]);
  });
});

/** Q-043 ③：昵称里没写任务 ID 时，按任务别名最长命中兜底绑任务。 */
describe("v1.9.28 ③ 按任务别名最长命中绑任务", () => {
  const aliases = [
    { taskId: "T-1", alias: "拉新" },
    { taskId: "T-2", alias: "拉新专项" },
    { taskId: "T-3", alias: "闪购" },
  ];

  it("取最长的那个别名，短的那个是巧合", () => {
    expect(matchTaskAliasesLongest("DAU-拉新专项-自投-张三", aliases)).toEqual(["T-2"]);
    expect(matchTaskAliasesLongest("DAU-拉新-自投-张三", aliases)).toEqual(["T-1"]);
  });

  it("最长长度上两个任务打平就一个都不绑", () => {
    // 绑错任务比不绑更贵：这个账户的花费会算到别人的任务上。
    const tied = [{ taskId: "T-1", alias: "AA" }, { taskId: "T-2", alias: "BB" }];
    expect(matchTaskAliasesLongest("户-AA-BB", tied)).toEqual([]);
    // 同一个任务的两个别名都命中不算打平。
    const same = [{ taskId: "T-9", alias: "AA" }, { taskId: "T-9", alias: "BB" }];
    expect(matchTaskAliasesLongest("户-AA-BB", same)).toEqual(["T-9"]);
  });

  it("没命中就空手回，不编一个任务出来", () => {
    expect(matchTaskAliasesLongest("完全不相干的户", aliases)).toEqual([]);
    expect(matchTaskAliasesLongest("", aliases)).toEqual([]);
    expect(matchTaskAliasesLongest("拉新", [])).toEqual([]);
    // 空白别名不算命中——否则每条昵称都会「命中」它。
    expect(matchTaskAliasesLongest("任意名字", [{ taskId: "T-0", alias: "   " }])).toEqual([]);
  });
});
