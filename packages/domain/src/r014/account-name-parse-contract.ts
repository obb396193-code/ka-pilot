import { z } from "zod";

/**
 * v1.8 账户昵称解析（R-017 T2）。
 *
 * **代码里不许出现任何渠道的枚举**：快手那 12 段只是 `media=KUAISHOU` 的第 1 版规范，
 * 腾讯/字节各有各的，全部从 `naming_rules` 读（arch 派活硬要求 ①）。
 */
export const namingSegmentSourceSchema = z.enum(["enum", "regex", "free"]);

export const namingSegmentSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  order: z.number().int().nonnegative(),
  source: namingSegmentSourceSchema,
  values: z.array(z.string().min(1)).optional(),
  pattern: z.string().min(1).optional(),
  required: z.boolean().default(false),
  /** 允许一段里塞多个值（快手的「专项」用 `-` 连多个）；**整条规范里最多一个**。 */
  multi: z.boolean().default(false),
  /** 指向系统维度：biz/agent_type/optimizer/bid_mode/device/placement/goal/rta/rebate/special/landing。 */
  mapsTo: z.string().min(1).max(64).nullable().default(null),
}).strict().superRefine((segment, context) => {
  if (segment.source === "enum" && (segment.values === undefined || segment.values.length === 0)) {
    context.addIssue({ code: "custom", message: "an enum segment must list its values", path: ["values"] });
  }
  if (segment.source === "regex" && segment.pattern === undefined) {
    context.addIssue({ code: "custom", message: "a regex segment must carry its pattern", path: ["pattern"] });
  }
});
export type NamingSegment = z.infer<typeof namingSegmentSchema>;

export const namingRuleSchema = z.object({
  media: z.string().min(1).max(32),
  version: z.number().int().positive(),
  segments: z.array(namingSegmentSchema).min(1).max(50),
  separators: z.array(z.string().length(1)).min(1).max(10),
}).strict().superRefine((rule, context) => {
  const orders = rule.segments.map((segment) => segment.order);
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: "custom", message: "segment orders must be unique", path: ["segments"] });
  }
  // 两端锚定要求「吸收段」唯一：有两个可变长段就无法确定中间从哪到哪。
  if (rule.segments.filter((segment) => segment.multi).length > 1) {
    context.addIssue({ code: "custom", message: "at most one segment may be multi", path: ["segments"] });
  }
});
export type NamingRule = z.infer<typeof namingRuleSchema>;

/**
 * 从「带元数据的规范记录」里取出纯规范。
 * `namingRuleSchema` 是 strict 的，仓储记录多带的 `effectiveFrom/note/createdAt`
 * 直接传给 `parseAccountName` 会被拒——所以提取这一步必须显式，不能靠调用方记得。
 */
export function toNamingRule(record: NamingRule): NamingRule {
  return namingRuleSchema.parse({
    media: record.media,
    version: record.version,
    segments: record.segments,
    separators: record.separators,
  });
}

export const parseStatusSchema = z.enum(["parsed", "partial", "failed", "conflict", "confirmed", "overridden"]);
export type ParseStatus = z.infer<typeof parseStatusSchema>;

export interface ParsedSegment {
  key: string;
  value: string;
  mapsTo: string | null;
  /** 该段解析出的任务 ID（括号里的）；业务段常见，其他段可能也有。 */
  taskIds: string[];
}

export interface AccountNameParse {
  /** parser 只产出这三种；conflict / confirmed / overridden 由仓储层按外部事实定。 */
  status: Extract<ParseStatus, "parsed" | "partial" | "failed">;
  segments: Record<string, ParsedSegment>;
  /** 全名里出现的全部任务 ID，去重保序。**只作校验，不直接写归属**（归属以启航为准）。 */
  taskIds: string[];
  /** 没匹配上的段 key；partial 时前端显 −，不整条丢弃。 */
  unmatched: string[];
  /** 规范之外的多余 token；有值说明昵称比规范长，人工要看一眼。 */
  leftover: string[];
}

/** 半角与全角括号都认（规范里两种混用）。 */
const BRACKET = /[(（]([^)）]*)[)）]/;
/** 括号里多个任务 ID 的分隔：顿号、半角逗号、全角逗号。 */
const TASK_ID_SPLIT = /[、,，]/;

