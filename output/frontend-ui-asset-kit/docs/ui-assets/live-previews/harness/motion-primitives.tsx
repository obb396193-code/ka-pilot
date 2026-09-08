import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { AnimatedNumber } from "@/official/motion/animated-number";
import {
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
} from "@/official/motion/disclosure";

function Demo() {
  const [value, setValue] = useState(73.6);

  return (
    <main className="preview-shell" data-preview-source="motion-primitives">
      <header className="preview-heading">
        <div><span>05 / SMALL MOTION</span><h1>Motion Primitives</h1></div>
        <p>实际运行 Animated Number 与 Disclosure，展示极简、细腻、可局部采用的 Motion 风格。</p>
      </header>
      <section className="preview-grid">
        <article className="demo-card flex min-h-72 flex-col justify-center">
          <div className="demo-label">ANIMATED NUMBER</div>
          <div className="flex items-baseline gap-2"><AnimatedNumber className="text-5xl font-semibold" value={value} /><span className="text-muted-foreground">%</span></div>
          <p className="mt-2 text-sm text-muted-foreground">预算完成率</p>
          <button className="demo-action mt-6 self-start" onClick={() => setValue((current) => current > 80 ? 73.6 : 88.2)} type="button">切换数值</button>
        </article>
        <article className="demo-card min-h-72">
          <div className="demo-label">DISCLOSURE</div>
          <Disclosure transition={{ duration: 0.28 }}>
            <DisclosureTrigger>
              <button className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left text-sm font-medium" type="button">为什么判定异常？<ChevronDown className="size-4" /></button>
            </DisclosureTrigger>
            <DisclosureContent className="overflow-hidden">
              <div className="mt-3 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">近 3 小时 CPA 连续高于考核价 25%，且消耗占比仍在上升。该区域适合放证据，不让主页面一直展开。</div>
            </DisclosureContent>
          </Disclosure>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
