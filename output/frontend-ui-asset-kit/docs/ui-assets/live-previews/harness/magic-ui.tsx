import { createRoot } from "react-dom/client";
import { useState } from "react";
import { NumberTicker } from "@/official/magic/number-ticker";

function Demo() {
  const [value, setValue] = useState(128640);
  return <main className="preview-shell" data-preview-source="magic-ui"><header className="preview-heading"><div><span>08 / PRODUCT MOTION</span><h1>Magic UI</h1></div><p>官方 Number Ticker 是更克制的 SaaS 微动效，适合 KPI 更新而不是持续抢注意力。</p></header><section className="preview-grid"><article className="demo-card"><div className="demo-label">NUMBER TICKER</div><div className="text-5xl font-semibold">¥ <NumberTicker value={value} /></div><button className="demo-action mt-8" onClick={() => setValue((current) => current + 3720)} type="button">模拟更新</button></article><article className="demo-card"><div className="demo-label">FREE REGISTRY</div><p className="text-sm leading-7 text-muted-foreground">适合数字、列表、边框等局部强调；当前展示的是公开 MIT Free 源码。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