/** 从一个段值里抽任务 ID，并返回去掉括号后的「裸值」用于枚举匹配。 */
export function extractTaskIds(value: string): { bare: string; taskIds: string[] } {
  const matched = BRACKET.exec(value);
  if (matched === null) return { bare: value.trim(), taskIds: [] };
  const ids = matched[1]!
    .split(TASK_ID_SPLIT)
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
  return { bare: value.replace(BRACKET, "").trim(), taskIds: ids };
}

function splitTokens(name: string, separators: readonly string[]): string[] {
  const escaped = separators.map((separator) => separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  return name.split(new RegExp(`[${escaped}]`)).map((token) => token.trim()).filter((token) => token.length > 0);
}

function matchesSegment(segment: NamingSegment, token: string): boolean {
  const { bare } = extractTaskIds(token);
  if (segment.source === "free") return token.length > 0;
  if (segment.source === "regex") return new RegExp(segment.pattern!).test(token);
  // 枚举值自带括号（如「CVR有端(1803240580)」），所以裸值与原值都试一次。
  return segment.values!.some((value) => {
    const candidate = extractTaskIds(value).bare;
    return value === token || candidate === bare;
  });
}

/**
 * 两端锚定解析。
 *
 * 规范有两处天然歧义（专项段用同一个 `-` 连多值、括号半角全角混用），
 * **按分隔符硬切段必炸**，所以：前段按位置 + 枚举锚定，尾段从末尾按正则/枚举倒着认，
 * 中间剩下的整体归「吸收段」（可含分隔符）。
 *
 * 尾段一律**可缺省**（规范明写「若未设置增量/扣量回传，可不写」），
 * 所以倒着认时匹配不上就跳过该段继续，而不是判定整条失败。
 */
export function parseAccountName(rawName: string, rawRule: NamingRule): AccountNameParse {
  const rule = namingRuleSchema.parse(rawRule);
  const ordered = [...rule.segments].sort((a, b) => a.order - b.order);
  const tokens = splitTokens(rawName, rule.separators);

  const segments: Record<string, ParsedSegment> = {};
  const unmatched: string[] = [];
  const record = (segment: NamingSegment, token: string): void => {
    const { bare, taskIds } = extractTaskIds(token);
    segments[segment.key] = { key: segment.key, value: bare, mapsTo: segment.mapsTo, taskIds };
  };

  const absorbIndex = ordered.findIndex((segment) => segment.multi);
  const front = absorbIndex < 0 ? ordered : ordered.slice(0, absorbIndex);
  const tail = absorbIndex < 0 ? [] : ordered.slice(absorbIndex + 1);
  const absorb = absorbIndex < 0 ? null : ordered[absorbIndex]!;

  // 前段：按位置逐个锚定。token 不够或枚举对不上都只记这一段没匹配，不整条丢。
  let head = 0;
  for (const segment of front) {
    const token = tokens[head];
    if (token === undefined) { unmatched.push(segment.key); continue; }
    if (!matchesSegment(segment, token)) { unmatched.push(segment.key); head += 1; continue; }
    record(segment, token);
    head += 1;
  }

  // 尾段：从末尾倒着认，每段可缺省。
  let end = tokens.length - 1;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const segment = tail[index]!;
    const token = end >= head ? tokens[end] : undefined;
    if (token !== undefined && matchesSegment(segment, token)) {
      record(segment, token);
      end -= 1;
    } else {
      unmatched.push(segment.key);
    }
  }

  // 中间剩下的整体归吸收段（可含分隔符）。
  const middle = tokens.slice(head, end + 1);
  if (absorb !== null) {
    if (middle.length === 0) {
      unmatched.push(absorb.key);
    } else {
      const joined = middle.join(rule.separators[0]!);
      // 吸收段是枚举时逐个值校验；有一个对不上就整段算没匹配，不半信半疑。
      const allKnown = absorb.source !== "enum" || middle.every((token) => matchesSegment(absorb, token));
      if (allKnown) {
        segments[absorb.key] = {
          key: absorb.key,
          value: joined,
          mapsTo: absorb.mapsTo,
          taskIds: middle.flatMap((token) => extractTaskIds(token).taskIds),
        };
      } else {
        unmatched.push(absorb.key);
      }
    }
  }

  const leftover = absorb === null ? tokens.slice(head, end + 1) : [];
  const taskIds = [...new Set(Object.values(segments).flatMap((segment) => segment.taskIds))];
  const matchedCount = Object.keys(segments).length;

  return {
    // 一段都没认出来 = 这条昵称压根不按规范写，报 failed；认出一部分就是 partial，成功的段照用。
    status: matchedCount === 0 ? "failed" : unmatched.length === 0 ? "parsed" : "partial",
    segments,
    taskIds,
    unmatched: [...new Set(unmatched)],
    leftover,
  };
}

