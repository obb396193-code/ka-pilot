import { createRoot } from "react-dom/client";
import { useState } from "react";
import { FlickeringGrid } from "@/official/magic-pro/flickering-grid";

function Demo() {
  const [dark, setDark] = useState(true);
  return <main className="preview-shell" data-preview-source="magic-ui-pro"><header className="preview-heading"><div><span>09 / PUBLIC TEMPLATE</span><h1>Magic UI Pro</h1></div><p>这里只运行官方公开 MIT blog template 的 FlickeringGrid，不代表取得任何私有 Pro block。</p></header><section className="preview-grid"><article className={`demo-card relative min-h-72 overflow-hidden ${dark ? "bg-slate-950 text-white" : "bg-white"}`}><FlickeringGrid className="absolute inset-0" color={dark ? "#a3e635" : "#6d28d9"} maxOpacity={0.45} squareSize={3} gridGap={5} /><div className="relative z-10 max-w-md p-5"><div className="demo-label">PUBLIC MIT TEMPLATE</div><h2 className="text-3xl font-semibold">完整页面的品牌化背景</h2><p className="mt-3 text-sm opacity-75">用于看公开模板气质，不解锁 101 个付费 blocks。</p></div></article><article className="demo-card"><div className="demo-label">THEME RESPONSE</div><button className="demo-action" onClick={() => setDark((value) => !value)} type="button">切换明暗背景</button><p className="demo-note">源码来自 magicuidesign/blog-template 的公开组件。</p></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
