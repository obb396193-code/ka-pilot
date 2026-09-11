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
  /**
   * v1.9.22 ①：**锚点段**。昵称里位置飘的时候（少写一段、多写一段），按位置硬切必错；
   * 锚点段先在全串里找到自己，其余段再按**相对它的位置**切。
   * 典型是「自投/代投」这种值域小又必出现的段。
   */
  anchor: z.boolean().optional(),
  /**
   * v1.9.22 ①：**最长别名命中**。别名里既有「优选」又有「优选广告位」时，
   * 默认那套「谁先匹配算谁」会把长的截成短的；开了它就按长度倒序试，先长后短。
   */
  matchLongest: z.boolean().optional(),
  /**
   * v1.9.23：**未知段**。渠道规范里位置固定、含义还没定的那一段（腾讯第 10 段），
   * 先原样占位：解析照常把值存进 `segments[key]`，但**不进任何维度**——
   * 含义没确认就往维度里塞，等于拿猜的值污染交叉表和日报，比缺这一维更糟。
   * 归属清洗页列它的取值分布，优化师每月确认后再改成正式 key + `mapsTo`。
   */
  pending: z.boolean().optional(),
  /**
   * v1.9.27 ⑩：这一段可不可以当**分析维度**用（`dimension_type: "segment:<key>"`）。
   * 默认口径是「进了归属维度的段就能分析」（`mapsTo` 非空）；这个开关是给
   * `mapsTo` 为空、但业务上确实想按它拆数的段用的（腾讯的「版位」段就是这种）。
   * 判定统一走 `isSegmentAnalyzable`，别在各处自己 OR 一遍。
   */
  analyzable: z.boolean().optional(),
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
  // 待确认的段不许声明 mapsTo：规则上写着映射、运行时又忽略它，是两份互相矛盾的事实，
  // 迟早有人照规则去查维度然后发现全空。要映射就先把这段确认下来、去掉 pending。
  if (segment.pending === true && segment.mapsTo !== null) {
    context.addIssue({
      code: "custom",
      message: "a pending segment must not map to a dimension until it is confirmed",
      path: ["mapsTo"],
    });
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

/**
 * 段实际生效的维度映射。**待确认段一律 null**——即便库里存着一版 `pending:true` 又带
 * `mapsTo` 的旧规则（schema 现在不收，但 JSONB 是能手写进去的），运行时也不认它。
 * 校验闸 + 运行时各挡一层，因为这两处的失效方式不一样：schema 挡的是新规则，
 * 这里挡的是已经躺在库里的旧规则。
 */
export function segmentMapsTo(segment: NamingSegment): string | null {
  return segment.pending === true ? null : segment.mapsTo;
}

/**
 * 段能不能当分析维度。**待确认段一律不能**：含义都还没定，拿它拆出来的交叉表
 * 没人能解释，比少一个维度更糟（与 `segmentMapsTo` 同一条理由）。
 */
export function isSegmentAnalyzable(segment: NamingSegment): boolean {
  if (segment.pending === true) return false;
  return segment.analyzable === true || segment.mapsTo !== null;
}

export interface AnalyzableSegmentDef {
  key: string;
  label: string;
  /** 进哪个归属维度；null = 只能按段自己分析，不落维度。 */
  mapsTo: string | null;
}

/** 规则里所有可分析段，按 order。`dimension_type: "segment:<key>"` 的合法 key 集合就是它。 */
export function analyzableSegmentDefs(rule: NamingRule): AnalyzableSegmentDef[] {
  return [...rule.segments]
    .sort((left, right) => left.order - right.order)
    .filter((segment) => isSegmentAnalyzable(segment))
    .map((segment) => ({ key: segment.key, label: segment.label, mapsTo: segmentMapsTo(segment) }));
}

/**
 * 把每段**实际生效的** `analyzable` 显式写出来，给出到响应里的那一份用。
 * fe 不该自己再推一遍「mapsTo 非空就算」——推法哪天变了，两边就各说各话。
 */
export function withEffectiveAnalyzable<T extends NamingRule>(rule: T): T {
  return {
    ...rule,
    segments: rule.segments.map((segment) => ({ ...segment, analyzable: isSegmentAnalyzable(segment) })),
  };
}

export interface PendingSegmentDef {
  key: string;
  label: string;
}

/** 规则里所有待确认段，按 order。归属清洗页照这个列「第 N 段·待确认」。 */
export function pendingSegmentDefs(rule: NamingRule): PendingSegmentDef[] {
  return [...rule.segments]
    .sort((left, right) => left.order - right.order)
    .filter((segment) => segment.pending === true)
    .map((segment) => ({ key: segment.key, label: segment.label }));
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

/**
 * `account_name_parses.segments` 是 JSONB，读回来要校形状再用。
 * 库里的东西不是天生可信的——写它的可能是上一版解析器，也可能是人工改过的行。
 */
export const parsedSegmentSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(512),
  mapsTo: z.string().min(1).max(64).nullable(),
  taskIds: z.array(z.string().max(128)).max(64),
}).strict();
export const parsedSegmentsSchema = z.record(z.string().max(64), parsedSegmentSchema);

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

