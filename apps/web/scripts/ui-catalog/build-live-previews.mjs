import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const WEB_ROOT = join(REPO_ROOT, "apps/web");
const LIVE_ROOT = join(REPO_ROOT, "docs/frontend/ui-assets/live-previews");
const CACHE_ROOT = join(REPO_ROOT, "docs/frontend/ui-assets/source-cache");
const HARNESS_ROOT = join(LIVE_ROOT, "harness");
const SPEC_PATH = join(WEB_ROOT, "scripts/ui-catalog/live-preview-spec.json");
const BUILD_MODULES = process.env.PREVIEW_BUILD_NODE_MODULES
  ?? join(tmpdir(), "ka-ui-live-preview-build/node_modules");
const require = createRequire(import.meta.url);

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function loadSpec() {
  return JSON.parse(await readFile(SPEC_PATH, "utf8"));
}

async function payload(source, name) {
  return JSON.parse(await readFile(join(CACHE_ROOT, source, `${name}.json`), "utf8"));
}

async function payloadFile(source, name, index = 0) {
  const item = await payload(source, name);
  const file = item.files?.[index];
  if (!file?.content) throw new Error(`${source}:${name} has no source content at files[${index}]`);
  return file.content;
}

async function writePayloadDeclared(tempRoot, source, name) {
  const item = await payload(source, name);
  if (!item.files?.length) throw new Error(`${source}:${name} has no source files`);
  for (const file of item.files) {
    if (!file.path || file.path.split("/").includes("..")) {
      throw new Error(`${source}:${name} has unsafe source path`);
    }
    await write(join(tempRoot, file.path), file.content);
  }
}

async function writePayloadTarget(tempRoot, target, source, name, index = 0) {
  await write(join(tempRoot, target), await payloadFile(source, name, index));
}

async function writeCommonAdapters(tempRoot) {
  const utils = `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }\nexport const cx = cn;\n`;
  await write(join(tempRoot, "lib/utils.ts"), utils);
  await write(join(tempRoot, "registry/default/lib/utils.ts"), `export { cn, cx } from "@/lib/utils";\n`);
  await write(
    join(tempRoot, "app/(create)/components/icon-placeholder.tsx"),
    `export function IconPlaceholder({ className = "", ...props }) { return <span aria-hidden="true" className={className} {...props}>↕</span>; }\n`,
  );
}

async function copyAppUi(tempRoot, names) {
  for (const name of names) {
    await write(
      join(tempRoot, `components/ui/${name}.tsx`),
      await readFile(join(WEB_ROOT, `components/ui/${name}.tsx`), "utf8"),
    );
  }
}

