import { createRoot } from "react-dom/client";
import DateRangeParticle from "@/registry/default/particles/p-date-picker-2";

function Demo() {
  return <main className="preview-shell" data-preview-source="coss"><header className="preview-heading"><div><span>02 / FINE CONTROLS</span><h1>coss/ui</h1></div><p>官方日期范围 Particle 展示 Base UI 上更细密的尺寸、层级和弹层完成度。</p></header><section className="preview-grid"><article className="demo-card"><div className="demo-label">DATE RANGE PARTICLE</div><DateRangeParticle /><p className="demo-note">打开日历并选择起止日期；这不是 shadcn 的同名组件副本。</p></article><article className="demo-card"><div className="demo-label">CURRENT GENERATION</div><h2 className="text-2xl font-semibold">更像直接可用的工具细节</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">适合日期、Command、Combobox、Field 和 Drawer。与 Radix 组件并存时必须隔离路径。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
