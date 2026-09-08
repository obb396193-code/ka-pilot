#!/usr/bin/env node

import {createHash} from "node:crypto";
import {mkdir, readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

export function classifyCapability(row) {
  const menuPath = row.menu_path || [];
  const top = menuPath[0] || "";
  const second = menuPath[1] || "";
  const text = `${menuPath.join(" / ")} ${row.document_name || ""}`;
  const deprecated = /已下线|废弃|下线|旧版|不再维护/i.test(text);
  const whitelist = /白名单|提报|联系.*开通|申请开通|定向邀请/i.test(text);
  const financialMutation = /退款|退钱|转账|充值|共享钱包|支付|交易号/i.test(text)
    && /创建|修改|更新|申请|提单|转|充|退/i.test(text);
  const destructive = /删除|解绑|下线|关停|关闭/i.test(text);
  const credential = /token|授权流程|scope|授权账户/i.test(text);
  const likelyRead = /查询|获取|列表|报表|详情|状态信息|建议|预估|枚举/i.test(text);
  const likelyWrite = /创建|新建|修改|更新|上传|推送|打标|开启|关闭|授权|复制|回传|发起|复苏|添加/i.test(text)
    || (["POST", "PUT", "PATCH", "DELETE"].includes(String(row.http_method || "").toUpperCase()) && !likelyRead);

  let operation = "guide";
  if (financialMutation) operation = "financial_write";
  else if (destructive) operation = "delete_or_disable";
  else if (likelyWrite) operation = "write";
  else if (row.endpoint || likelyRead) operation = "read";

  let risk = "low";
  if (financialMutation) risk = "critical";
  else if (destructive || operation === "write") risk = "high";
  else if (credential || whitelist) risk = "medium";

  let relevance = "conditional_candidate";
  let phase = "later_candidate";
  let action = "investigate_then_wrap";
  let useScope = "后续按产品场景、权限和运行实证选择性封装";
  let modules = [];

  if (top === "投放管理" && ["广告创编", "账户层级"].includes(second)) {
    relevance = "direct_candidate";
    phase = "phase1_candidate";
    action = "wrap_or_verify";
    useScope = "账户结构同步、基建、变更集、执行回查";
    modules = ["Capability Registry", "账户资源", "基建管理", "变更集与确认门", "自动化与工作流"];
  } else if (top === "投放管理") {
    useScope = "搜索广告、高级创意和账户智投按实际业务启用情况后续接入";
    modules = ["基建管理", "策略中心", "Capability Registry"];
  } else if (top === "数据报表" && /广告主数据|广告计划数据|广告组数据|广告创意数据|程序化创意数据|素材报表/.test(second)) {
    relevance = "direct_candidate";
    phase = "phase1_candidate";
    action = "verify_data_gap_then_wrap";
    useScope = "保留启航主链路；只补结构、口径校验和启航缺失维度";
    modules = ["数据分析", "效果回收", "策略中心", "报告"];
  } else if (top === "数据报表") {
    useScope = "直播、搜索、商品、人群、代理商和异步报表按产品缺口后续接入";
    modules = ["数据分析", "效果回收", "策略中心"];
  } else if (top === "素材管理" && ["图片素材", "视频库", "文件上传"].includes(second)) {
    relevance = "direct_candidate";
    phase = "phase1_candidate";
    action = "wrap_or_verify";
    useScope = "素材上传、查询、审核、质量与跨账户共享";
    modules = ["商品素材", "基建管理", "Capability Registry"];
  } else if (top === "素材管理") {
    useScope = "分片上传和素材包属于规模化增强，后续按大文件与批量场景接入";
    modules = ["商品素材", "Capability Registry"];
  } else if (top === "账户服务" && second === "广告主" && !/线索优选/.test(text)) {
    relevance = "direct_candidate";
    phase = "phase1_candidate";
    action = operation === "write" ? "investigate_then_wrap" : "wrap_or_verify";
    useScope = "账户信息、余额、流水和权限健康；写开关需单独审批";
    modules = ["账户资源", "数据健康", "变更集与确认门"];
  } else if (top === "账户服务" && second === "广告主") {
    useScope = "线索优选媒体开关不是一期账户基础能力，需业务确认和写操作治理";
    modules = ["账户资源", "变更集与确认门"];
  } else if (top === "账户服务" && second === "代理商") {
    relevance = "background_only";
    phase = "reference_only";
    action = financialMutation ? "reject_for_current_product" : "reference_only";
    useScope = "当前平台不承担代理商开户、充值、转账和退款业务";
    modules = ["知识库"];
  } else if (top === "资金管理") {
    relevance = "background_only";
    phase = "reference_only";
    action = "reject_for_current_product";
    useScope = "共享钱包与资金写操作超出当前产品范围，仅保留官方能力证据";
    modules = ["知识库", "安全审查"];
  } else if (top === "原生广告") {
    useScope = "原生授权、原生素材和自然流量报表，按后续业务需要接入";
    modules = ["商品素材", "数据分析", "Capability Registry"];
  } else if (top === "工具") {
    useScope = "定向、预估、出价建议、搜索/直播/评论等工具按具体场景选择";
    modules = ["基建管理", "策略中心", "商品素材", "Capability Registry"];
  } else if (top === "资产") {
    useScope = "应用、商品库、媒体包等资产用于基建前置校验和资产选择";
    modules = ["账户资源", "基建管理", "商品素材"];
  } else if (top === "人群管理") {
    useScope = "DMP/联合建模属于后续人群能力，不进入一期默认范围";
    modules = ["基建管理", "策略中心", "Capability Registry"];
  } else if (top === "SPI订阅服务") {
    useScope = "研究是否可替代轮询做状态/审核事件回流；需验证事件、签名和稳定性";
    modules = ["自动化与工作流", "值守告警", "效果回收"];
  } else if (top === "后链路线索管理" && second === "磁力建站") {
    useScope = "仅落地页资产、表单和报表可能与承接页测试有关";
    modules = ["基建管理", "效果回收", "策略中心"];
  } else if (top === "后链路线索管理") {
    relevance = "not_relevant";
    phase = "reference_only";
    action = "reject_for_current_product";
    useScope = "CRM 外呼、企微成员和第三方支付不属于当前平台";
    modules = ["知识库"];
  } else if (top === "素造平台") {
    action = "reference_only";
    useScope = "已有内部 AIGC/素材平台方向优先；素造接口只作媒体侧能力参考";
    modules = ["商品素材", "知识库"];
  } else if (["快速入门", "频控和创建限制", "FAQ及附录"].includes(top)) {
    relevance = "background_only";
    phase = "reference_only";
    action = "reference_only";
    useScope = "作为鉴权、限流、错误码和实现约束证据，不直接形成业务功能";
    modules = ["Capability Registry", "知识库", "执行器"];
  }

  if (deprecated) {
    relevance = "background_only";
    phase = "reference_only";
    action = "do_not_wrap_deprecated";
    useScope = "官方目录已标下线/旧版，只用于迁移识别和历史兼容";
  }
  if (financialMutation) {
    relevance = "not_relevant";
    phase = "reference_only";
    action = "reject_for_current_product";
    useScope = "资金写操作不进入当前产品、Agent 或默认工作流";
  }

  return {
    product_relevance: relevance,
    roadmap_phase: phase,
    recommended_action: action,
    use_scope: useScope,
    related_product_modules: modules,
    operation,
    risk_level: risk,
    deprecated_signal: deprecated,
    whitelist_or_application_signal: whitelist,
  };
}

function parseConstants(text) {
  const rows = [];
  const pattern = /^([A-Z][A-Z0-9_]*)\s*=\s*["']([^"']+)["']/gm;
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== "BASE_URL") {
      rows.push({constant: match[1], relative_path: match[2], endpoint: `/rest/openapi/${match[2]}`});
    }
  }
  return rows;
}

