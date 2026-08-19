import { readFile } from "node:fs/promises";
import process from "node:process";

const root = new URL("../../", import.meta.url);
const agentFile = new URL("AGENTS.md", root);

const requiredLinks = [
  "../../docs/frontend/ui-assets/README.md",
  "../../docs/frontend/ui-assets/agent-workflow.md",
  "../../docs/frontend/ui-assets/comparison-template.md",
];

const requiredRules = ["先查目录", "官方源码", "多候选对比", "许可证"];

let content = "";
const failures = [];

try {
  content = await readFile(agentFile, "utf8");
} catch {
  failures.push("missing apps/web/AGENTS.md");
}

for (const link of requiredLinks) {
  if (!content.includes(link)) failures.push(`missing link: ${link}`);
}

for (const rule of requiredRules) {
  if (!content.includes(rule)) failures.push(`missing rule: ${rule}`);
}

if (failures.length > 0) {
  console.error("UI asset agent entry: FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UI asset agent entry: OK");
