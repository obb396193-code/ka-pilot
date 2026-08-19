import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFreeAlternatives } from "./build-free-alternatives.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const OUTPUT = new URL("docs/frontend/ui-assets/free-alternatives.json", ROOT);
const DISCOVERY = new URL("docs/frontend/ui-assets/discovery.json", ROOT);

function asset(id, overrides = {}) {
  const separator = id.indexOf(":");
  return {
    id,
    source: id.slice(0, separator),
    upstream_name: id.slice(separator + 1),
    display_name: id.slice(separator + 1),
    description: "",
    kind: "block",
    category: "general",
    capability_ids: ["kind/block", "category/general"],
    preview_url: `https://example.com/${id}`,
    source_url: `https://example.com/${id}.json`,
    license: "MIT",
    license_scope: "MIT",
    access_status: "public-source",
    access_tier: "free",
    source_cache_status: "not-cached",
    maintenance_status: "current",
    adaptation_cost: "medium",
    ...overrides,
  };
}

test("same-brand motion match requires a specific shared semantic word", () => {
  const paid = asset("react-bits-pro:component/aurora-beam", {
    kind: "motion",
    category: "component",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const specific = asset("react-bits:Aurora", {
    kind: "motion",
    category: "backgrounds",
    license: "MIT + Commons Clause",
  });
  const generic = asset("react-bits:AcidSquares", {
    kind: "motion",
    category: "backgrounds",
    license: "MIT + Commons Clause",
  });

  const output = buildFreeAlternatives({ assets: [paid, generic, specific] });
  const first = output.mappings[0].closest_free_alternatives[0];
  assert.equal(first.id, specific.id);
  assert.equal(first.match_level, "exact-family");
  assert.equal(first.redistribution_restricted, true);
});

test("same-brand matching ignores description prose and English stop words", () => {
  const paid = asset("aceternity:background-with-lines", {
    category: "background",
    description: "A background with the lines that move with content",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const unrelated = asset("aceternity:cloud-shader", {
    category: "background",
    description: "Clouds with the light and lines that shift",
  });

  const output = buildFreeAlternatives({ assets: [paid, unrelated] });
  const mapping = output.mappings[0];
  assert.notEqual(mapping.closest_free_alternatives[0].id, unrelated.id);
  assert.equal(mapping.resolution_status, "composition-required");
});

test("broad shader, gradient and text words never create an exact-family match", () => {
  const pairs = [
    ["aceternity:dot-distortion-shader", "aceternity:cloud-shader", "background"],
    ["aceternity:lines-gradient-shader", "aceternity:background-gradient", "background"],
    ["react-bits-pro:3d-text-reveal", "react-bits:ASCIIText", "text animation"],
  ];

  for (const [paidId, publicId, category] of pairs) {
    const paid = asset(paidId, {
      kind: "motion",
      category,
      access_status: "paid-source-after-license",
      license: "commercial",
    });
    const candidate = asset(publicId, { kind: "motion", category });
    const output = buildFreeAlternatives({ assets: [paid, candidate] });
    assert.notEqual(output.mappings[0].closest_free_alternatives[0].match_level, "exact-family");
  }
});

test("templates are composition work even when their names mention scheduling", () => {
  const paid = asset("aceternity:schedule-marketing-template", {
    kind: "template",
    category: "templates",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const calendar = asset("reui:c-event-calendar-1", {
    category: "calendar",
  });

  const output = buildFreeAlternatives({ assets: [paid, calendar] });
  assert.equal(output.mappings[0].paid_asset.role, "template");
  assert.equal(output.mappings[0].resolution_status, "composition-required");
  assert.equal(output.mappings[0].closest_free_alternatives[0].type, "composition");
});

test("sheet and drawer patterns do not map to dialogs", () => {
  const paid = asset("reui:sheet-1", {
    category: "sheet",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const dialog = asset("reui:c-dialog-1", { category: "dialog" });
  const sheet = asset("shadcn:sheet", { kind: "primitive", category: "sheet" });

  const output = buildFreeAlternatives({ assets: [paid, dialog, sheet] });
  const mapping = output.mappings[0];
  assert.equal(mapping.paid_asset.role, "sheet-drawer");
  assert.equal(mapping.closest_free_alternatives[0].id, "shadcn:sheet");
  assert.notEqual(mapping.closest_free_alternatives[0].id, dialog.id);
});

test("plural FAQs and sidebars classify before visual background fallbacks", () => {
  const faq = asset("aceternity:faqs-with-grid", {
    category: "faqs",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const sidebar = asset("aceternity:sidebars-with-tabs", {
    category: "sidebars",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const accordion = asset("shadcn:accordion", { kind: "primitive", category: "accordion" });
  const dashboard = asset("shadcn:dashboard-01", { category: "dashboard" });

  const output = buildFreeAlternatives({ assets: [faq, sidebar, accordion, dashboard] });
  const byId = new Map(output.mappings.map((mapping) => [mapping.paid_asset.id, mapping]));
  assert.equal(byId.get(faq.id).paid_asset.role, "faq");
  assert.equal(byId.get(faq.id).closest_free_alternatives[0].id, accordion.id);
  assert.equal(byId.get(sidebar.id).paid_asset.role, "app-shell");
  assert.equal(byId.get(sidebar.id).resolution_status, "composition-required");
});

test("stats blocks classify as analytics before social-proof metadata", () => {
  const paid = asset("magic-ui-pro:stats-1", {
    category: "social-proof",
    capability_ids: ["category/dashboard-kpi"],
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const kpi = asset("tremor:block/kpi-cards/kpi-card-01", {
    category: "kpi-cards",
  });

  const output = buildFreeAlternatives({ assets: [paid, kpi] });
  const mapping = output.mappings[0];
  assert.equal(mapping.paid_asset.role, "analytics");
  assert.notEqual(mapping.closest_free_alternatives[0].id, "aceternity:animated-testimonials");
  assert.equal(mapping.resolution_status, "composition-required");
});

test("a verified same-capability candidate ranks before an unverified one", () => {
  const paid = asset("magic-ui-pro:gradient-carousel", {
    category: "carousel",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const unverified = asset("aceternity:carousel", { category: "carousel" });
  const verified = asset("react-bits:Carousel", {
    category: "carousel",
    license: "MIT + Commons Clause",
  });

  const output = buildFreeAlternatives({ assets: [paid, unverified, verified] });
  const mapping = output.mappings[0];
  assert.equal(mapping.closest_free_alternatives[0].id, verified.id);
  assert.equal(mapping.resolution_status, "free-candidate-found");
});

test("social proof distinguishes logo clouds, testimonials and unknown compositions", () => {
  const logo = asset("magic-ui-pro:social-proof-companies-1", {
    category: "social-proof",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const testimonial = asset("magic-ui-pro:social-proof-testimonials-1", {
    category: "social-proof",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const generic = asset("react-bits-pro:social-proof-1", {
    category: "social-proof",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const footerLogo = asset("aceternity:centered-with-logo", {
    category: "footers",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const heroLogos = asset("aceternity:hero-with-framed-image-and-logos", {
    category: "hero-sections",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const marquee = asset("magic-ui:marquee-logos", { category: "marquee" });
  const carousel = asset("shadcn:carousel", { kind: "primitive", category: "carousel" });

  const output = buildFreeAlternatives({
    assets: [logo, testimonial, generic, footerLogo, heroLogos, marquee, carousel],
  });
  const byId = new Map(output.mappings.map((mapping) => [mapping.paid_asset.id, mapping]));
  assert.equal(byId.get(logo.id).paid_asset.role, "logo-cloud");
  assert.equal(byId.get(logo.id).closest_free_alternatives[0].id, marquee.id);
  assert.equal(byId.get(logo.id).resolution_status, "free-candidate-found");
  assert.equal(byId.get(testimonial.id).paid_asset.role, "testimonial");
  assert.equal(byId.get(testimonial.id).closest_free_alternatives[0].id, carousel.id);
  assert.equal(byId.get(testimonial.id).resolution_status, "composition-required");
  assert.equal(byId.get(generic.id).paid_asset.role, "social-proof");
  assert.equal(byId.get(generic.id).closest_free_alternatives[0].type, "composition");
  assert.equal(byId.get(generic.id).resolution_status, "composition-required");
  assert.equal(byId.get(footerLogo.id).paid_asset.role, "footer");
  assert.equal(byId.get(footerLogo.id).resolution_status, "composition-required");
  assert.equal(byId.get(heroLogos.id).paid_asset.role, "hero");
  assert.equal(byId.get(heroLogos.id).resolution_status, "composition-required");
});

test("only explicit event calendars are direct scheduling candidates", () => {
  const eventCalendar = asset("reui:event-calendar-1", {
    category: "application",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const scheduleForm = asset("reui:schedule-6", {
    category: "application",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const freeCalendar = asset("reui:c-event-calendar-1", {
    category: "event-calendar",
  });

  const output = buildFreeAlternatives({
    assets: [eventCalendar, scheduleForm, freeCalendar],
  });
  const byId = new Map(output.mappings.map((mapping) => [mapping.paid_asset.id, mapping]));
  assert.equal(byId.get(eventCalendar.id).paid_asset.role, "event-calendar");
  assert.equal(byId.get(eventCalendar.id).resolution_status, "free-candidate-found");
  assert.equal(byId.get(scheduleForm.id).paid_asset.role, "scheduling");
  assert.equal(byId.get(scheduleForm.id).resolution_status, "composition-required");
});

test("discovery-only collections require component selection and are not direct matches", () => {
  const paid = asset("react-bits-pro:component/text-reveal", {
    kind: "motion",
    category: "text animation",
    access_status: "paid-source-after-license",
    license: "commercial",
  });
  const discovery = {
    sources: [
      {
        id: "motion-primitives",
        name: "Motion Primitives",
        role: "Text and motion primitives",
        compatibility: "React",
        license: "MIT",
        license_verified: true,
        redistribution_restricted: false,
        official_url: "https://motion-primitives.com",
        repository_url: "https://github.com/ibelick/motion-primitives",
        source_cache_status: "not-cached",
        access_status: "public-source",
      },
    ],
  };

  const output = buildFreeAlternatives({ assets: [paid], discovery });
  const mapping = output.mappings[0];
  const candidate = mapping.closest_free_alternatives.find(
    (item) => item.id === "external:motion-primitives",
  );
  assert.equal(candidate.match_level, "collection-selection");
  assert.equal(mapping.resolution_status, "composition-required");
});

test("prompt, recipe and skill content never maps to a UI component", () => {
  const paid = asset("react-bits-pro:agent-kit/prompts/agency", {
    kind: "utility",
    category: "agent-kit/prompts",
    access_status: "paid-source-after-license",
  });
  const output = buildFreeAlternatives({ assets: [paid] });
  const mapping = output.mappings[0];
  assert.equal(mapping.paid_asset.role, "agent-content");
  assert.equal(mapping.resolution_status, "composition-required");
  assert.deepEqual(
    mapping.closest_free_alternatives.map((candidate) => candidate.type),
    ["composition"],
  );
});

test("maps paid icon concepts to semantic libraries without claiming exact icons", () => {
  const paidIcon = asset("reui:icon/arrow-up", {
    kind: "icon",
    category: "arrow",
    access_status: "paid-source-after-license",
    license: "ReUI commercial license",
  });
  const output = buildFreeAlternatives({ assets: [paidIcon] });
  const mapping = output.mappings[0];
  assert.equal(mapping.resolution_status, "semantic-selection-required");
  assert.equal(mapping.closest_free_alternatives[0].id, "external:lucide-icons");
  assert.equal(mapping.closest_free_alternatives[0].match_level, "semantic-library");
});

test("generated discovery shortlist records verified license restrictions and cache state", async () => {
  const discovery = JSON.parse(await readFile(DISCOVERY, "utf8"));
  assert.equal(discovery.schema_version, 1);
  assert.ok(discovery.sources.length >= 5);
  assert.equal(new Set(discovery.sources.map((item) => item.id)).size, discovery.sources.length);
  const animate = discovery.sources.find((item) => item.id === "animate-ui");
  assert.equal(animate.license, "MIT + Commons Clause");
  assert.equal(animate.license_verified, true);
  assert.equal(animate.redistribution_restricted, true);

  for (const source of discovery.sources) {
    assert.match(source.official_url, /^https:\/\//);
    assert.match(source.repository_url, /^https:\/\/github\.com\//);
    assert.equal(source.catalog_status, "discovery-only");
    assert.equal(source.source_cache_status, "not-cached");
    assert.equal(source.runtime_install_status, "not-installed");
    assert.match(source.decision_status, /^approved-for-/);
    assert.ok(source.project_use_policy.length > 20);
    assert.equal(typeof source.license_verified, "boolean");
    assert.equal(typeof source.redistribution_restricted, "boolean");
  }
});

test("production mapping distinguishes provider groups, direct matches and composition", async () => {
  const output = JSON.parse(await readFile(OUTPUT, "utf8"));

  assert.equal(output.schema_version, 2);
  assert.equal(output.summary.paid_metadata_records, 2176);
  assert.equal(output.summary.provider_group_records, 23);
  assert.equal(output.summary.concrete_paid_items, 2153);
  assert.equal(output.summary.mapped_items, 2153);
  assert.equal(output.mappings.length, 2153);
  assert.equal(output.provider_groups.length, 23);
  assert.equal(new Set(output.mappings.map((item) => item.paid_asset.id)).size, 2153);
  assert.ok(output.summary.unresolved_items > 0, "must expose items without a direct free equivalent");

  for (const group of output.provider_groups) {
    assert.equal(group.record_type, "provider-group");
    assert.equal(group.category, "pro-category");
  }

  for (const mapping of output.mappings) {
    assert.equal(mapping.paid_asset.access_status, "paid-source-after-license");
    assert.equal(mapping.paid_asset.record_type, "concrete-asset");
    assert.ok(mapping.closest_free_alternatives.length >= 1);
    assert.ok(mapping.closest_free_alternatives.length <= 3);
    assert.ok(mapping.resolution_status?.trim());
    for (const candidate of mapping.closest_free_alternatives) {
      assert.ok(
        ["catalog-asset", "external-public-source", "composition"].includes(candidate.type),
        `${mapping.paid_asset.id} has unknown candidate type`,
      );
      assert.notEqual(candidate.access_status, "paid-source-after-license");
      assert.notEqual(candidate.source, "coss-origin");
      assert.notEqual(candidate.source, "tremor-legacy");
      assert.notEqual(candidate.source, "magic-ui-pro");
      assert.ok(["source-cached", "not-cached", "not-applicable"].includes(candidate.source_cache_status));
      assert.equal(typeof candidate.license_verified, "boolean");
      assert.equal(typeof candidate.redistribution_restricted, "boolean");
      assert.ok(candidate.match_level?.trim());
      assert.ok(candidate.confidence?.trim());
      assert.ok(candidate.review_status?.trim());
      assert.ok(candidate.reason?.trim());
      assert.ok(candidate.tradeoff?.trim());
    }
  }
});

test("known bad semantic pairs are rejected in production output", async () => {
  const output = JSON.parse(await readFile(OUTPUT, "utf8"));
  const byId = new Map(output.mappings.map((mapping) => [mapping.paid_asset.id, mapping]));
  const firstId = (id) => byId.get(id).closest_free_alternatives[0].id;

  assert.equal(firstId("magic-ui-pro:block/faq-1"), "shadcn:accordion");
  assert.equal(
    firstId("aceternity:/blocks/contact-sections/contact-form-grid-with-details"),
    "composition:project-business-layer",
  );
  assert.equal(firstId("reui:app-shell-1"), "shadcn:dashboard-01");
  assert.equal(firstId("reui:data-grid-base-1"), "reui:c-data-grid-20");
  assert.equal(
    firstId("react-bits-pro:agent-kit/prompts/agency"),
    "composition:project-business-layer",
  );
  assert.notEqual(firstId("react-bits-pro:component/ascii-tiles"), "react-bits:AcidSquares");
  const reuiHeroes = output.mappings.filter((item) => /^reui:hero-\d+$/.test(item.paid_asset.id));
  assert.equal(reuiHeroes.length, 16);
  assert.ok(reuiHeroes.every((item) => item.resolution_status === "composition-required"));
});

test("cached public candidates expose the local cache overlay", async () => {
  const output = JSON.parse(await readFile(OUTPUT, "utf8"));
  const mapping = output.mappings.find((item) => item.paid_asset.id === "reui:data-grid-base-1");
  const reui = mapping.closest_free_alternatives.find((candidate) => candidate.id === "reui:c-data-grid-20");
  assert.equal(reui.source_cache_status, "source-cached");
  assert.match(reui.local_path, /^source-cache\/reui\//);
});
