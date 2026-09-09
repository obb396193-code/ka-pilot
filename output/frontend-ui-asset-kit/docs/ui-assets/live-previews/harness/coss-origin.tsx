import { createRoot } from "react-dom/client";
import OriginButton from "@/registry/default/components/comp-100";

function Demo() {
  return <main className="preview-shell" data-preview-source="coss-origin"><header className="preview-heading"><div><span>03 / LEGACY ARCHIVE</span><h1>coss Origin</h1></div><p>官方 comp-100 是 legacy particle：点击可切换可访问菜单图标，展示旧库的案例式写法。</p></header><section className="preview-grid"><article className="demo-card"><div className="demo-label">COMP-100</div><div className="flex min-h-44 items-center justify-center"><OriginButton /></div><p className="demo-note">只作为 current 缺口与历史参考；新页面不默认选 Origin。</p></article><article className="demo-card"><div className="demo-label">GENERATION DIFFERENCE</div><h2 className="text-2xl font-semibold">更大颗粒、更多案例</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">覆盖很广，但维护与体系化不如 current coss；两代必须独立登记。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
