#!/usr/bin/env node

import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const TOPICS = [
  ["authorization_account", /OAuth|Token|token|授权|账户|帐号|广告主/],
  ["campaign_structure", /项目|计划|单元|广告组|广告创意|广告管理/],
  ["reporting_insights", /报表|数据洞察|消耗|效果数据|投放数据/],
  ["creative_material", /素材|视频|图片|图文|创意工具/],
  ["audience_targeting", /人群|定向|DMP/],
  ["conversion_attribution", /转化|归因|上报|线索/],
  ["bidding_budget", /出价|预算|成本|ROI|竞价|oCP[A-Z]?/i],
  ["automation_experiment", /实验|A\/B|AB测试|智能投放|调控|自动|托管|诊断|管家/],
  ["landing_asset_product", /落地页|建站|商品|产品库|营销资产/],
  ["finance_agency", /资金|转账|退款|充值|钱包|代理商/],
  ["policy_limits", /频控|限制|审核|资质|错误码|返回码|版本|下线/],
];

export function classifyTopics(text) {
  const topics = TOPICS.filter(([, pattern]) => pattern.test(String(text))).map(([name]) => name);
  return topics.length ? topics : ["other"];
}

export function classifyAdoption({text, sourceKind = "api", media, topics = classifyTopics(text), productLine = ""}) {
  const value = String(text);
  if (/转账|退款|充值|共享钱包|支付|资金合并/.test(value)) return "reject_current_product";
  if (/已下线|停止维护|废弃/.test(value)) return "deprecated_reference";
  if (media === "巨量引擎" && /^(?:巨量千川|巨量本地推|巨量星图|mui|企业号|轻代码|群峰服务市场)/.test(productLine)) {
    return "background_only";
  }
  if (sourceKind === "guide" || /入门|术语|频控|限制|SDK|常见问题|返回码|错误码/.test(value)) {
    return "cross_channel_reference";
  }
  if (topics.length === 1 && topics[0] === "other") return "background_only";
  if (media === "巨量引擎" || media === "腾讯广告") return "later_channel_candidate";
  return "conditional_candidate";
}

export function summarizeRows(rows, {documentId, media}) {
  const topicCounts = {};
  const adoptionCounts = {};
  let endpointCount = 0;
  for (const row of rows) {
    const menu = row.menu_path || row.mounts?.[0]?.label_path || [];
    const text = [...menu, row.title || ""].join(" > ");
    const topics = classifyTopics(text);
    for (const topic of topics) topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    const adoption = classifyAdoption({
      text,
      sourceKind: row.source_kind,
      media,
      topics,
      productLine: menu[0] || "",
    });
    adoptionCounts[adoption] = (adoptionCounts[adoption] || 0) + 1;
    if (row.endpoint) endpointCount += 1;
  }
  return {
    document_id: documentId,
    media,
    total_documents: rows.length,
    endpoint_documents: endpointCount,
    topic_counts_non_exclusive: topicCounts,
    product_adoption_counts_exclusive: adoptionCounts,
    product_boundary: `${media} 不属于一期渠道；接口文档现阶段用于跨渠道对象模型、Capability Registry 和后续 adapter 设计，不因官方公开就进入一期开发。`,
    classification_note: "主题计数可重叠；产品处置数互斥。分类是待审查机器初筛，不是已批准的能力清单。",
  };
}

function parseJsonl(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function main(repoRoot) {
  const configs = [
    {documentId: "ka-src-0008", media: "巨量引擎"},
    {documentId: "ka-src-0009", media: "腾讯广告"},
  ];
  const outDir = path.join(repoRoot, "docs/knowledge/datasets");
  await mkdir(outDir, {recursive: true});
  for (const config of configs) {
    const inventory = path.join(repoRoot, "private/knowledge-sources", config.documentId, "extracted/inventory/documents.jsonl");
    const rows = parseJsonl(await readFile(inventory, "utf8"));
    const summary = summarizeRows(rows, config);
    await writeFile(path.join(outDir, `${config.documentId}-product-relevance-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main(path.resolve(process.argv[2] || process.cwd()));
}