/* ── T3：冲突计算与人工覆盖 ────────────────────────────────────────── */

export const parseConflictSchema = z.object({
  field: z.string().min(1),
  fromNickname: z.string().min(1),
  fromPlatform: z.string().min(1),
  source: z.enum(["platform", "qihang"]),
}).strict();
export type ParseConflict = z.infer<typeof parseConflictSchema>;

export interface ExternalFacts {
  /** 平台侧同维度的现值（键是 mapsTo）。**取不到就别放进来**——缺证据不是冲突。 */
  platform: Readonly<Record<string, string | null | undefined>>;
  /** 启航侧该账户当前的有效任务 ID。空数组 = 启航没有归属，不构成冲突。 */
  qihangTaskIds: readonly string[];
}

/**
 * 昵称 vs 平台字段 vs 启航任务 ID 的冲突。
 *
 * **绝不静默选一边**（arch 硬要求 ③）：两边都有值且不一样才记冲突，
 * 由人工在清洗页看；**一边缺值不算冲突**——那是没有证据，不是矛盾。
 */
export function computeConflicts(parse: AccountNameParse, facts: ExternalFacts): ParseConflict[] {
  const conflicts: ParseConflict[] = [];
  for (const segment of Object.values(parse.segments)) {
    if (segment.mapsTo === null) continue;
    const platform = facts.platform[segment.mapsTo];
    if (platform === null || platform === undefined || platform === "") continue;
    if (platform === segment.value) continue;
    conflicts.push(parseConflictSchema.parse({
      field: segment.mapsTo,
      fromNickname: segment.value,
      fromPlatform: platform,
      source: "platform",
    }));
  }
  // 任务 ID 比的是集合：昵称里多写一个、少写一个都算不一致，要人看。
  if (parse.taskIds.length > 0 && facts.qihangTaskIds.length > 0) {
    const nickname = [...parse.taskIds].sort();
    const qihang = [...facts.qihangTaskIds].sort();
    if (nickname.join(",") !== qihang.join(",")) {
      conflicts.push(parseConflictSchema.parse({
        field: "task_ids",
        fromNickname: nickname.join(","),
        fromPlatform: qihang.join(","),
        source: "qihang",
      }));
    }
  }
  return conflicts;
}

/** 有冲突就升级成 conflict；`failed` 不升级（都没解析出来，谈不上跟谁矛盾）。 */
export function statusWithConflicts(parse: AccountNameParse, conflicts: readonly ParseConflict[]): ParseStatus {
  if (parse.status === "failed") return "failed";
  return conflicts.length > 0 ? "conflict" : parse.status;
}

export const parseOverrideSchema = z.record(z.string().min(1), z.string().min(1));
export type ParseOverride = z.infer<typeof parseOverrideSchema>;

/**
 * 人工改过的段**永远优先**，重解析不覆盖（arch 硬要求 ③）。
 * 覆盖一个原本没解析出来的段时，它同时从 unmatched 里移除——人已经给了答案。
 *
 * 必须传 `rule`：被覆盖的段可能压根没解析出来，`mapsTo` 只能从规范里查。
 * 丢了 `mapsTo`，T5 的维度来源切换就不知道这个人工值该喂给哪个维度。
 */