async function prepareOfficialSources(preview, tempRoot) {
  await writeCommonAdapters(tempRoot);

  switch (preview.source) {
    case "shadcn":
      await writePayloadDeclared(tempRoot, "shadcn", "calendar-demo");
      await writePayloadDeclared(tempRoot, "shadcn", "calendar");
      await writePayloadDeclared(tempRoot, "shadcn", "button");
      break;
    case "coss":
      for (const name of ["p-date-picker-2", "button", "calendar", "popover", "spinner"]) {
        await writePayloadDeclared(tempRoot, "coss", name);
      }
      break;
    case "coss-origin":
      await writePayloadDeclared(tempRoot, "coss-origin", "comp-100");
      await writePayloadDeclared(tempRoot, "coss-origin", "button");
      break;
    case "reui": {
      await writePayloadTarget(tempRoot, "official/reui/pattern.tsx", "reui", "c-data-grid-27");
      await writePayloadTarget(tempRoot, "components/reui/badge.tsx", "reui", "badge");
      const dataGrid = await payload("reui", "data-grid");
      for (const name of [
        "data-grid.tsx",
        "data-grid-column-header.tsx",
        "data-grid-scroll-area.tsx",
        "data-grid-table.tsx",
        "data-grid-table-virtual.tsx",
      ]) {
        const file = dataGrid.files.find((candidate) => candidate.path === name);
        if (!file) throw new Error(`reui:data-grid missing ${name}`);
        await write(join(tempRoot, `components/reui/data-grid/${name}`), file.content);
      }
      await copyAppUi(tempRoot, ["button", "card", "checkbox", "dropdown-menu"]);
      await write(
        join(tempRoot, "components/ui/avatar.tsx"),
        `export function Avatar(props) { return <span {...props} />; }\nexport function AvatarImage() { return null; }\nexport function AvatarFallback(props) { return <span {...props} />; }\n`,
      );
      await write(
        join(tempRoot, "components/ui/spinner.tsx"),
        `export function Spinner({ className = "" }) { return <span className={className} aria-label="loading">◌</span>; }\n`,
      );
      break;
    }
    case "tremor":
      await write(
        join(tempRoot, "official/tremor/kpi-card.tsx"),
        await readFile(
          join(CACHE_ROOT, "tremor/block-kpi-cards-kpi-card-01/kpi-card-01.tsx"),
          "utf8",
        ),
      );
      await write(
        join(tempRoot, "components/Card.tsx"),
        `export function Card({ className = "", ...props }) { return <div className={"rounded-xl border bg-white p-5 shadow-sm " + className} {...props} />; }\n`,
      );
      break;
    case "tremor-legacy": {
      const destination = join(tempRoot, "vendor/tremor");
      await mkdir(destination, { recursive: true });
      await execFileAsync("tar", [
        "-xzf",
        join(CACHE_ROOT, "tremor-legacy/ui-card/react-3.18.7.tgz"),
        "-C",
        destination,
      ]);
      break;
    }
    case "aceternity":
      await writePayloadTarget(tempRoot, "components/ui/bento-grid.tsx", "aceternity", "bento-grid");
      break;
    case "magic-ui":
      await writePayloadTarget(tempRoot, "official/magic/number-ticker.tsx", "magic-ui", "number-ticker");
      break;
    case "magic-ui-pro":
      await write(
        join(tempRoot, "official/magic-pro/flickering-grid.tsx"),
        await readFile(
          join(CACHE_ROOT, "magic-ui-pro/template-blog/flickering-grid.tsx"),
          "utf8",
        ),
      );
      break;
    case "react-bits":
      await write(
        join(tempRoot, "official/react-bits/Counter.jsx"),
        await readFile(join(CACHE_ROOT, "react-bits/Counter/Counter.jsx"), "utf8"),
      );
      await write(
        join(tempRoot, "official/react-bits/Counter.css"),
        await readFile(join(CACHE_ROOT, "react-bits/Counter/Counter.css"), "utf8"),
      );
      break;
    case "tweakcn":
      await write(
        join(tempRoot, "official/tweak/theme-presets.ts"),
        await readFile(join(CACHE_ROOT, "tweakcn/modern-minimal/theme-presets.ts"), "utf8"),
      );
      await write(join(tempRoot, "official/types/theme.ts"), "export type ThemePreset = any;\n");
      break;
    case "ai-elements":
      await writePayloadTarget(tempRoot, "official/ai/conversation.tsx", "ai-elements", "conversation");
      await writePayloadTarget(tempRoot, "official/ai/sources.tsx", "ai-elements", "sources");
      await write(
        join(tempRoot, "registry/default/ui/button.tsx"),
        await readFile(join(WEB_ROOT, "components/ui/button.tsx"), "utf8"),
      );
      await write(
        join(tempRoot, "registry/default/ui/collapsible.tsx"),
        `"use client";\nimport { Collapsible as Primitive } from "radix-ui";\nexport const Collapsible = Primitive.Root;\nexport const CollapsibleTrigger = Primitive.Trigger;\nexport const CollapsibleContent = Primitive.Content;\n`,
      );
      break;
    case "kibo-ui":
      await writePayloadTarget(tempRoot, "official/kibo/dropzone.tsx", "kibo-ui", "dropzone");
      await writePayloadTarget(tempRoot, "official/kibo/color-picker.tsx", "kibo-ui", "color-picker");
      await copyAppUi(tempRoot, ["button", "input", "select"]);
      break;
    case "dice-ui":
      await writePayloadTarget(tempRoot, "official/dice/file-upload.tsx", "dice-ui", "file-upload");
      await writePayloadTarget(tempRoot, "official/dice/kanban.tsx", "dice-ui", "kanban");
      await writePayloadTarget(tempRoot, "lib/compose-refs.ts", "dice-ui", "kanban", 1);
      await writePayloadTarget(tempRoot, "registry/bases/radix/hooks/use-as-ref.ts", "dice-ui", "use-as-ref");
      await writePayloadTarget(tempRoot, "registry/bases/radix/hooks/use-lazy-ref.ts", "dice-ui", "use-lazy-ref");
      await writePayloadTarget(
        tempRoot,
        "registry/bases/radix/hooks/use-isomorphic-layout-effect.ts",
        "dice-ui",
        "use-isomorphic-layout-effect",
      );
      await copyAppUi(tempRoot, ["button"]);
      break;
    case "animate-ui":
      for (const [target, name] of [
        ["components/animate-ui/components/buttons/ripple.tsx", "components-buttons-ripple"],
        ["components/animate-ui/components/buttons/button.tsx", "components-buttons-button"],
        ["components/animate-ui/primitives/buttons/ripple.tsx", "primitives-buttons-ripple"],
        ["components/animate-ui/primitives/buttons/button.tsx", "primitives-buttons-button"],
        ["components/animate-ui/primitives/animate/slot.tsx", "primitives-animate-slot"],
        ["components/animate-ui/primitives/texts/counting-number.tsx", "primitives-texts-counting-number"],
        ["hooks/use-is-in-view.ts", "hooks-use-is-in-view"],
        ["lib/get-strict-context.tsx", "lib-get-strict-context"],
      ]) {
        await writePayloadTarget(tempRoot, target, "animate-ui", name);
      }
      await copyAppUi(tempRoot, ["button"]);
      break;
    case "motion-primitives":
      await writePayloadTarget(tempRoot, "official/motion/animated-number.tsx", "motion-primitives", "animated-number");
      await writePayloadTarget(tempRoot, "official/motion/disclosure.tsx", "motion-primitives", "disclosure");
      await write(
        join(tempRoot, "registry/default/ui/button.tsx"),
        await readFile(join(WEB_ROOT, "components/ui/button.tsx"), "utf8"),
      );
      await write(
        join(tempRoot, "registry/default/ui/collapsible.tsx"),
        `"use client";\nimport { Collapsible as Primitive } from "radix-ui";\nexport const Collapsible = Primitive.Root;\nexport const CollapsibleTrigger = Primitive.Trigger;\nexport const CollapsibleContent = Primitive.Content;\n`,
      );
      break;
    default:
      throw new Error(`No official-source preparation for ${preview.source}`);
  }
}

