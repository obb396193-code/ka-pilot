import { createRoot } from "react-dom/client";
import CalendarDemo from "@/registry/new-york-v4/examples/calendar-demo";

function Demo() {
  return <main className="preview-shell" data-preview-source="shadcn"><header className="preview-heading"><div><span>01 / PRODUCT FOUNDATION</span><h1>shadcn/ui</h1></div><p>官方 Calendar 代表中性、可组合的产品底座；点击日期可直接观察状态与焦点。</p></header><section className="preview-grid"><article className="demo-card"><div className="demo-label">CURRENT NEW YORK V4</div><div className="flex justify-center rounded-xl border bg-white p-4"><CalendarDemo /></div></article><article className="demo-card"><div className="demo-label">WHY IT FITS</div><h2 className="text-2xl font-semibold">稳定的全站 primitives</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">视觉克制，结构和无障碍状态完整，适合做项目统一底座，再通过 tweakcn token 改品牌。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
