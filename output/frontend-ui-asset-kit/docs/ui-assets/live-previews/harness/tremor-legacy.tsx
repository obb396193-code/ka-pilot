import { createRoot } from "react-dom/client";
import Card from "@/vendor/tremor/package/dist/components/layout-elements/Card/Card.js";
import Metric from "@/vendor/tremor/package/dist/components/text-elements/Metric/Metric.js";

function Demo() {
  return <main className="preview-shell" data-preview-source="tremor-legacy"><header className="preview-heading"><div><span>06 / LEGACY ANALYTICS</span><h1>Tremor 3.18</h1></div><p>固定官方 @tremor/react 3.18.7 的 Card 与 Metric，直观看旧版封装和视觉语言。</p></header><section className="preview-grid"><Card><p className="text-sm text-slate-500">广告消耗</p><Metric>¥ 128,640</Metric><p className="mt-3 text-sm text-emerald-600">较昨日 +8.2%</p></Card><article className="demo-card"><div className="demo-label">LEGACY ONLY</div><p className="text-sm leading-7 text-muted-foreground">仍可公开下载且为 Apache-2.0，但只作旧版比较，不冒充 Tremor current。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
