import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const WEB_ROOT = join(REPO_ROOT, "apps/web");
const LIVE_ROOT = join(REPO_ROOT, "docs/frontend/ui-assets/live-previews");
const CACHE_ROOT = join(REPO_ROOT, "docs/frontend/ui-assets/source-cache");
const HARNESS_ROOT = join(LIVE_ROOT, "harness");
const BUILD_MODULES = process.env.PREVIEW_BUILD_NODE_MODULES
  ?? join(tmpdir(), "ka-ui-live-preview-build/node_modules");
const require = createRequire(import.meta.url);

const PREVIEWS = [
  {
    id: "ai-elements",
    source: "ai-elements",
    title: "AI Elements",
    official_assets: ["conversation", "sources"],
    purpose: "Agent conversation and traceable source disclosure",
  },
  {
    id: "kibo-ui",
    source: "kibo-ui",
    title: "Kibo UI",
    official_assets: ["dropzone", "color-picker"],
    purpose: "Business-grade upload and semantic color controls",
  },
  {
    id: "dice-ui",
    source: "dice-ui",
    title: "Dice UI",
    official_assets: ["file-upload", "kanban"],
    purpose: "Accessible complex interactions and drag workflows",
  },
  {
    id: "animate-ui",
    source: "animate-ui",
    title: "Animate UI",
    official_assets: ["components-buttons-ripple", "primitives-texts-counting-number"],
    purpose: "Controlled shadcn-native micro-interactions",
  },
  {
    id: "motion-primitives",
    source: "motion-primitives",
    title: "Motion Primitives",
    official_assets: ["animated-number", "disclosure"],
    purpose: "Small, refined motion primitives",
  },
];

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
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

async function prepareOfficialSources(tempRoot) {
  const copies = [
    ["official/ai/conversation.tsx", "ai-elements", "conversation", 0],
    ["official/ai/sources.tsx", "ai-elements", "sources", 0],
    ["official/kibo/dropzone.tsx", "kibo-ui", "dropzone", 0],
    ["official/kibo/color-picker.tsx", "kibo-ui", "color-picker", 0],
    ["official/dice/file-upload.tsx", "dice-ui", "file-upload", 0],
    ["official/dice/kanban.tsx", "dice-ui", "kanban", 0],
    ["lib/compose-refs.ts", "dice-ui", "kanban", 1],
    ["registry/bases/radix/hooks/use-as-ref.ts", "dice-ui", "use-as-ref", 0],
    ["registry/bases/radix/hooks/use-lazy-ref.ts", "dice-ui", "use-lazy-ref", 0],
    ["registry/bases/radix/hooks/use-isomorphic-layout-effect.ts", "dice-ui", "use-isomorphic-layout-effect", 0],
    ["components/animate-ui/components/buttons/ripple.tsx", "animate-ui", "components-buttons-ripple", 0],
    ["components/animate-ui/components/buttons/button.tsx", "animate-ui", "components-buttons-button", 0],
    ["components/animate-ui/primitives/buttons/ripple.tsx", "animate-ui", "primitives-buttons-ripple", 0],
    ["components/animate-ui/primitives/buttons/button.tsx", "animate-ui", "primitives-buttons-button", 0],
    ["components/animate-ui/primitives/animate/slot.tsx", "animate-ui", "primitives-animate-slot", 0],
    ["components/animate-ui/primitives/texts/counting-number.tsx", "animate-ui", "primitives-texts-counting-number", 0],
    ["hooks/use-is-in-view.ts", "animate-ui", "hooks-use-is-in-view", 0],
    ["lib/get-strict-context.tsx", "animate-ui", "lib-get-strict-context", 0],
    ["official/motion/animated-number.tsx", "motion-primitives", "animated-number", 0],
    ["official/motion/disclosure.tsx", "motion-primitives", "disclosure", 0],
  ];

  for (const [target, source, name, index] of copies) {
    await write(join(tempRoot, target), await payloadFile(source, name, index));
  }

  const utils = `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }\nexport const cx = cn;\n`;
  await write(join(tempRoot, "lib/utils.ts"), utils);
  await write(join(tempRoot, "registry/default/lib/utils.ts"), `export { cn, cx } from "@/lib/utils";\n`);

  for (const component of ["button", "input", "select"]) {
    await write(
      join(tempRoot, `components/ui/${component}.tsx`),
      await readFile(join(WEB_ROOT, `components/ui/${component}.tsx`), "utf8"),
    );
  }
  await write(
    join(tempRoot, "registry/default/ui/button.tsx"),
    await readFile(join(WEB_ROOT, "components/ui/button.tsx"), "utf8"),
  );
  await write(
    join(tempRoot, "registry/default/ui/collapsible.tsx"),
    `"use client";\nimport { Collapsible as Primitive } from "radix-ui";\nexport const Collapsible = Primitive.Root;\nexport const CollapsibleTrigger = Primitive.Trigger;\nexport const CollapsibleContent = Primitive.Content;\n`,
  );
}

