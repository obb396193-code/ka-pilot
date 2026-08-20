#!/usr/bin/env python3
"""Build a private, document-level guide for a sanitized knowledge bundle.

The generated guide is intentionally extractive and remains in the ignored
private source area. It does not promote child files to reviewed documents.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


GROUP_LABELS = {
    "145201": "用户增长与投放摘要",
    "ad-whitepaper": "国际广告白皮书",
    "aistudio": "AIStudio 与模型接入",
    "evo": "EVO 实验平台",
    "o2": "O2/Aone 研发与部署",
    "panama": "Panama/FBI 数据与业务",
    "project-mgmt": "项目管理",
}

TOPIC_RULES = [
    ("实验设计", ("实验", "a/b", "ab test", "分流", "显著性", "样本量")),
    ("广告投放", ("广告", "投放", "campaign", "ocpx", "rta", "dpa", "素材")),
    ("数据分析", ("fbi", "bi", "报表", "指标", "数据", "归因", "看板")),
    ("大模型与 Agent", ("大模型", "模型", "llm", "agent", "prompt", "aistudio", "百炼")),
    ("研发与部署", ("o2", "aone", "next.js", "nextjs", "faas", "部署", "发布", "构建")),
    ("安全与权限", ("权限", "安全", "buc", "鉴权", "登录", "secret", "ak", "密钥")),
    ("项目管理", ("项目", "需求", "风险", "进度", "沟通", "pmo")),
    ("资金与结算", ("结算", "账户", "资金", "充值", "计费", "财务", "卡券")),
    ("前端体验", ("前端", "组件", "react", "rax", "页面", "交互", "样式")),
]

PRODUCT_MODULE_LABELS = {
    "data_analysis": "数据分析与口径",
    "experiment": "实验与效果回收",
    "agent": "Agent 体系",
    "knowledge_base": "知识库",
    "automation": "自动化与工作流",
    "platform": "平台与部署",
    "security": "权限与凭证",
    "reporting": "报告与结算",
    "ad_build": "基建与投放执行",
    "creative": "商品与素材",
    "monitoring": "监控诊断与值守",
    "project_delivery": "项目交付方法",
}

AI_PRODUCT_TERMS = (
    "llm api", "agent", "知识库", "工作流", "提示词", "prompt",
    "模型设置", "模型评测", "调试对比", "工具使用", "function calling", "mcp",
    "上下文", "向量", "embedding", "流程编排", "搭建及管理流程", "工具箱",
    "创建工具", "评测", "rag", "sdk", "ideas api", "会话日志", "页面嵌入",
    "私有模型", "绑定百炼ak", "账单接口",
)
AI_PROVIDER_TERMS = ("ak申请", "预算", "计费", "配额", "额度", "限流", "模型faq", "模型的faq")
O2_STACK_TERMS = (
    "faas", "next.js", "nextjs", "buc", "runtime", "运行时", "环境变量",
    "部署", "域名", "定时函数", "cron", "webhook", "serverless", "函数日志",
    "调用日志", "监控", "告警", "故障", "数据库", "postgres", "鉴权",
)
AD_REFERENCE_TERMS = ("结算", "账户", "资金", "计费", "监控", "稳定", "容灾", "广告", "竞价")
TEST_OR_NOISE_TERMS = (
    "测试文档", "mcp测试", "上传测试", "!!!雀儿", "雀儿测试", "demo test",
    "/test", "／test", "发布验证", "cloud_services", "project_summary",
)

SECRET_PATTERNS = [
    re.compile(r"(?i)\bAKID[A-Z0-9]{8,}\b"),
    re.compile(r"(?i)\b(?:access[_-]?key|secret[_-]?key|api[_-]?key|token|password)\s*[:=]\s*[^\s<>{}\[\],;]+"),
    re.compile(r"(?i)(?:Signature|AccessKeyId)=[^&\s)]+"),
    re.compile(r"(?i)Bearer\s+[A-Za-z0-9._~+/=-]{12,}"),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def child_id(document_id: str, relative_path: str) -> str:
    digest = hashlib.sha256(f"{document_id}:{relative_path}".encode()).hexdigest()[:16]
    return f"{document_id}-child-{digest}"


def strip_markup(text: str) -> str:
    text = text.replace("\x00", "").replace("\r", "\n")
    text = html.unescape(text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<https?://[^>]+>", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"[*_~]+", "", text)
    text = re.sub(r"^[ \t]*#{1,6}[ \t]*", "", text, flags=re.M)
    text = re.sub(r"^[ \t]*(?:[-+•]|\d+[.)、])[ \t]+", "", text, flags=re.M)
    text = text.replace("|", "；")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def get_headings(raw_text: str) -> list[str]:
    headings: list[str] = []
    for line in raw_text.replace("\x00", "").splitlines():
        match = re.match(r"^\s*#{1,6}\s+(.+?)\s*$", line)
        if not match:
            continue
        value = strip_markup(match.group(1)).strip(" ：:;；")
        if 2 <= len(value) <= 80 and value not in headings:
            headings.append(value)
    return headings[:8]


def useful_sentences(clean_text: str, title: str) -> list[str]:
    candidates = re.split(r"(?<=[。！？!?；;])\s*|\n+", clean_text)
    result: list[str] = []
    normalized_title = re.sub(r"\s+", "", title).lower()
    for sentence in candidates[:160]:
        sentence = re.sub(r"\s+", " ", sentence).strip(" ：:;；—->\t")
        sentence = re.sub(r"^目录\s*", "", sentence)
        if not 12 <= len(sentence) <= 220:
            continue
        compact = re.sub(r"\s+", "", sentence).lower()
        if compact == normalized_title or re.fullmatch(r"[-—=；;\s]+", sentence):
            continue
        if re.match(r"^(本文档|本页面)?(目录|页内导航|相关链接|参考资料|附件|更新时间|创建时间)", sentence):
            continue
        if re.match(r"(?i)^ideaLAB文档中心已全部迁移", sentence):
            continue
        if sentence.count("；") >= 8:
            sentence = "；".join(sentence.split("；")[:5]).rstrip("；") + "等。"
        if any(pattern.search(sentence) for pattern in SECRET_PATTERNS):
            sentence = "[检测到凭证形态，未写入导读]"
        if sentence not in result:
            result.append(sentence)
        if len(result) == 3:
            break
    return result


def summarize(title: str, clean_text: str, headings: list[str], quality: str) -> str:
    if quality == "empty":
        return "空文件，没有可供介绍的正文；仅能从文件名判断其原拟主题。"
    sentences = useful_sentences(clean_text, title)
    if quality == "stub" and not sentences:
        excerpt = clean_text[:120].strip()
        if excerpt:
            return f"仅含很短的占位或提示文字：{excerpt}"
        return "仅含标题或占位符，没有足够正文支持内容判断。"
    if sentences:
        summary = " ".join(sentences[:2])
    else:
        summary = clean_text[:260].strip()
    summary = summary[:420].rstrip("，,；;：: ")
    if summary and summary[-1] not in "。！？!?]）)":
        summary += "。"
    if headings:
        coverage = "、".join(headings[:5])
        return f"围绕“{title}”展开，正文主要说明：{summary} 章节线索包括：{coverage}。"
    return f"围绕“{title}”展开，正文主要说明：{summary}"


def classify_quality(byte_count: int, clean_text: str) -> str:
    chars = len(clean_text.strip())
    if byte_count == 0 or chars == 0:
        return "empty"
    if byte_count < 100 or chars < 40:
        return "stub"
    if chars < 300:
        return "short"
    return "substantive"


def classify_topics(title: str, clean_text: str, group: str) -> list[str]:
    sample = f"{title}\n{clean_text[:5000]}".lower()
    topics = [label for label, needles in TOPIC_RULES if any(needle in sample for needle in needles)]
    if not topics:
        topics.append(GROUP_LABELS.get(group, "资料导航"))
    return topics[:5]


def source_group(relative_path: str) -> tuple[str, str]:
    parts = Path(relative_path).parts
    if relative_path == "INDEX.md":
        return "INDEX", "资料包导读"
    group = parts[1] if len(parts) > 1 and parts[0] == "raw" else parts[0]
    return group, GROUP_LABELS.get(group, group)


def contains_any(value: str, terms: tuple[str, ...]) -> bool:
    lowered = value.lower()
    return any(term in lowered for term in terms)


def relevance_assessment(
    relative_path: str,
    title: str,
    group: str,
    quality: str,
    anomalies: list[str],
    clean_text: str,
) -> dict:
    """Assess usefulness to the frozen KA product, independent of source prestige."""
    title_path = f"{relative_path}\n{title}".lower()
    haystack = f"{title_path}\n{clean_text[:5000]}".lower()
    modules: list[str] = []

    def result(level: str, action: str, scope: str, phase: str, reason: str, takeaway: str, boundary: str) -> dict:
        priority = "none"
        if level == "direct_candidate":
            priority = "P1" if (
                "搜索索引" in title or title.startswith(("1.", "2.", "7."))
            ) else "P2"
        elif level == "conditional_candidate":
            priority = "P2" if (
                "fbi" in title.lower()
                or contains_any(title_path, ("知识库", "llm api", "faas产品介绍", "运行时", "next.js", "sse"))
            ) else "P3"
        return {
            "product_relevance": level,
            "recommended_action": action,
            "use_scope": scope,
            "roadmap_phase": phase,
            "related_product_modules": [PRODUCT_MODULE_LABELS[key] for key in modules],
            "relevance_reason": reason,
            "product_takeaway": takeaway,
            "adoption_boundary": boundary,
            "relevance_priority": priority,
            "relevance_assessment_state": "research_agent_assessed_arch_unreviewed",
        }

    likely_relevant_name = contains_any(
        haystack,
        ("实验", "投放", "广告", "归因", "fbi", "faas", "agent", "llm", "知识库", "工作流", "监控", "结算"),
    )
    if quality == "empty":
        return result(
            "cannot_assess", "restore_source_then_assess" if likely_relevant_name else "exclude_from_product",
            "none", "none", "文件没有可用正文，不能因为标题像相关主题就推断有价值。",
            "当前没有可提取的产品依据。", "补回原文并重新评估前，不进入产品设计、Agent 默认召回或知识库发布。",
        )
    if quality == "stub":
        return result(
            "cannot_assess", "restore_source_then_assess" if likely_relevant_name else "exclude_from_product",
            "research_reference" if likely_relevant_name else "none", "research_only" if likely_relevant_name else "none",
            "正文只有占位、链接或极短片段，证据不足。", "最多作为回源线索。",
            "不能从文件名或一个链接直接推导产品能力；补到完整原文后再决定。",
        )
    if contains_any(title_path, TEST_OR_NOISE_TERMS):
        return result(
            "not_relevant", "exclude_from_product", "none", "none",
            "内容主要用于上传、发布或接口测试，不承载 KA 投放产品知识。",
            "没有产品借鉴价值。", "保留来源追溯即可，不进入产品知识、PRD 或 Agent 召回。",
        )

    if group == "evo":
        modules.extend(["experiment", "automation", "knowledge_base"])
        if "历史文档" in relative_path or "historical_or_deprecated_path" in anomalies:
            return result(
                "background_only", "reference_only", "research_reference", "research_only",
                "属于实验平台历史 SDK/旧接入资料，与当前快手投放对象和技术栈没有直接适配证据。",
                "可了解实验接入曾如何组织。", "不复制历史 SDK、接口或版本结论；只作演进背景。",
            )
        if any(term in title for term in ("收费", "SLA", "更新日志", "封网")):
            return result(
                "background_only", "reference_only", "research_reference", "research_only",
                "描述 EVO 平台运营、收费或保障规则，不是 KA 投放产品功能依据。",
                "可参考平台治理和重保意识。", "不把别的平台 SLA、收费或封网规则移植到我们的产品。",
            )
        return result(
            "direct_candidate", "selective_extract", "product_design", "later",
            "直接涉及 A/B 实验生命周期、分流、指标、联调、发布、分析和决策，与测品显著性和 Experiment Copilot 候选相邻。",
            "可提取实验对象、阶段状态、发布前检查、不可判定、推全/下线和报告沉淀模式。",
            "只借实验治理模式；EVO 不是快手投放实验能力证明，也不能据此引入中途任意自动调流。",
        )

    if group == "145201":
        if "搜索索引" in title:
            modules.extend(["ad_build", "data_analysis", "creative", "experiment"])
            return result(
                "direct_candidate", "verify_before_use", "product_design", "later",
                "索引覆盖广告投放平台、RTA/OCPX/DPA、选品、追踪归因和可视化，主题与 KA 投放直接相关，但多数只有摘要。",
                "适合形成待补全文清单，校对投放对象、归因与程序化基建方向。",
                "摘要只作发现入口；找到全文、确认作者版本和当前有效性前，不写入 PRD 或正式知识。",
            )
        return result(
            "not_relevant", "exclude_from_product", "none", "none",
            "内容聚焦消费者权益插卡/素材字段，不是当前 KA 信息流投放经营平台的问题域。",
            "没有直接产品借鉴价值。", "不因为同属‘素材’字段就映射到快手素材管理。",
        )

    if group == "panama":
        if "fbi" in haystack and ("开放接入" in haystack or "数据迁移" in haystack or "数据处理" in haystack):
            modules.extend(["data_analysis", "reporting", "security"])
            return result(
                "conditional_candidate", "verify_before_use", "engineering_reference", "later",
                "涉及 FBI 报表接入、账号权限、下载控制或数据处理，与数据分析/报告候选相关，但当前一期主通路已锁定奇航 get_data。",
                "可提取报表嵌入的权限、下载、安全参数和 adapter 检查项。",
                "不得把 FBI 改成一期主数据链；必须验证当前接口、权限、前端技术栈和数据口径。",
            )
        return result(
            "not_relevant", "exclude_from_product", "none", "none",
            "内容属于跨境分销业务、交易履约、商品或服务治理，不解决 KA 信息流投放经营问题。",
            "对当前产品没有直接价值。", "不把其他业务域的对象和流程类比成投放任务。",
        )

    if group == "aistudio":
        if contains_any(title_path, AI_PRODUCT_TERMS):
            modules.extend(["agent", "knowledge_base", "automation", "platform"])
            return result(
                "conditional_candidate", "verify_before_use", "engineering_reference", "later",
                "内容与产品内 Agent、知识库、工具/工作流、模型调用或评测相邻，但属于 AIStudio 平台说明，版本和接口可能漂移。",
                "可用于核对 Provider、工具调用、知识库上下文、调试/评测和工作流接入清单。",
                "只借接口与治理模式；不得直接复制模型清单、SDK、限额、费用或宣称当前可用。",
            )
        if contains_any(title_path, AI_PROVIDER_TERMS):
            modules.extend(["agent", "platform", "security"])
            return result(
                "conditional_candidate", "verify_before_use", "engineering_reference", "later",
                "涉及模型 Provider 的凭证、预算、额度或配额治理，对 Agent 运行有间接价值，但时效性很强。",
                "可形成 Provider 账户、配额、费用和 secret_ref 的核验清单。",
                "必须回到当前 AIStudio/IdeaLab 官方页面实证；不把历史财年、价格或 AK 操作写成产品规则。",
            )
        return result(
            "background_only", "reference_only", "research_reference", "research_only",
            "属于通用 AIStudio 使用说明，未直接对应 KA 投放业务或当前明确缺口。",
            "只在遇到具体 AIStudio 问题时定向查阅。", "不进入产品功能清单或默认 Agent 知识。",
        )

    if group == "o2":
        if contains_any(title, O2_STACK_TERMS):
            modules.extend(["platform", "security"])
            return result(
                "conditional_candidate", "verify_before_use", "engineering_reference", "phase1",
                "与当前 Next.js/FaaS、部署、身份、域名、日志或任务运行环境相邻，可能帮助工程落地，但不是业务产品功能。",
                "可在出现具体部署/运行问题时提取平台约束、排障步骤和接入检查项。",
                "仅作为按需工程参考；必须核当前 O2/Aone 版本，不得反向改变已冻结产品需求或把平台能力当已接通。",
            )
        return result(
            "background_only", "reference_only", "research_reference", "research_only",
            "属于 O2/Aone 通用研发平台知识，与 KA 投放业务没有直接映射。",
            "只在具体工程问题出现时作为搜索入口。", "不纳入产品 PRD、功能路线图或产品知识库默认召回。",
        )

    if group == "project-mgmt":
        modules.append("project_delivery")
        return result(
            "background_only", "reference_only", "research_reference", "research_only",
            "内容是通用项目管理、需求拆解、进度、风险、沟通和交付方法，不是 KA 投放产品需求证据。",
            "可改善团队实施、评审和复盘方法。", "只用于项目工作方法，不因方法论内容修改产品功能或业务口径。",
        )

    if group == "ad-whitepaper":
        if contains_any(haystack, AD_REFERENCE_TERMS):
            modules.extend(["reporting", "monitoring", "platform"])
            return result(
                "background_only", "reference_only", "research_reference", "research_only",
                "属于历史国际广告平台、结算或稳定性材料，业务主体、系统和时间背景与当前 KA 快手投放不同。",
                "可用于理解广告账户、结算、监控和稳定性的一般问题形态。",
                "不复制历史架构、结算逻辑、阈值或接口；不能作为当前媒体能力与口径证据。",
            )
        return result(
            "not_relevant", "exclude_from_product", "none", "none",
            "内容与当前 KA 快手信息流投放经营平台没有明确问题或对象映射。",
            "没有可确认的产品借鉴价值。", "保留来源追溯即可，不进入 PRD、路线图或默认知识。",
        )

    return result(
        "background_only", "reference_only", "research_reference", "research_only",
        "资料包导航只帮助发现文件，不是产品需求或能力证据。",
        "可用于定位原文。", "不把打包者推荐语当成我们的产品判断。",
    )


def read_as_text(path: Path) -> tuple[str, list[str]]:
    data = path.read_bytes()
    anomalies: list[str] = []
    if b"\x00" in data:
        anomalies.append("contains_nul")
    if path.suffix.lower() == ".pdf" and not data.startswith(b"%PDF-"):
        anomalies.append("pdf_extension_but_plain_text")
    text = data.decode("utf-8", errors="replace")
    if "\ufffd" in text:
        anomalies.append("decode_replacement")
    return text, anomalies


def write_outputs(document_id: str, source_root: Path, manifest_path: Path, output_dir: Path) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest["entries"]
    hash_paths: dict[str, list[str]] = defaultdict(list)
    for entry in entries:
        hash_paths[entry["sha256"]].append(entry["path"])

    records = []
    for entry in entries:
        relative_path = entry["path"]
        path = source_root / relative_path
        raw_text, anomalies = read_as_text(path)
        clean_text = strip_markup(raw_text)
        title = path.stem if path.suffix.lower() in {".md", ".pdf"} else path.name
        headings = get_headings(raw_text)
        quality = classify_quality(entry["bytes"], clean_text)
        group, group_label = source_group(relative_path)
        cid = child_id(document_id, relative_path)
        duplicates = sorted(hash_paths[entry["sha256"]])
        duplicate_of = None
        if len(duplicates) > 1:
            anomalies.append("duplicate_content_group_member")
            if relative_path != duplicates[0]:
                duplicate_of = child_id(document_id, duplicates[0])
                anomalies.append("exact_duplicate")
        if entry.get("changed_by_credential_sanitizer"):
            anomalies.append("credential_sanitized")
        if any(token in relative_path.lower() for token in ("历史文档", "废弃", "旧版", "deprecated")):
            anomalies.append("historical_or_deprecated_path")
        introduction = summarize(title, clean_text, headings, quality)
        if path.suffix.lower() == ".json":
            try:
                parsed_json = json.loads(raw_text)
                if isinstance(parsed_json, list):
                    introduction = (
                        f"这是“{title}”的结构化索引，共收录 {len(parsed_json)} 条记录；"
                        "每条主要保存标题、页面标识、相关度、摘要和来源链接，用于发现原文，不能替代原文审查。"
                    )
            except json.JSONDecodeError:
                anomalies.append("invalid_json")
        relevance = relevance_assessment(relative_path, title, group, quality, anomalies, clean_text)
        record = {
            "child_asset_id": cid,
            "parent_document_id": document_id,
            "title": title,
            "relative_path": relative_path,
            "source_group": group,
            "source_group_label": group_label,
            "content_format": (
                "json" if path.suffix.lower() == ".json" else
                "markdown" if path.suffix.lower() == ".md" else
                "plain_text_mislabeled_pdf" if path.suffix.lower() == ".pdf" else
                "extensionless_text_export"
            ),
            "bytes": entry["bytes"],
            "sha256": entry["sha256"],
            "quality": quality,
            "topics": classify_topics(title, clean_text, group),
            "section_clues": headings,
            "introduction": introduction,
            "anomalies": sorted(set(anomalies)),
            "duplicate_group_size": len(duplicates),
            "duplicate_of_child_asset_id": duplicate_of,
            "analysis_state": "extractive_unreviewed",
            "review_state": "unreviewed_child",
            "publish_state": "not_ready",
            "visibility": "confidential",
            "storage_ref": f"private/knowledge-sources/{document_id}/extracted/{relative_path}",
            **relevance,
        }
        records.append(record)

    output_dir.mkdir(parents=True, exist_ok=True)
    inventory = output_dir / "document-inventory.jsonl"
    inventory.write_text("".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records), encoding="utf-8")

    quality_counts = Counter(record["quality"] for record in records)
    group_counts = Counter(record["source_group_label"] for record in records)
    anomaly_counts = Counter(anomaly for record in records for anomaly in record["anomalies"])
    topic_counts = Counter(topic for record in records for topic in record["topics"])
    relevance_counts = Counter(record["product_relevance"] for record in records)
    action_counts = Counter(record["recommended_action"] for record in records)
    scope_counts = Counter(record["use_scope"] for record in records)
    report = {
        "parent_document_id": document_id,
        "manifest_sha256": sha256_bytes(manifest_path.read_bytes()),
        "entry_count": len(entries),
        "inventory_count": len(records),
        "missing_paths": sorted(set(entry["path"] for entry in entries) - set(record["relative_path"] for record in records)),
        "extra_paths": sorted(set(record["relative_path"] for record in records) - set(entry["path"] for entry in entries)),
        "unique_child_asset_ids": len({record["child_asset_id"] for record in records}),
        "quality_counts": dict(sorted(quality_counts.items())),
        "group_counts": dict(sorted(group_counts.items())),
        "anomaly_counts": dict(sorted(anomaly_counts.items())),
        "topic_counts": dict(topic_counts.most_common()),
        "product_relevance_counts": dict(sorted(relevance_counts.items())),
        "recommended_action_counts": dict(sorted(action_counts.items())),
        "use_scope_counts": dict(sorted(scope_counts.items())),
        "credential_shape_matches_in_introductions": sum(
            1 for record in records for pattern in SECRET_PATTERNS if pattern.search(record["introduction"])
        ),
        "credential_shape_matches_in_relevance_fields": sum(
            1
            for record in records
            for pattern in SECRET_PATTERNS
            if pattern.search(" ".join((
                record["relevance_reason"], record["product_takeaway"], record["adoption_boundary"]
            )))
        ),
        "inventory_sha256": sha256_bytes(inventory.read_bytes()),
    }
    lines = [
        f"# {document_id} 压缩包逐文档导读",
        "",
        "> 权限：confidential，仅授权本机 Agent/审查角色使用。",
        "> 本文的“介绍”是机器生成的抽取式导读，帮助快速判断文件讲什么；不等于人工复核、正式产品口径或可发布知识。",
        "> 子文件状态统一为 `extractive_unreviewed / unreviewed_child / not_ready`；需要正式引用时必须单篇提升、补证和审查。",
        "",
        "## 覆盖概况",
        "",
        f"- 清单文件：{len(entries)}",
        f"- 已生成介绍：{len(records)}",
        f"- 唯一 child_asset_id：{report['unique_child_asset_ids']}",
        f"- 内容质量：{json.dumps(report['quality_counts'], ensure_ascii=False)}",
        f"- 异常标记：{json.dumps(report['anomaly_counts'], ensure_ascii=False)}",
        f"- 产品相关性：{json.dumps(report['product_relevance_counts'], ensure_ascii=False)}",
        f"- 建议动作：{json.dumps(report['recommended_action_counts'], ensure_ascii=False)}",
        "",
        "## 状态含义",
        "",
        "- `substantive`：有较多可读正文；仍不代表内容有效或最新。",
        "- `short`：有正文但较短。",
        "- `stub`：占位、链接提示或极短片段。",
        "- `empty`：没有可用正文。",
        "- `pdf_extension_but_plain_text`：文件名是 PDF，实际为 UTF-8 文本导出，不是可渲染 PDF。",
        "- `exact_duplicate`：与包内另一文件逐字节相同。",
        "",
    ]
    grouped: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        grouped[record["source_group_label"]].append(record)
    for group_label, group_records in sorted(grouped.items()):
        lines.extend([f"## {group_label}（{len(group_records)}）", ""])
        for record in group_records:
            status = record["quality"]
            if record["anomalies"]:
                status += "；" + "、".join(record["anomalies"])
            lines.extend([
                f"### {record['title']}",
                "",
                f"- child_asset_id：`{record['child_asset_id']}`",
                f"- 相对路径：`{record['relative_path']}`",
                f"- 讲什么：{record['introduction']}",
                f"- 主题：{'、'.join(record['topics'])}",
                f"- 质量/异常：{status}",
                f"- 对 KA 产品的价值：`{record['product_relevance']}`；建议 `{record['recommended_action']}`",
                f"- 用途/阶段：`{record['use_scope']} / {record['roadmap_phase']}`",
                f"- 评估优先级：`{record['relevance_priority']}`",
                f"- 对应模块：{'、'.join(record['related_product_modules']) or '无'}",
                f"- 判断理由：{record['relevance_reason']}",
                f"- 可提取：{record['product_takeaway']}",
                f"- 借鉴边界：{record['adoption_boundary']}",
                f"- 审查/发布：`{record['review_state']} / {record['publish_state']}`",
            ])
            if record["duplicate_of_child_asset_id"]:
                lines.append(f"- 完全重复于：`{record['duplicate_of_child_asset_id']}`")
            lines.append("")
    guide = output_dir / "document-guide.md"
    guide.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    report["guide_sha256"] = sha256_bytes(guide.read_bytes())
    (output_dir / "coverage-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    shortlist = [
        f"# {document_id} 对 KA 产品有用的资料清单",
        "",
        "> 这是资料研究 Agent 的相关性判断，不是 arch 已批准结论。",
        "> 只有 `direct_candidate` 可进入单篇提升候选；`conditional_candidate` 必须先补当前版本/接口/权限证据。",
        "",
        "## 判断结论",
        "",
        f"- 直接相关候选：{relevance_counts['direct_candidate']}",
        f"- 条件相关候选：{relevance_counts['conditional_candidate']}",
        f"- 仅背景参考：{relevance_counts['background_only']}",
        f"- 与产品无关：{relevance_counts['not_relevant']}",
        f"- 正文不足、无法判断：{relevance_counts['cannot_assess']}",
        "",
        "## 分级解释",
        "",
        "- `direct_candidate`：主题直接对应 KA 产品缺口，但仍需单篇审查。",
        "- `conditional_candidate`：只在接口、版本、权限和适配性补证后考虑。",
        "- `background_only`：帮助理解工程/行业/项目背景，不形成产品需求。",
        "- `not_relevant`：不进入产品设计、路线图或默认知识。",
        "- `cannot_assess`：正文缺失或过短，不能凭标题判断。",
        "",
    ]
    for level, heading in (
        ("direct_candidate", "直接相关候选"),
        ("conditional_candidate", "条件相关候选"),
        ("background_only", "仅背景参考"),
        ("not_relevant", "与产品无关"),
        ("cannot_assess", "正文不足、无法判断"),
    ):
        selected = [record for record in records if record["product_relevance"] == level]
        shortlist.extend([f"## {heading}（{len(selected)}）", ""])
        for record in selected:
            shortlist.extend([
                f"### {record['title']}",
                "",
                f"- child_asset_id：`{record['child_asset_id']}`",
                f"- 来源组：{record['source_group_label']}",
                f"- 讲什么：{record['introduction']}",
                f"- 判断：{record['relevance_reason']}",
                f"- 建议：`{record['recommended_action']}`；优先级 `{record['relevance_priority']}`；{record['product_takeaway']}",
                f"- 边界：{record['adoption_boundary']}",
                "",
            ])
    shortlist_path = output_dir / "product-relevance-guide.md"
    shortlist_path.write_text("\n".join(shortlist).rstrip() + "\n", encoding="utf-8")
    report["product_relevance_guide_sha256"] = sha256_bytes(shortlist_path.read_bytes())
    (output_dir / "coverage-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    write_outputs(args.document_id, args.source_root, args.manifest, args.output_dir)


if __name__ == "__main__":
    main()
