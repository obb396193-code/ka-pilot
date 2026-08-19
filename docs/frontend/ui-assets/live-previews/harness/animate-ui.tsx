import { createRoot } from "react-dom/client";
import { useState } from "react";

import {
  RippleButton,
  RippleButtonRipples,
} from "@/components/animate-ui/components/buttons/ripple";
import { CountingNumber } from "@/components/animate-ui/primitives/texts/counting-number";

function Demo() {
  const [count, setCount] = useState(12840);

  return (
    <main className="preview-shell" data-preview-source="animate-ui">
      <header className="preview-heading">
        <div><span>04 / CONTROLLED MOTION</span><h1>Animate UI</h1></div>
        <p>实际运行 Ripple Button 与 Counting Number；只保留能解释状态变化的微交互。</p>
      </header>
      <section className="preview-grid">
        <article className="demo-card flex min-h-72 flex-col items-center justify-center text-center">
          <div className="demo-label self-stretch text-left">RIPPLE BUTTON</div>
          <RippleButton data-testid="animate-ripple" onClick={() => setCount((value) => value + 237)} size="lg">
            更新报表数据<RippleButtonRipples />
          </RippleButton>
          <p className="demo-note">点击观察官方 ripple primitive；反馈不阻塞业务动作。</p>
        </article>
        <article className="demo-card flex min-h-72 flex-col justify-center">
          <div className="demo-label">COUNTING NUMBER</div>
          <div className="text-5xl font-semibold tracking-tight">
            ¥<CountingNumber key={count} number={count} />
          </div>
          <div className="mt-4 flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">+12.4%</span><span className="text-sm text-muted-foreground">今日消耗</span></div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
