import test from "node:test";
import assert from "node:assert/strict";

import {
  extractTencentEndpoint,
  extractTencentOfficialLinks,
  classifyTencentOfficialLink,
  extractOceanEndpointCandidates,
  flattenOceanDocuments,
  flattenOceanLabels,
  mergeOceanLabels,
  parseTencentLlmsIndex,
} from "./crawl-multichannel-official-docs.mjs";

test("flattenOceanLabels keeps direct and inherited hidden state", () => {
  assert.deepEqual(flattenOceanLabels([{name: "巨量营销", hidden: true, children: [{
    id: 7,
    name: "全部接口",
    full_name: "巨量营销-全部接口",
    identify_key: "abc",
    hidden: false,
    children: [],
  }]}]), [{
    label_id: 7,
    identify_key: "abc",
    label_path: ["巨量营销", "全部接口"],
    hidden_direct: false,
    hidden_effective: true,
    is_leaf: true,
    source_tree_type: "BUSINESS",
    description: "",
    full_name: "巨量营销-全部接口",
  }]);
});

test("mergeOceanLabels de-duplicates labels repeated across public trees", () => {
  const label = {label_id: 7, identify_key: "abc", label_path: ["全部接口"], hidden_direct: false, hidden_effective: false, is_leaf: true};
  const merged = mergeOceanLabels([
    {...label, source_tree_type: "BUSINESS"},
    {...label, source_tree_type: "LASTEST_UPDATES"},
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].source_tree_types, ["BUSINESS", "LASTEST_UPDATES"]);
});

test("flattenOceanDocuments records every mounted node and parent path", () => {
  const label = {label_id: 7, identify_key: "abc", label_path: ["巨量营销", "全部接口"], hidden_direct: false, hidden_effective: false};
  const rows = flattenOceanDocuments([{doc_id: "1", title: "投放", child_docs: [{doc_id: "2", title: "创建项目", child_docs: []}]}], label);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].doc_path, ["投放", "创建项目"]);
  assert.equal(rows[1].label_id, 7);
});

test("extractOceanEndpointCandidates distinguishes structured and embedded scope paths", () => {
  assert.deepEqual(extractOceanEndpointCandidates({
    path: "/open_api/v3.0/project/create/",
    content: "<p>/tools/ab_test/create/</p><p>/tools/ab_test/update/</p>",
  }), [
    {endpoint: "/open_api/v3.0/project/create/", evidence: "structured_path"},
    {endpoint: "/tools/ab_test/create/", evidence: "document_content_table"},
    {endpoint: "/tools/ab_test/update/", evidence: "document_content_table"},
  ]);
});

test("parseTencentLlmsIndex preserves section, hierarchy and stable source id", () => {
  const rows = parseTencentLlmsIndex(`# 腾讯广告\n\n## Docs\n- 入门与指南 [快速入门](https://s.apifox.cn/apidoc/docs-site/3515798/doc-3176241.md):\n\n## API Docs\n- 广告投放 > 推广计划 [创建推广计划](https://s.apifox.cn/apidoc/docs-site/3515798/api-121.md): 使用说明`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source_kind, "guide");
  assert.equal(rows[1].source_kind, "api");
  assert.deepEqual(rows[1].menu_path, ["广告投放", "推广计划"]);
  assert.equal(rows[1].source_id, "api-121");
});

test("extractTencentEndpoint accepts official production URL and conservative path labels", () => {
  assert.equal(extractTencentEndpoint("openapi: 3.0.1\npaths:\n  /campaigns/add:\n    post:"), "/campaigns/add");
  assert.equal(extractTencentEndpoint("请求地址 https://api.e.qq.com/v1.3/campaigns/add。"), "/v1.3/campaigns/add");
  assert.equal(extractTencentEndpoint("请求路径：adgroups/get"), "/adgroups/get");
  assert.equal(extractTencentEndpoint("这里没有接口路径"), null);
});

test("Tencent official links are de-duplicated without fragment and classified", () => {
  const links = extractTencentOfficialLinks("[x](https://developers.e.qq.com/docs/reference/enum#a) https://developers.e.qq.com/docs/reference/enum#b");
  assert.deepEqual(links, ["https://developers.e.qq.com/docs/reference/enum"]);
  assert.equal(classifyTencentOfficialLink(links[0]), "reference");
});
