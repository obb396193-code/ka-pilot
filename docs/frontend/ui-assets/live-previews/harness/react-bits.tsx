import { createRoot } from "react-dom/client";
import { useState } from "react";
import Counter from "@/official/react-bits/Counter";

function Demo() {
  const [value, setValue] = useState(7284);
  return <main className="preview-shell" data-preview-source="react-bits"><header className="preview-heading"><div><span>10 / EXPRESSIVE MOTION</span><h1>React Bits</h1></div><p>官方 Counter 的滚轮数字更有表现力；适合挑单个效果，不适合把整站都做成动效展览。</p></header><section className="preview-grid"><article className="demo-card overflow-hidden"><div className="demo-label">COUNTER</div><Counter value={value} fontSize={58} textColor="#171717" gradientFrom="white" /><button className="demo-action mt-8" onClick={() => setValue((current) => current + 137)} type="button">更新数值</button></article><article className="demo-card"><div className="demo-label">LICENSE EDGE</div><p className="text-sm leading-7 text-muted-foreground">Free 源码可审阅，但继续标记 Commons Clause；商业再分发边界必须单独核对。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