async function buildCss(tempRoot) {
  const postcssPath = join(WEB_ROOT, "node_modules/postcss/lib/postcss.mjs");
  const tailwindPath = join(WEB_ROOT, "node_modules/@tailwindcss/postcss/dist/index.mjs");
  const postcss = (await import(pathToFileURL(postcssPath).href)).default;
  const tailwind = (await import(pathToFileURL(tailwindPath).href)).default;
  const globals = await readFile(join(WEB_ROOT, "app/globals.css"), "utf8");
  const withoutImports = globals.split("\n").filter((line) => !line.startsWith("@import ")).join("\n");
  const input = `@import "tailwindcss";\n@import "tw-animate-css";\n@source "${tempRoot.replaceAll("\\", "/")}/**/*.{ts,tsx}";\n@source "${HARNESS_ROOT.replaceAll("\\", "/")}/*.{ts,tsx}";\n${withoutImports}\n
html,body,#root{min-height:100%;margin:0}body{font-family:"Avenir Next","PingFang SC",sans-serif;background:#f3f0e8;color:#171717}.preview-shell{min-height:100vh;padding:28px;background:radial-gradient(circle at 85% 10%,rgba(207,255,42,.34),transparent 28%),#f3f0e8}.preview-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.72fr);gap:28px;align-items:end;border-bottom:1px solid #171717;padding-bottom:18px;margin-bottom:20px}.preview-heading span,.demo-label{font-size:11px;font-weight:800;letter-spacing:.16em;color:#f15c32}.preview-heading h1{font-family:Georgia,"Songti SC",serif;font-size:clamp(38px,6vw,74px);line-height:.92;margin:6px 0 0}.preview-heading p{color:#5f5b53;line-height:1.65;margin:0}.preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.demo-card{border:1px solid #1c1c1c;border-radius:22px;background:rgba(255,255,255,.74);padding:20px;box-shadow:0 10px 30px rgba(33,28,19,.07)}.demo-label{margin-bottom:18px}.demo-action{display:inline-flex;align-items:center;justify-content:center;border:1px solid #171717;border-radius:999px;background:#ceff2a;color:#171717;padding:9px 15px;font-weight:700;font-size:13px;transition:transform .18s ease,box-shadow .18s ease}.demo-action:hover{transform:translateY(-1px);box-shadow:3px 3px 0 #171717}.demo-action:focus-visible{outline:3px solid #f15c32;outline-offset:3px}.demo-note{margin:14px 0 0;color:#6b675f;font-size:12px;line-height:1.6}@media(max-width:720px){.preview-shell{padding:18px}.preview-heading{grid-template-columns:1fr}.preview-grid{grid-template-columns:1fr}.preview-grid-wide{grid-template-columns:1fr}.preview-heading h1{font-size:44px}}\n`;
  const result = await postcss([tailwind({ base: WEB_ROOT })]).process(input, {
    from: join(WEB_ROOT, "app/globals.css"),
  });
  await write(join(LIVE_ROOT, "assets/preview.css"), result.css);
}

