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
        }
        records.append(record)

    output_dir.mkdir(parents=True, exist_ok=True)
    inventory = output_dir / "document-inventory.jsonl"
    inventory.write_text("".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records), encoding="utf-8")

    quality_counts = Counter(record["quality"] for record in records)
    group_counts = Counter(record["source_group_label"] for record in records)
    anomaly_counts = Counter(anomaly for record in records for anomaly in record["anomalies"])
    topic_counts = Counter(topic for record in records for topic in record["topics"])
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
        "credential_shape_matches_in_introductions": sum(
            1 for record in records for pattern in SECRET_PATTERNS if pattern.search(record["introduction"])
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
                f"- 审查/发布：`{record['review_state']} / {record['publish_state']}`",
            ])
            if record["duplicate_of_child_asset_id"]:
                lines.append(f"- 完全重复于：`{record['duplicate_of_child_asset_id']}`")
            lines.append("")
    guide = output_dir / "document-guide.md"
    guide.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    report["guide_sha256"] = sha256_bytes(guide.read_bytes())
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