async function buildCss(tempRoots) {
  const postcssPath = join(WEB_ROOT, "node_modules/postcss/lib/postcss.mjs");
  const tailwindPath = join(WEB_ROOT, "node_modules/@tailwindcss/postcss/dist/index.mjs");
  const postcss = (await import(pathToFileURL(postcssPath).href)).default;
  const tailwind = (await import(pathToFileURL(tailwindPath).href)).default;
  const globals = await readFile(join(WEB_ROOT, "app/globals.css"), "utf8");
  const withoutImports = globals.split("\n").filter((line) => !line.startsWith("@import ")).join("\n");
  const sourceRules = [...tempRoots.values()]
    .map((root) => `@source "${root.replaceAll("\\", "/")}/**/*.{js,jsx,ts,tsx}";`)
    .join("\n");
  const input = `@import "tailwindcss";\n@import "tw-animate-css";\n${sourceRules}\n@source "${HARNESS_ROOT.replaceAll("\\", "/")}/*.{ts,tsx}";\n${withoutImports}\n
html,body,#root{min-height:100%;margin:0}body{font-family:"Avenir Next","PingFang SC",sans-serif;background:#f3f0e8;color:#171717}.preview-shell{min-height:100vh;min-width:0;padding:28px;background:radial-gradient(circle at 85% 10%,rgba(207,255,42,.34),transparent 28%),#f3f0e8}.preview-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.72fr);gap:28px;align-items:end;border-bottom:1px solid #171717;padding-bottom:18px;margin-bottom:20px}.preview-heading span,.demo-label{font-size:11px;font-weight:800;letter-spacing:.16em;color:#f15c32}.preview-heading h1{font-family:Georgia,"Songti SC",serif;font-size:clamp(38px,6vw,74px);line-height:.92;margin:6px 0 0}.preview-heading p{color:#5f5b53;line-height:1.65;margin:0}.preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.preview-grid-wide{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}.demo-card{min-width:0;border:1px solid #1c1c1c;border-radius:22px;background:rgba(255,255,255,.82);padding:20px;box-shadow:0 10px 30px rgba(33,28,19,.07)}[data-preview-source="reui"] .demo-card{overflow-x:auto}.demo-label{margin-bottom:18px}.demo-action{display:inline-flex;align-items:center;justify-content:center;border:1px solid #171717;border-radius:999px;background:#ceff2a;color:#171717;padding:9px 15px;font-weight:700;font-size:13px;transition:transform .18s ease,box-shadow .18s ease}.demo-action:hover{transform:translateY(-1px);box-shadow:3px 3px 0 #171717}.demo-action:focus-visible{outline:3px solid #f15c32;outline-offset:3px}.demo-note{margin:14px 0 0;color:#6b675f;font-size:12px;line-height:1.6}@media(max-width:720px){.preview-shell{padding:18px}.preview-heading{grid-template-columns:1fr}.preview-grid{grid-template-columns:1fr}.preview-heading h1{font-size:44px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}\n`;
  const result = await postcss([tailwind({ base: WEB_ROOT })]).process(input, {
    from: join(WEB_ROOT, "app/globals.css"),
  });
  await write(join(LIVE_ROOT, "assets/preview.css"), result.css);
}

