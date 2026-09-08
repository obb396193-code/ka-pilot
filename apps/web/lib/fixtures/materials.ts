import type { Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"
import list from "@contract/fixtures/materials/list.json"
import products from "@contract/fixtures/materials/products.json"
import detail from "@contract/fixtures/materials/detail.json"
import analysis from "@contract/fixtures/materials/analysis.json"
import similar from "@contract/fixtures/materials/similar.json"
import lineage from "@contract/fixtures/materials/lineage.json"
import brief from "@contract/fixtures/materials/brief.json"
import backtest from "@contract/fixtures/materials/backtest.json"
import experiments from "@contract/fixtures/materials/experiments.json"

// 商品素材（F-007 §9，契约 v1.6 6.x）fixture 读取层。P2 示例态：页面标「示例」，解锁 = 视频源探针通过 + R-015。不算数。
export type MaterialMetrics = { cost: MetricValue; exposure: MetricValue; click: MetricValue; realConversion: MetricValue; ratios: { ctr: RatioValue; realCpa: RatioValue } }
export type MaterialItem = { media: string; materialId: string; name: string; type: "video" | "image"; source: "qihang_pool" | "upload" | "internal"; thumbnailRef: string | null; durationMs: number | null; productId: string | null; tags: string[]; lineageParentId: string | null; sourceStatus: "reachable" | "unreachable" | "unknown"; metrics: MaterialMetrics; analysis: { latestVersion: number | null; status: "none" | "queued" | "running" | "done" | "failed" } }
export const materialsFixture = list as unknown as Fixture<{ cards: { testingProducts: number; scalableProducts: number; activeMaterials: number; breakoutMaterials: number; fatigued: number; replicationCandidates: number }; items: MaterialItem[]; page: number; pageSize: number; total: number }>
export const sourceLabel: Record<MaterialItem["source"], string> = { qihang_pool: "启航素材池", upload: "上传", internal: "内部 AIGC" }
export const sourceStatusMeta: Record<MaterialItem["sourceStatus"], { label: string; tone: "success" | "muted" | "warning" }> = { reachable: { label: "视频源可达", tone: "success" }, unreachable: { label: "视频源不可达", tone: "muted" }, unknown: { label: "未探测", tone: "warning" } }
export const analysisStatusMeta: Record<MaterialItem["analysis"]["status"], { label: string; tone: "muted" | "pending" | "progress" | "success" | "critical" }> = { none: { label: "未拆片", tone: "muted" }, queued: { label: "排队", tone: "pending" }, running: { label: "拆片中", tone: "progress" }, done: { label: "已拆片", tone: "success" }, failed: { label: "失败", tone: "critical" } }

export type ProductItem = { productId: string; name: string; status: "testing" | "scalable" | "paused" | "retired"; attrs: Record<string, string>; materialCount: number; metrics: MaterialMetrics }
export const productsFixture = products as unknown as Fixture<{ items: ProductItem[] }>
export const productStatusMeta: Record<ProductItem["status"], { label: string; tone: "warning" | "success" | "muted" | "critical" }> = { testing: { label: "测品中", tone: "warning" }, scalable: { label: "可放量", tone: "success" }, paused: { label: "暂停", tone: "muted" }, retired: { label: "淘汰", tone: "critical" } }

export type MaterialDetail = { material: MaterialItem; lineage: { parent: { materialId: string; method: string } | null; children: { materialId: string; method: string }[] }; whereUsed: { taskId: string; accountId: string; adCount: number }[] }
export const materialDetailFixture = detail as unknown as Fixture<MaterialDetail>

export type SegmentRole = "hook" | "problem" | "body" | "proof" | "selling_point" | "turn" | "cta" | "other"
export type MaterialAnalysis = { version: number; promptVersion: string; schemaVersion: string; status: string; media: { durationMs: number; width: number; height: number; contentSha256: string }; transcript: { source: "platform_caption" | "cloud_asr"; timingPrecision: "segment" | "whole_video"; segments: { id: string; startMs: number; endMs: number; text: string }[] }; shots: { id: string; startMs: number; endMs: number; frame: { status: "ready"; artifactRef: string } | { status: "placeholder"; reason: string } }[]; visualSummary: { hardCutCount: number; visualEventCount: number; averageShotLengthMs: number; hookVisualDensity: number }; result: { hook: { text: string; kind: string; evidenceIds: string[] }; sellingPoints: { text: string; evidenceIds: string[] }[]; audiences: string[]; rhythm: { tempo: string; hookSeconds: number; infoDensity: string }; cta: { text: string; evidenceIds: string[] }; segments: { role: SegmentRole; startMs: number; endMs: number }[] }; fingerprint: string }
export const analysisFixture = analysis as unknown as Fixture<MaterialAnalysis>
export const segmentRoleLabel: Record<SegmentRole, string> = { hook: "钩子", problem: "痛点", body: "正文", proof: "证明", selling_point: "卖点", turn: "转折", cta: "CTA", other: "其他" }
export const hookKindLabel: Record<string, string> = { pain_point: "痛点型", question: "提问型", contrast: "对比型", scene: "场景型", benefit: "利益型" }
export const tempoLabel: Record<string, string> = { slow: "慢", medium: "中", medium_fast: "中快", fast: "快" }
export const densityLabel: Record<string, string> = { low: "低", medium: "中", high: "高" }

export type SimilarItem = { materialId: string; status: "scored" | "insufficient_evidence"; score: number | null; components: { kind: "structure" | "hook" | "selling_points" | "audience" | "rhythm" | "cta"; status: "compared" | "unavailable"; score: number | null; reasonCode: string }[]; missingComponents: string[] }
export const similarFixture = similar as unknown as Fixture<{ items: SimilarItem[] }>
export const componentLabel: Record<SimilarItem["components"][number]["kind"], string> = { structure: "结构", hook: "钩子", selling_points: "卖点", audience: "人群", rhythm: "节奏", cta: "CTA" }

export type LineageMethod = "script_rewrite" | "structure_adaptation" | "visual_remake" | "mixed"
export const methodLabel: Record<LineageMethod, string> = { script_rewrite: "脚本改写", structure_adaptation: "结构改编", visual_remake: "画面重制", mixed: "混合" }
export const lineageFixture = lineage as unknown as Fixture<{ root: { materialId: string; name: string }; children: { materialId: string; name: string; method: LineageMethod; createdAt: string; metrics: MaterialMetrics }[] }>

export type ChangeDimension = "hook" | "selling_point" | "audience" | "rhythm" | "cta"
export const dimensionLabel: Record<ChangeDimension, string> = { hook: "钩子", selling_point: "卖点", audience: "人群 / 场景", rhythm: "节奏", cta: "CTA" }
export type Brief = { briefId: string; briefVersion: string; productVersionId: string; sourceMaterialVersionId: string; sourceTeardownFingerprint: string; sourceProfileFingerprint: string; objective: string; globalConstraints: string[]; variants: { variantKey: string; changeDimension: ChangeDimension; hypothesis: string; instruction: string; keepDimensions: string[] }[]; experimentPolicyFingerprint: string; status: "draft" | "sent" | "delivered" | "closed"; designerRef: string | null; createdBy: { userId: string; name: string }; createdAt: string; fingerprint: string }
export const briefFixture = brief as unknown as Fixture<Brief>
export const briefStatusMeta: Record<Brief["status"], { label: string; tone: "pending" | "progress" | "success" | "muted" }> = { draft: { label: "草稿", tone: "pending" }, sent: { label: "已发设计", tone: "progress" }, delivered: { label: "已交付", tone: "success" }, closed: { label: "已关闭", tone: "muted" } }
export type Backtest = { briefId: string; status: "awaiting_delivery" | "awaiting_sample" | "ready"; missingVariantKeys: string[]; insufficientMaterialVersionIds: string[]; experiment: unknown | null }
export const backtestFixture = backtest as unknown as Fixture<Backtest>
export const backtestStatusLabel: Record<Backtest["status"], string> = { awaiting_delivery: "等交付", awaiting_sample: "等样本", ready: "可回测" }

export type ExperimentCell = { materialVersionId: string; accountCount: number; activeDayCount: number; exposure: MetricValue; click: MetricValue; realConversion: MetricValue; cost: MetricValue; ctr: RatioValue; inferenceRate: RatioValue; realCpa: RatioValue; inferenceRateInterval95: { lower: number; upper: number } | null; sampleStatus: "sufficient" | "insufficient"; exclusionReasons: string[] }
export type ExperimentConclusion = { status: "insufficient_sample" | "insufficient_candidates" | "effect_too_small" | "intervals_overlap" | "separated_observation"; directionalLeaderMaterialVersionId: string | null; observedLeaderMaterialVersionId: string | null; cpaImprovementRate: number | null }
export const experimentsFixture = experiments as unknown as Fixture<{ policy: { policyVersion: string; minActiveDays: number; minAccounts: number; minExposure: number; minClicks: number; minRealConversions: number; minCost: number; minCpaImprovementRate: number; conversionRateDenominator: string; confidenceLevel: number }; products: { productVersionId: string; cells: ExperimentCell[]; conclusion: ExperimentConclusion }[] }>
export const conclusionLabel: Record<ExperimentConclusion["status"], string> = { insufficient_sample: "样本不足，不出结论", insufficient_candidates: "候选不足，不出结论", effect_too_small: "效果差异太小", intervals_overlap: "置信区间重叠，不能分胜负", separated_observation: "观察到分离（非因果结论）" }
export const exclusionLabel: Record<string, string> = { insufficient_active_days: "在投天数不足", insufficient_accounts: "账户数不足", insufficient_exposure: "曝光不足", insufficient_clicks: "点击不足", insufficient_real_conversions: "真实转化不足", insufficient_cost: "消耗不足" }
export const fmtDuration = (ms: number | null) => (ms === null ? "−" : `${Math.round(ms / 1000)}s`)
