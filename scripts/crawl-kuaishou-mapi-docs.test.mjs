import test from "node:test";
import assert from "node:assert/strict";

import {
  flattenMenu,
  extractEndpointCandidates,
  redactCredentialText,
  sanitizeValue,
} from "./crawl-kuaishou-mapi-docs.mjs";

test("flattenMenu keeps edition, hierarchy and document mount", () => {
  const rows = flattenMenu([{
    menuId: 1,
    menuName: "投放管理",
    documentId: 0,
    children: [{menuId: 2, menuName: "创建计划", documentId: 88, documentName: "创建广告计划", documentType: "API"}],
  }], "current");
  assert.deepEqual(rows, [{
    edition: "current",
    document_id: 88,
    menu_id: 2,
    menu_path: ["投放管理", "创建计划"],
    menu_document_type: "API",
    menu_name: "创建计划",
    document_name: "创建广告计划",
    description: "",
  }]);
});

test("sanitizer preserves field names but removes credential examples", () => {
  const counts = {};
  const value = sanitizeValue({
    paramName: "access_token",
    example: "abcdef1234567890",
    description: "返回 access_token 字段",
    nested: {client_secret: "supersecretvalue"},
  }, counts);
  assert.equal(value.paramName, "access_token");
  assert.equal(value.example, "[REDACTED_SECRET_EXAMPLE]");
  assert.equal(value.description, "返回 access_token 字段");
  assert.equal(value.nested.client_secret, "[REDACTED_SECRET_EXAMPLE]");
  assert.equal(counts.sensitive_param_example, 1);
  assert.equal(counts.sensitive_key, 1);
});

test("text sanitizer removes bearer, named header and signed query values", () => {
  const counts = {};
  const text = redactCredentialText(
    "Authorization: Bearer abcdefghijklmnop Token: qwertyuiop123456 https://x.test/a?signature=abcdefghijklmnop&foo=1",
    counts,
  );
  assert.doesNotMatch(text, /abcdefghijklmnop/);
  assert.doesNotMatch(text, /qwertyuiop123456/);
  assert.match(text, /REDACTED_SECRET_EXAMPLE/);
  assert.ok(Object.values(counts).reduce((sum, value) => sum + value, 0) >= 2);
});

test("endpoint extraction prefers structured target and falls back to legacy content", () => {
  assert.deepEqual(extractEndpointCandidates({
    targetPath: "https://ad.e.kuaishou.com/rest/openapi/gw/dsp/campaign/create",
    content: "also see /rest/openapi/v2/campaign/create",
  }), [
    {endpoint: "/rest/openapi/gw/dsp/campaign/create", evidence: "targetPath"},
    {endpoint: "/rest/openapi/v2/campaign/create", evidence: "document_content"},
  ]);
  assert.deepEqual(extractEndpointCandidates({
    targetPath: "https://ad.e.kuaishou.com",
    content: "POST /rest/openapi/v1/advertiser/update/budget.",
  }), [{endpoint: "/rest/openapi/v1/advertiser/update/budget", evidence: "document_content"}]);
});
