const REQUIRED_FIELDS = [
  "source",
  "upstream_name",
  "kind",
  "category",
  "preview_url",
  "source_url",
  "foundation",
  "license",
  "last_verified",
  "upstream_ref",
  "local_status",
];

const LOCAL_STATUSES = new Set([
  "catalogued",
  "approved",
  "preferred",
  "vendored",
  "adapted",
  "deprecated",
]);

function applyTemplate(template, name) {
  return template ? template.replaceAll("{name}", name) : "";
}

function inferKind(type = "") {
  const normalized = type.replace("registry:", "");
  if (["ui", "component"].includes(normalized)) return "primitive";
  if (["block", "page"].includes(normalized)) return "block";
  if (["style", "theme"].includes(normalized)) return "theme";
  if (["example", "particle"].includes(normalized)) return "particle";
  return normalized || "component";
}

function inferCategory(item) {
  const category = item.meta?.category ?? item.categories?.[0];
  if (typeof category === "string" && category.trim()) return category.trim();
  if (item.name.startsWith("p-")) return item.name.split("-").slice(1, -1).join("-") || "particle";
  return "uncategorized";
}

export function normalizeRegistryItem(item, context) {
  if (!item || typeof item.name !== "string" || !item.name.trim()) {
    throw new TypeError("Registry item must include a non-empty name");
  }

  const name = item.name.trim();
  const dependencies = [
    ...(Array.isArray(item.dependencies) ? item.dependencies : []),
    ...(Array.isArray(item.registryDependencies)
      ? item.registryDependencies
      : []),
  ];

  return {
    source: context.source,
    upstream_name: name,
    display_name: item.title ?? name,
    description: item.description ?? "",
    kind: inferKind(item.type),
    category: inferCategory(item),
    preview_url: applyTemplate(context.previewUrlTemplate, name),
    source_url: applyTemplate(context.itemUrlTemplate, name) || context.catalogUrl,
    install_command: applyTemplate(context.installCommandTemplate, name),
    foundation: context.foundation,
    license: context.license,
    dependencies: [...new Set(dependencies)].sort((a, b) => a.localeCompare(b)),
    project_fit: context.projectFit ?? "review-required",
    theme_ready: context.themeReady ?? "unknown",
    last_verified: context.lastVerified,
    upstream_ref: context.upstreamRef,
    local_status: "catalogued",
    local_path: "",
    decision_record: "",
    comparison_record: "",
    upstream_meta: structuredClone(item),
  };
}

export function validateCatalog(items) {
  const errors = [];
  const identities = new Set();

  if (!Array.isArray(items)) {
    return { ok: false, errors: ["catalog must be an array"] };
  }

  for (const [index, item] of items.entries()) {
    const label = `${item?.source ?? "?"}/${item?.upstream_name ?? index}`;

    for (const field of REQUIRED_FIELDS) {
      if (typeof item?.[field] !== "string" || !item[field].trim()) {
        errors.push(`${label}: missing ${field}`);
      }
    }

    const identity = `${item?.source}\u0000${item?.upstream_name}`;
    if (identities.has(identity)) errors.push(`${label}: duplicate identity`);
    identities.add(identity);

    if (
      typeof item?.last_verified === "string" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(item.last_verified)
    ) {
      errors.push(`${label}: last_verified must use YYYY-MM-DD`);
    }

    if (!LOCAL_STATUSES.has(item?.local_status)) {
      errors.push(`${label}: unknown local_status ${item?.local_status}`);
    }

    if (item?.local_status === "preferred") {
      if (!item.decision_record) errors.push(`${label}: preferred requires decision_record`);
      if (!item.comparison_record) errors.push(`${label}: preferred requires comparison_record`);
    }

    if (["vendored", "adapted"].includes(item?.local_status) && !item.local_path) {
      errors.push(`${label}: ${item.local_status} requires local_path`);
    }

    if (!Array.isArray(item?.dependencies)) {
      errors.push(`${label}: dependencies must be an array`);
    }
  }

  return { ok: errors.length === 0, errors };
}

