import { createRoot } from "react-dom/client";
import { Pattern } from "@/official/reui/pattern";

function Demo() {
  return <main className="preview-shell" data-preview-source="reui"><header className="preview-heading"><div><span>04 / ENTERPRISE DATA</span><h1>ReUI</h1></div><p>官方虚拟滚动 Data Grid 运行 200 行数据，体现企业后台的列、排序和高密度操作模式。</p></header><section className="preview-grid-wide"><article className="demo-card"><div className="demo-label">VIRTUALIZED DATA GRID</div><Pattern /></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
