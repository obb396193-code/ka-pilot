import test from "node:test";
import assert from "node:assert/strict";

import {classifyAdoption, classifyTopics, summarizeRows} from "./build-multichannel-knowledge-summary.mjs";

test("topic classification is non-exclusive", () => {
  const topics = classifyTopics("广告组预算与转化报表");
  assert.ok(topics.includes("campaign_structure"));
  assert.ok(topics.includes("reporting_insights"));
  assert.ok(topics.includes("conversion_attribution"));
  assert.ok(topics.includes("bidding_budget"));
});

test("high-risk finance write is rejected while terminology is reference", () => {
  assert.equal(classifyAdoption({text: "服务商内部转账", media: "腾讯广告"}), "reject_current_product");
  assert.equal(classifyAdoption({text: "术语介绍", sourceKind: "guide", media: "腾讯广告"}), "cross_channel_reference");
  assert.equal(classifyAdoption({text: "某行业附录", media: "腾讯广告"}), "background_only");
  assert.equal(classifyAdoption({text: "创建千川计划", media: "巨量引擎", productLine: "巨量千川"}), "background_only");
});

test("summary keeps exclusive adoption total", () => {
  const summary = summarizeRows([
    {title: "创建广告计划", menu_path: ["广告管理"], endpoint: "/campaigns/add", source_kind: "api"},
    {title: "资金退款", menu_path: ["账号管理"], endpoint: "/fund/refund", source_kind: "api"},
  ], {documentId: "ka-src-0009", media: "腾讯广告"});
  assert.equal(summary.total_documents, 2);
  assert.equal(Object.values(summary.product_adoption_counts_exclusive).reduce((a, b) => a + b, 0), 2);
});