async function listPythonFiles(root) {
  const rows = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".py")) rows.push(full);
    }
  }
  await walk(root);
  return rows;
}

async function auditCli(cliRoot) {
  const packageRoot = path.join(cliRoot, "kuaishou_cli");
  const constants = parseConstants(await readFile(path.join(packageRoot, "constants.py"), "utf8"));
  const files = await listPythonFiles(packageRoot);
  const sourceByFile = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])));
  for (const row of constants) {
    row.source_refs = [];
    for (const [file, source] of sourceByFile) {
      if (source.includes(`c.${row.constant}`) || source.includes(`from .constants import ${row.constant}`)) {
        row.source_refs.push(path.relative(cliRoot, file));
      }
    }
    row.cli_status = row.source_refs.length > 0 ? "command_path_reachable" : "declared_not_exposed";
    row.cli_http_method = row.source_refs.length > 0 ? "POST" : null;
  }
  const initText = await readFile(path.join(packageRoot, "__init__.py"), "utf8");
  const packageInfoText = await readFile(path.join(cliRoot, "kuaishou_cli.egg-info", "PKG-INFO"), "utf8");
  const readmeText = await readFile(path.join(cliRoot, "README.md"), "utf8");
  const mainText = await readFile(path.join(packageRoot, "__main__.py"), "utf8");
  return {
    version: initText.match(/__version__\s*=\s*["']([^"']+)["']/)?.[1] || null,
    declared_endpoint_count: constants.length,
    package_metadata_version: packageInfoText.match(/^Version:\s*(.+)$/m)?.[1]?.trim() || null,
    command_path_reachable_count: constants.filter((row) => row.cli_status === "command_path_reachable").length,
    declared_not_exposed_count: constants.filter((row) => row.cli_status === "declared_not_exposed").length,
    readme_claims_raw_command: /\braw\b/.test(readmeText),
    main_registers_raw_command: /\braw\.register\s*\(/.test(mainText),
    constants,
  };
}

