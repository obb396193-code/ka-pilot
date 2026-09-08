import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { defaultPresets } from "@/official/tweak/theme-presets";

const choices = ["modern-minimal", "violet-bloom", "doom-64"];

function Demo() {
  const [name, setName] = useState(choices[0]);
  const theme = defaultPresets[name].styles.light;
  const style = useMemo(() => ({ background: theme.background, color: theme.foreground, borderRadius: theme.radius, fontFamily: theme["font-sans"] }), [theme]);
  return <main className="preview-shell" data-preview-source="tweakcn"><header className="preview-heading"><div><span>11 / THEME TOKENS</span><h1>tweakcn</h1></div><p>同一个 KPI/筛选小界面只替换官方 token，直接比较颜色、圆角、字体与图表色的变化。</p></header><section className="preview-grid"><article className="demo-card"><div className="demo-label">OFFICIAL PRESETS</div><div className="flex flex-wrap gap-2">{choices.map((choice) => <button className="demo-action" key={choice} onClick={() => setName(choice)} type="button">{defaultPresets[choice].label}</button>)}</div><p className="demo-note">当前：{defaultPresets[name].label}</p></article><article className="border p-5 shadow-sm" style={{ ...style, borderColor: theme.border }}><div className="flex items-center justify-between"><span className="text-sm opacity-70">投放达标率</span><span className="rounded-full px-2 py-1 text-xs" style={{ background: theme.accent, color: theme["accent-foreground"] }}>实时</span></div><strong className="mt-5 block text-4xl">86.4%</strong><div className="mt-5 h-2 overflow-hidden rounded-full" style={{ background: theme.muted }}><div className="h-full w-[86%]" style={{ background: theme.primary }} /></div><div className="mt-5 flex gap-2">{["chart-1", "chart-2", "chart-3"].map((key) => <span className="h-8 flex-1 rounded" key={key} style={{ background: theme[key] }} />)}</div></article></section></main>;
}

createRoot(document.getElementById("root")!).render(<Demo />);
