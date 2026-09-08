import { createRoot } from "react-dom/client";
import KpiCards from "@/official/tremor/kpi-card";

function Demo() {
  return <main className="preview-shell" data-preview-source="tremor"><header className="preview-heading"><div><span>05 / ANALYTICS</span><h1>Tremor</h1></div><p>官方 KPI block 展示现代分析产品的数字层级、变化状态和报告节奏。</p></header><section className="preview-grid-wide"><article className="demo-card"><div className="demo-label">CURRENT KPI COMPOSITION</div><KpiCards /></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