/** 枚举候选：开了 `matchLongest` 就按长度倒序，先长后短，避免长别名被短的截胡。 */
function enumValues(segment: NamingSegment): readonly string[] {
  const values = segment.values ?? [];
  return segment.matchLongest === true
    ? [...values].sort((left, right) => right.length - left.length)
    : values;
}

function matchesSegment(segment: NamingSegment, token: string): boolean {
  const { bare } = extractTaskIds(token);
  if (segment.source === "free") return token.length > 0;
  if (segment.source === "regex") return new RegExp(segment.pattern!).test(token);
  // 枚举值自带括号（如「CVR有端(1803240580)」），所以裸值与原值都试一次。
  return enumValues(segment).some((value) => {
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
    segments[segment.key] = { key: segment.key, value: bare, mapsTo: segmentMapsTo(segment), taskIds };
  };

  /**
   * v1.9.22 ① 锚点：昵称里少写或多写一段时，按位置硬切会整体错位。
   * 先让锚点段在全串里找到自己，再把 token 游标对齐到它——**它之前的段按位置切，
   * 它之后的段从它往后接着切**。找不到锚点就退回原来的纯位置切法，不猜。
   */
  const anchorSegment = ordered.find((segment) => segment.anchor === true && segment.source === "enum");
  let anchorTokenIndex = -1;
  let anchorOrderIndex = -1;
  if (anchorSegment !== undefined) {
    anchorTokenIndex = tokens.findIndex((token) => matchesSegment(anchorSegment, token));
    anchorOrderIndex = ordered.indexOf(anchorSegment);
  }

  const absorbIndex = ordered.findIndex((segment) => segment.multi);
  const front = absorbIndex < 0 ? ordered : ordered.slice(0, absorbIndex);
  const tail = absorbIndex < 0 ? [] : ordered.slice(absorbIndex + 1);
  const absorb = absorbIndex < 0 ? null : ordered[absorbIndex]!;

  /**
   * 前段：按位置逐个锚定，token 不够或枚举对不上都只记这一段没匹配，不整条丢。
   *
   * 有锚点时**以锚点段为基准反推**：锚点在段序里排第 `anchorOrderIndex`、
   * 在 token 里落在第 `anchorTokenIndex` 位，那么它前面每一段都往前数一格；
   * 数不到（昵称少写了前面的段）就记未匹配，**不把后面的段拽上来顶位**——
   * 顶位正是没有锚点时会全线错位的原因。
   */
  const useAnchor = anchorTokenIndex >= 0 && anchorOrderIndex >= 0;
  let head = 0;
  for (const [index, segment] of front.entries()) {
    const at = useAnchor ? anchorTokenIndex - (anchorOrderIndex - index) : head;
    const token = at >= 0 ? tokens[at] : undefined;
    if (token === undefined || !matchesSegment(segment, token)) {
      unmatched.push(segment.key);
      // **可选段没对上 = 这条昵称压根没写它，那个 token 不属于它，不能吃掉**。
      // 原来一律往后挪一格：快手「…-有R-常规-13177-A」里可选的「扣量回传」段对不上「常规」，
      // 却把「常规」吃了，于是专项段解不出来——昵称里明明写着的值就这么丢了。
      // 必填段对不上是另一回事：位置上确实有它，只是值不规范，那一格照吃，
      // 否则后面全线错位（这正是锚点段要解的问题）。
      if (segment.required) head = Math.max(head, at + 1);
      continue;
    }
    record(segment, token);
    head = at + 1;
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
          mapsTo: segmentMapsTo(absorb),
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
  /**
   * partial 的含义是「**该有的没有**」，不是「可选的没写」。
   * 可选段（规范明写可不写，如快手的扣量回传、腾讯的区分符「※」）缺了还报 partial，
   * 等于把一条完全合规的昵称推到优化师面前让他修一个没坏的东西。
   */
  const required = new Set(ordered.filter((segment) => segment.required).map((segment) => segment.key));
  const missingRequired = unmatched.filter((key) => required.has(key));

  return {
    // 一段都没认出来 = 这条昵称压根不按规范写，报 failed；必填段缺了才是 partial，成功的段照用。
    status: matchedCount === 0 ? "failed" : missingRequired.length === 0 ? "parsed" : "partial",
    segments,
    taskIds,
    unmatched: [...new Set(unmatched)],
    leftover,
  };
}

/* ── v1.9.28 ③：昵称里没有任务 ID 时，按任务别名最长命中绑任务 ──────── */

export interface TaskAlias {
  taskId: string;
  alias: string;
}

/**
 * 昵称按**最长别名命中**绑任务（Q-043 ③，复用 `matchLongest` 那条道理）。
 *
 * 只在昵称里**一个任务 ID 都没写**时才用：写了 ID 就以 ID 为准，别名是兜底不是覆盖。
 *
 * 两条不猜的规矩：
 * - 命中按别名长度取最长——「拉新」与「拉新A」同时命中时，短的那个是巧合。
 * - 最长长度上**有两个不同任务打平就一个都不绑**：那是真的分不清，绑错任务比不绑更贵
 *   （账户的花费会算到别人的任务上）。
 */
export function matchTaskAliasesLongest(rawName: string, aliases: readonly TaskAlias[]): string[] {
  const name = rawName.trim();
  if (name.length === 0) return [];
  const hits = aliases.filter((entry) => {
    const alias = entry.alias.trim();
    return alias.length > 0 && name.includes(alias);
  });
  if (hits.length === 0) return [];
  const longest = Math.max(...hits.map((entry) => entry.alias.trim().length));
  const winners = [...new Set(hits
    .filter((entry) => entry.alias.trim().length === longest)
    .map((entry) => entry.taskId))];
  return winners.length === 1 ? winners : [];
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
  // 人工改一个待确认段的值也照样不进维度：人改的是「这一段写的是什么」，
  // 不是「这一段该算哪个维度」——后者要等优化师确认段的含义。
  const mapsToByKey = new Map(rule.segments.map((segment) => [segment.key, segmentMapsTo(segment)]));
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

/**
 * DTO 侧的十个维度键（fixture `account-list/ready-v193-dimensions.json` 冻结）。
 * 库内与 `mapsTo` 用 snake_case（跟命名规范原文一致），出到 DTO 转 camelCase——
 * 两套键名各有出处，映射写在这里一处，别散到服务层各拼一遍。
 */
export const DIMENSION_DTO_KEYS = {
  placement: "placement", bid_mode: "bidMode", device: "device", goal: "goal", rta: "rta",
  agent_type: "agentType", optimizer: "optimizer", special: "special",
  landing: "landing", rebate: "rebate",
} as const satisfies Record<ParsedDimension, string>;

export const accountDimensionsDtoSchema = z.object(
  Object.fromEntries(Object.values(DIMENSION_DTO_KEYS).map((key) => [key, dimensionValueSchema])) as
    Record<(typeof DIMENSION_DTO_KEYS)[ParsedDimension], typeof dimensionValueSchema>,
).strict();
export type AccountDimensionsDto = z.infer<typeof accountDimensionsDtoSchema>;

export function toDimensionsDto(dimensions: AccountDimensions): AccountDimensionsDto {
  return accountDimensionsDtoSchema.parse(Object.fromEntries(
    PARSED_DIMENSIONS.map((key) => [DIMENSION_DTO_KEYS[key], dimensions[key]]),
  ));
}

/** 没有解析行的账户：十个维度全 null。**不是 "unknown" 也不是空串。** */
export const EMPTY_DIMENSIONS_DTO: AccountDimensionsDto = toDimensionsDto(
  accountDimensionsSchema.parse(Object.fromEntries(
    PARSED_DIMENSIONS.map((key) => [key, { value: null, source: null }]),
  )),
);

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