export function applyOverride(
  parse: AccountNameParse,
  rawOverride: ParseOverride,
  rule: NamingRule,
): AccountNameParse {
  const override = parseOverrideSchema.parse(rawOverride);
  const keys = Object.keys(override);
  if (keys.length === 0) return parse;
  const mapsToByKey = new Map(rule.segments.map((segment) => [segment.key, segment.mapsTo]));
  const segments = { ...parse.segments };
  for (const [key, value] of Object.entries(override)) {
    const existing = segments[key];
    segments[key] = {
      key,
      value,
      mapsTo: existing?.mapsTo ?? mapsToByKey.get(key) ?? null,
      // 人工只改这一段的值，不改它带的任务 ID——那是从昵称括号里读出来的事实。
      taskIds: existing?.taskIds ?? [],
    };
  }
  return {
    ...parse,
    segments,
    unmatched: parse.unmatched.filter((key) => !keys.includes(key)),
  };
}

/* ── T5：维度来源切换 ──────────────────────────────────────────────── */

/**
 * v1.8：这十个维度的**主源改成昵称解析**，平台字段降为对照。
 * 原因见 api.md v1.8「为什么改主源」：平台的 `resource_position` 是广告组级的平台版位，
 * 业务口径的「优选」是把两三个平台版位合成一个，两者对不上；业务版位只有昵称里有。
 */
export const PARSED_DIMENSIONS = [
  "placement", "bid_mode", "device", "goal", "rta",
  "agent_type", "optimizer", "special", "landing", "rebate",
] as const;
export type ParsedDimension = typeof PARSED_DIMENSIONS[number];

export const dimensionSourceSchema = z.enum(["nickname", "platform", "manual", "qihang"]);
export type DimensionSource = z.infer<typeof dimensionSourceSchema>;

export const dimensionValueSchema = z.object({
  value: z.string().min(1).nullable(),
  /** 值为 null 时来源也是 null——「不知道」没有来源可言。 */
  source: dimensionSourceSchema.nullable(),
}).strict().superRefine((entry, context) => {
  if ((entry.value === null) !== (entry.source === null)) {
    context.addIssue({ code: "custom", message: "value and source must both be present or both be null" });
  }
});
export type DimensionValue = z.infer<typeof dimensionValueSchema>;

export const accountDimensionsSchema = z.object(
  Object.fromEntries(PARSED_DIMENSIONS.map((key) => [key, dimensionValueSchema])) as
    Record<ParsedDimension, typeof dimensionValueSchema>,
).strict();
export type AccountDimensions = z.infer<typeof accountDimensionsSchema>;

export interface DimensionInputs {
  /** 解析出的段（已叠加 override）；键是段 key，带 mapsTo。 */
  segments: Readonly<Record<string, ParsedSegment>>;
  /** 人工改过的段 key 集合——这些的来源是 manual 而不是 nickname。 */
  overriddenKeys: readonly string[];
  /** 平台侧同维度现值，作对照与兜底。取不到就别放进来。 */
  platform: Readonly<Record<string, string | null | undefined>>;
}

/**
 * 十个维度逐个定值与来源。优先级：**人工 > 昵称 > 平台**。
 *
 * 三者都没有 → `{value: null, source: null}`：**不写 "unknown" 当值**，
 * 那会让「没标注」和「标注为未知」在页面上分不出来（v1.7.9 agent_type 那条踩过）。
 */
export function resolveAccountDimensions(inputs: DimensionInputs): AccountDimensions {
  const overridden = new Set(inputs.overriddenKeys);
  const byDimension = new Map<string, { value: string; source: DimensionSource }>();
  for (const segment of Object.values(inputs.segments)) {
    if (segment.mapsTo === null || segment.value === "") continue;
    byDimension.set(segment.mapsTo, {
      value: segment.value,
      source: overridden.has(segment.key) ? "manual" : "nickname",
    });
  }
  const resolved = Object.fromEntries(PARSED_DIMENSIONS.map((dimension) => {
    const fromName = byDimension.get(dimension);
    if (fromName !== undefined) return [dimension, fromName];
    const platform = inputs.platform[dimension];
    if (typeof platform === "string" && platform !== "") {
      return [dimension, { value: platform, source: "platform" as const }];
    }
    return [dimension, { value: null, source: null }];
  }));
  return accountDimensionsSchema.parse(resolved);
}