function frameHtml(preview) {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; font-src data:"><title>${preview.title} · Live Preview</title><link rel="stylesheet" href="../assets/preview.css"></head><body><div id="root"></div><script src="../assets/${preview.id}.js"></script></body></html>\n`;
}

async function writeManifest() {
  const records = [];
  for (const preview of PREVIEWS) {
    const bundlePath = join(LIVE_ROOT, `assets/${preview.id}.js`);
    const framePath = join(LIVE_ROOT, `frames/${preview.id}.html`);
    const bundle = await readFile(bundlePath);
    const frame = await readFile(framePath);
    records.push({
      ...preview,
      mode: "compiled-official-source",
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
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    strategy: "official-cached-source-plus-project-harness",
    preview_count: records.length,
    represented_official_assets: records.reduce((sum, item) => sum + item.official_assets.length, 0),
    css_path: "assets/preview.css",
    css_sha256: hash(css),
    offline: true,
    previews: records,
  };
  await write(join(LIVE_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function build() {
  const esbuildPath = join(BUILD_MODULES, "esbuild/lib/main.js");
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const tempRoot = await mkdtemp(join(tmpdir(), "ka-ui-preview-src-"));
  await prepareOfficialSources(tempRoot);
  await mkdir(join(LIVE_ROOT, "assets"), { recursive: true });
  await mkdir(join(LIVE_ROOT, "frames"), { recursive: true });

  for (const preview of PREVIEWS) {
    await esbuild.build({
      entryPoints: [join(HARNESS_ROOT, `${preview.id}.tsx`)],
      outfile: join(LIVE_ROOT, `assets/${preview.id}.js`),
      bundle: true,
      minify: true,
      format: "iife",
      platform: "browser",
      target: ["es2020"],
      jsx: "automatic",
      alias: {
        "@": tempRoot,
      },
      plugins: [{
        name: "dedupe-react-runtime",
        setup(build) {
          build.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path, { paths: [join(WEB_ROOT, "node_modules")] }),
          }));
          build.onResolve({ filter: /^react-dom(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path, { paths: [join(WEB_ROOT, "node_modules")] }),
          }));
        },
      }],
      nodePaths: [BUILD_MODULES, join(WEB_ROOT, "node_modules")],
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "warning",
    });
    await write(join(LIVE_ROOT, `frames/${preview.id}.html`), frameHtml(preview));
  }
  await buildCss(tempRoot);
  const manifest = await writeManifest();
  console.log(JSON.stringify({ previews: manifest.preview_count, assets: manifest.represented_official_assets }));
}

async function check() {
  const manifest = JSON.parse(await readFile(join(LIVE_ROOT, "manifest.json"), "utf8"));
  const errors = [];
  if (manifest.preview_count !== PREVIEWS.length) errors.push("preview count mismatch");
  for (const preview of manifest.previews) {
    const bundle = await readFile(join(LIVE_ROOT, preview.bundle_path));
    const frame = await readFile(join(LIVE_ROOT, preview.frame_path));
    if (hash(bundle) !== preview.bundle_sha256) errors.push(`${preview.id}: bundle hash mismatch`);
    if (hash(frame) !== preview.frame_sha256) errors.push(`${preview.id}: frame hash mismatch`);
    if (preview.network_required !== false) errors.push(`${preview.id}: must be offline`);
  }
  const css = await readFile(join(LIVE_ROOT, manifest.css_path));
  if (hash(css) !== manifest.css_sha256) errors.push("css hash mismatch");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ previews: manifest.preview_count, verified: true }));
}

if (process.argv.includes("--write")) await build();
else if (process.argv.includes("--check")) await check();
else console.log("Usage: node build-live-previews.mjs --write|--check");