function frameHtml(preview, css, bundle) {
  const safeCss = css.replace(/<\/style/gi, "<\\/style");
  const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"><title>${preview.title} · Live Preview</title><style>${safeCss}</style></head><body><div id="root"></div><script>${safeBundle}</script></body></html>\n`;
}

async function writeManifest(spec) {
  const records = [];
  for (const preview of spec.previews) {
    if (preview.target_status !== "live") {
      records.push({
        ...preview,
        render_status: preview.target_status,
        mode: "official-link-only",
        interaction: "blocked",
        network_required: false,
        runtime_installed_in_app: false,
      });
      continue;
    }
    const bundlePath = join(LIVE_ROOT, `assets/${preview.id}.js`);
    const framePath = join(LIVE_ROOT, `frames/${preview.id}.html`);
    const bundle = await readFile(bundlePath);
    const frame = await readFile(framePath);
    records.push({
      ...preview,
      render_status: "live",
      mode: "compiled-official-source",
      delivery: "inline-frame-for-file-url",
      interaction: "live",
      frame_path: `frames/${preview.id}.html`,
      bundle_path: `assets/${preview.id}.js`,
      bundle_bytes: bundle.length,
      bundle_sha256: hash(bundle),
      frame_sha256: hash(frame),
      sandbox: "allow-scripts",
      network_required: false,
      runtime_installed_in_app: false,
    });
  }
  const css = await readFile(join(LIVE_ROOT, "assets/preview.css"));
  const live = records.filter((item) => item.render_status === "live");
  const manifest = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    strategy: spec.strategy,
    preview_count: records.length,
    live_count: live.length,
    blocked_count: records.length - live.length,
    represented_official_assets: live.reduce((sum, item) => sum + item.official_assets.length, 0),
    css_path: "assets/preview.css",
    css_sha256: hash(css),
    offline: true,
    previews: records,
  };
  await write(join(LIVE_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function build() {
  const spec = await loadSpec();
  const live = spec.previews.filter((item) => item.target_status === "live");
  const esbuildPath = join(BUILD_MODULES, "esbuild/lib/main.js");
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const tempRoots = new Map();
  await mkdir(join(LIVE_ROOT, "assets"), { recursive: true });
  await mkdir(join(LIVE_ROOT, "frames"), { recursive: true });

  for (const preview of live) {
    const tempRoot = await mkdtemp(join(tmpdir(), `ka-ui-${preview.id}-`));
    await prepareOfficialSources(preview, tempRoot);
    tempRoots.set(preview.id, tempRoot);
  }

  for (const preview of live) {
    const tempRoot = tempRoots.get(preview.id);
    const bundlePath = join(LIVE_ROOT, `assets/${preview.id}.js`);
    await esbuild.build({
      entryPoints: [join(HARNESS_ROOT, `${preview.id}.tsx`)],
      outfile: bundlePath,
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: ["es2020"],
      jsx: "automatic",
      alias: { "@": tempRoot },
      plugins: [{
        name: "dedupe-react-runtime",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path, { paths: [join(WEB_ROOT, "node_modules")] }),
          }));
          buildApi.onResolve({ filter: /^react-dom(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path, { paths: [join(WEB_ROOT, "node_modules")] }),
          }));
        },
      }],
      nodePaths: [BUILD_MODULES, join(WEB_ROOT, "node_modules")],
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "warning",
    });
    const bundle = await readFile(bundlePath, "utf8");
    await write(bundlePath, bundle.replace(/[ \t]+$/gm, ""));
  }

  await buildCss(tempRoots);
  const baseCss = await readFile(join(LIVE_ROOT, "assets/preview.css"), "utf8");
  for (const preview of live) {
    const bundle = await readFile(join(LIVE_ROOT, `assets/${preview.id}.js`), "utf8");
    let componentCss = "";
    try {
      componentCss = await readFile(join(LIVE_ROOT, `assets/${preview.id}.css`), "utf8");
    } catch {
      componentCss = "";
    }
    await write(
      join(LIVE_ROOT, `frames/${preview.id}.html`),
      frameHtml(preview, `${baseCss}\n${componentCss}`, bundle),
    );
  }
  const manifest = await writeManifest(spec);
  console.log(JSON.stringify({
    previews: manifest.preview_count,
    live: manifest.live_count,
    blocked: manifest.blocked_count,
    assets: manifest.represented_official_assets,
  }));
}

