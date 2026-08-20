import test from "node:test";
import assert from "node:assert/strict";

import {classifyCapability} from "./build-kuaishou-mapi-coverage.mjs";

test("campaign capability is a phase-one direct candidate", () => {
  const result = classifyCapability({
    menu_path: ["投放管理", "广告创编", "广告计划", "查询广告计划"],
    document_name: "查询广告计划",
    endpoint: "/rest/openapi/gw/dsp/campaign/list",
    http_method: "POST",
  });
  assert.equal(result.product_relevance, "direct_candidate");
  assert.equal(result.roadmap_phase, "phase1_candidate");
  assert.equal(result.recommended_action, "wrap_or_verify");
});

test("agency money transfer is explicitly rejected for current product", () => {
  const result = classifyCapability({
    menu_path: ["账户服务", "代理商", "广告主转账"],
    document_name: "广告主转账",
    endpoint: "/rest/openapi/example/transfer",
    http_method: "POST",
  });
  assert.equal(result.product_relevance, "not_relevant");
  assert.equal(result.recommended_action, "reject_for_current_product");
  assert.equal(result.risk_level, "critical");
});

test("deprecated intelligent hosting is not proposed for wrapping", () => {
  const result = classifyCapability({
    menu_path: ["工具", "智能托管（已下线）", "详情"],
    document_name: "智能托管详情",
    endpoint: "/rest/openapi/example/detail",
    http_method: "POST",
  });
  assert.equal(result.deprecated_signal, true);
  assert.equal(result.recommended_action, "do_not_wrap_deprecated");
  assert.equal(result.roadmap_phase, "reference_only");
});