function countBy(rows, field) {
  const result = {};
  for (const row of rows) result[row[field]] = (result[row[field]] || 0) + 1;
  return result;
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function build({inventoryPath, cliRoot, outputJsonl, outputSummary, cliArchive}) {
  const inventory = (await readFile(inventoryPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const current = inventory.filter((row) => row.edition === "current");
  const cli = await auditCli(cliRoot);
  const cliByEndpoint = new Map(cli.constants.map((row) => [row.endpoint, row]));
  const rows = current.map((row) => {
    const cliMatch = cliByEndpoint.get(row.endpoint) || null;
    return {
      capability_id: `ks-mapi-current-${row.document_id}`,
      source_document_id: "ka-src-0007",
      official_document_id: row.document_id,
      menu_id: row.menu_id,
      title: row.document_name,
      menu_path: row.menu_path,
      official_document_type: row.menu_document_type,
      official_version: row.version,
      official_updated_at: row.updated_at,
      official_url: row.official_url,
      endpoint: row.endpoint,
      endpoint_evidence: row.endpoint_evidence,
      endpoint_candidates: row.endpoint_candidates || [],
      http_method: row.http_method,
      http_content_type: row.http_content_type,
      official_state: "documented",
      required_scope: null,
      scope_mapping_state: "requires_mapping",
      authorization_state: "unknown",
      runtime_verification_state: "unknown",
      adoption_state: "unreviewed_candidate",
      cli_status: cliMatch?.cli_status || (row.endpoint ? "not_wrapped" : "not_applicable"),
      cli_http_method: cliMatch?.cli_http_method || null,
      http_method_alignment: cliMatch?.cli_http_method
        ? (String(row.http_method || "").toUpperCase() === cliMatch.cli_http_method ? "aligned" : "conflict")
        : "not_applicable",
      cli_constant: cliMatch?.constant || null,
      cli_source_refs: cliMatch?.source_refs || [],
      ...classifyCapability(row),
      classification_review_status: "machine_initial_screening_unreviewed",
      evidence_boundary: "公开文档存在不等于账户已授权、CLI 已封装或运行时已验证；采用前需只读探针/测试账户验收。",
    };
  });
  await mkdir(path.dirname(outputJsonl), {recursive: true});
  await writeFile(outputJsonl, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const summary = {
    generated_at: new Date().toISOString(),
    source_document_id: "ka-src-0007",
    current_document_count: rows.length,
    current_endpoint_count: rows.filter((row) => row.endpoint).length,
    current_unique_endpoint_count: new Set(rows.map((row) => row.endpoint).filter(Boolean)).size,
    cli_asset: {
      source_root: "private_ref:kuaishou-cli-local-extracted-asset",
      archive_sha256: cliArchive ? await sha256(cliArchive) : null,
      filename_label: cliArchive ? path.basename(cliArchive) : null,
      code_version: cli.version,
      package_metadata_version: cli.package_metadata_version,
      declared_endpoint_count: cli.declared_endpoint_count,
      command_path_reachable_count: cli.command_path_reachable_count,
      official_http_method_aligned_count: rows.filter((row) => row.cli_status === "command_path_reachable" && row.http_method_alignment === "aligned").length,
      official_http_method_conflict_count: rows.filter((row) => row.cli_status === "command_path_reachable" && row.http_method_alignment === "conflict").length,
      declared_not_exposed_count: cli.declared_not_exposed_count,
      readme_claims_raw_command: cli.readme_claims_raw_command,
      main_registers_raw_command: cli.main_registers_raw_command,
      version_label_conflict: Boolean(cliArchive && cli.version && (!path.basename(cliArchive).includes(cli.version) || cli.package_metadata_version !== cli.version)),
    },
    cli_coverage: countBy(rows, "cli_status"),
    cli_http_method_alignment: countBy(rows.filter((row) => row.cli_status === "command_path_reachable"), "http_method_alignment"),
    product_relevance: countBy(rows, "product_relevance"),
    roadmap_phase: countBy(rows, "roadmap_phase"),
    recommended_action: countBy(rows, "recommended_action"),
    operation: countBy(rows, "operation"),
    risk_level: countBy(rows, "risk_level"),
    deprecated_signal_count: rows.filter((row) => row.deprecated_signal).length,
    whitelist_or_application_signal_count: rows.filter((row) => row.whitelist_or_application_signal).length,
    known_classifier_limitations: ["祖先目录关键词可导致上传接口被误标删除", "授权查询类标题可被误标写操作", "phase1_candidate 包含仍需业务 owner 裁剪的边缘能力"],
    boundary: "机器分类仅用于发现和初筛，operation/risk/59-249-73 均未逐接口人工审查，不等于产品路线图或能力批准；资金写、CRM、支付、已下线能力默认不纳入当前产品。",
  };
  await writeFile(outputSummary, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    result[key.slice(2).replaceAll("-", "_")] = argv[++index];
  }
  for (const key of ["inventory_path", "cli_root", "output_jsonl", "output_summary"]) {
    if (!result[key]) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  }
  return {
    inventoryPath: result.inventory_path,
    cliRoot: result.cli_root,
    outputJsonl: result.output_jsonl,
    outputSummary: result.output_summary,
    cliArchive: result.cli_archive || null,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await build(parseArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  }
}