async function check() {
  const spec = await loadSpec();
  const manifest = JSON.parse(await readFile(join(LIVE_ROOT, "manifest.json"), "utf8"));
  const errors = [];
  if (manifest.schema_version !== 2) errors.push("manifest schema must be v2");
  if (manifest.preview_count !== spec.previews.length) errors.push("preview count mismatch");
  if (manifest.previews.map((item) => item.source).join("|") !== spec.previews.map((item) => item.source).join("|")) {
    errors.push("preview order mismatch");
  }
  for (const preview of manifest.previews) {
    if (preview.render_status !== "live") {
      if (preview.frame_path || preview.bundle_path) errors.push(`${preview.id}: blocked preview has artifact`);
      continue;
    }
    const bundle = await readFile(join(LIVE_ROOT, preview.bundle_path));
    const frame = await readFile(join(LIVE_ROOT, preview.frame_path));
    if (hash(bundle) !== preview.bundle_sha256) errors.push(`${preview.id}: bundle hash mismatch`);
    if (/[ \t]+$/m.test(bundle.toString("utf8"))) errors.push(`${preview.id}: bundle has trailing whitespace`);
    if (hash(frame) !== preview.frame_sha256) errors.push(`${preview.id}: frame hash mismatch`);
    if (preview.network_required !== false) errors.push(`${preview.id}: must be offline`);
    if (preview.sandbox !== "allow-scripts") errors.push(`${preview.id}: unsafe sandbox`);
    const frameText = frame.toString("utf8");
    if (!frameText.includes("<style>") || !frameText.includes("<script>")) {
      errors.push(`${preview.id}: frame must inline CSS and JavaScript for file:// use`);
    }
    if (/<(?:script|link)[^>]+(?:src|href)=/i.test(frameText)) {
      errors.push(`${preview.id}: frame must not load child resources`);
    }
  }
  const pro = manifest.previews.find((item) => item.source === "react-bits-pro");
  if (pro?.render_status !== "blocked-paid") errors.push("React Bits Pro must remain blocked-paid");
  const css = await readFile(join(LIVE_ROOT, manifest.css_path));
  if (hash(css) !== manifest.css_sha256) errors.push("css hash mismatch");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ previews: manifest.preview_count, live: manifest.live_count, verified: true }));
}

if (process.argv.includes("--write")) await build();
else if (process.argv.includes("--check")) await check();
else console.log("Usage: node build-live-previews.mjs --write|--check");
