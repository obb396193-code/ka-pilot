import { createRoot } from "react-dom/client";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";

const header = (tone: string) => <div className={`h-28 rounded-lg bg-gradient-to-br ${tone}`} />;

function Demo() {
  return <main className="preview-shell" data-preview-source="aceternity"><header className="preview-heading"><div><span>07 / CINEMATIC UI</span><h1>Aceternity</h1></div><p>官方 Bento Grid 展示强空间层级和能力陈列；悬停卡片可看到它的内容位移动效。</p></header><section className="demo-card"><div className="demo-label">BENTO GRID</div><BentoGrid className="md:auto-rows-[14rem]"><BentoGridItem className="md:col-span-2" header={header("from-violet-700 to-slate-950")} title="Agent 决策中心" description="把推理、工具和成果集中成有空间感的能力入口。" /><BentoGridItem header={header("from-cyan-500 to-blue-950")} title="异常洞察" description="适合低频高价值展示，不用于密集表格。" /><BentoGridItem header={header("from-orange-400 to-rose-950")} title="素材灵感" description="为创意区提供少量品牌感。" /></BentoGrid></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
