import Color from "color";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as Dice from "./dice/color-picker";
import * as Kibo from "./kibo/color-picker";
import tweakcn from "./tweakcn-presets.json";
import { brandRefs, radixColors, recommended, shadcnThemes, tailwind600, type Preset } from "./presets";

type Origin = "kibo" | "dice" | "preset";

function Swatches({ items, current, onPick }: { items: Preset[]; current: string; onPick: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <button
          key={p.source + p.name}
          type="button"
          title={`${p.name} · ${p.hex} · ${p.source}`}
          onClick={() => onPick(p.hex)}
          className="group flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-xs hover:bg-muted data-[on=true]:border-foreground"
          data-on={current.toLowerCase() === p.hex.toLowerCase()}
        >
          <span className="size-5 rounded-full" style={{ background: p.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }} />
          <span className="font-medium">{p.name}</span>
          <span className="font-mono text-muted-foreground">{p.hex}</span>
        </button>
      ))}
    </div>
  );
}

function Preview({ hex }: { hex: string }) {
  const style = { "--hue": hex } as React.CSSProperties;
  return (
    <div style={style} className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-[220px_1fr_auto]">
      <div className="rounded-lg border bg-gradient-to-t from-black/[.03] to-white p-4">
        <div className="text-xs text-muted-foreground">今日消耗</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">¥842,600</div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">账面消耗 · 当日实时</div>
        <svg viewBox="0 0 80 26" preserveAspectRatio="none" className="mt-2 h-6 w-full">
          <path d="M0,18 L13,14 L27,15 L40,10 L53,9 L67,6 L80,4 L80,26 L0,26 Z" style={{ fill: "var(--hue)", opacity: 0.1 }} />
          <polyline points="0,18 13,14 27,15 40,10 53,9 67,6 80,4" style={{ fill: "none", stroke: "var(--hue)", strokeWidth: 1.5 }} />
        </svg>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-sm font-semibold">消耗与真实 CPA</div>
        <svg viewBox="0 0 320 90" className="mt-2 h-24 w-full">
          <g stroke="#ececec"><line x1="0" y1="20" x2="320" y2="20" /><line x1="0" y1="50" x2="320" y2="50" /><line x1="0" y1="80" x2="320" y2="80" /></g>
          <path d="M0,60 L53,45 L107,52 L160,36 L213,33 L267,27 L320,24 L320,80 L0,80 Z" style={{ fill: "var(--hue)", opacity: 0.12 }} />
          <path d="M0,60 L53,45 L107,52 L160,36 L213,33 L267,27 L320,24" style={{ fill: "none", stroke: "var(--hue)", strokeWidth: 2 }} />
          <path d="M0,22 L53,34" style={{ fill: "none", stroke: "oklch(from var(--hue) calc(l + 0.2) calc(c * 0.55) h)", strokeWidth: 2 }} />
          <path d="M160,42 L213,55 L267,61 L320,63" style={{ fill: "none", stroke: "oklch(from var(--hue) calc(l + 0.2) calc(c * 0.55) h)", strokeWidth: 2 }} />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <Button style={{ background: "var(--hue)", color: "#fff" }}>生成变更集</Button>
        <Button variant="outline">查看证据</Button>
        <div className="flex gap-1.5">
          <Badge variant="outline" className="text-[#c92a2a]"><span className="size-1.5 rounded-full bg-[#c92a2a]" />P0</Badge>
          <Badge variant="outline"><span className="size-1.5 rounded-full" style={{ background: "var(--hue)" }} />主色点</Badge>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [hex, setHex] = useState("#3e63dd");
  const [origin, setOrigin] = useState<Origin>("preset");
  // 两家都按非受控用（defaultValue）；颜色从别处来时，用 key 重挂那一家，避免受控回路
  const [kiboKey, setKiboKey] = useState(0);
  const [diceKey, setDiceKey] = useState(0);
  const mountedAt = useRef(Date.now());
  const pick = (next: string, from: Origin) => {
    const n = next.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(n)) return;
    if (from !== "preset" && Date.now() - mountedAt.current < 400) return; // 忽略组件挂载时的首次回报
    setHex(n);
    setOrigin(from);
    if (from !== "kibo") setKiboKey((v) => v + 1);
    if (from !== "dice") setDiceKey((v) => v + 1);
  };
  const tweak = (tweakcn as { label: string; primary: string }[]).map((t) => ({ name: t.label, hex: t.primary, source: "tweakcn 预设" }));

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">取色器组件对比 · Kibo UI vs Dice UI</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          两家都是官方源码原样运行（只改了 import 路径），放在同一个容器里、同一份预设、同一个预览。任一边改颜色，下面的 KPI 卡 / 图表 / 按钮立刻跟着变。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">当前主色</span>
          <span className="size-5 rounded-full border" style={{ background: hex }} />
          <span className="font-mono">{hex}</span>
          <Badge variant="secondary">最后改动来自：{origin === "kibo" ? "Kibo" : origin === "dice" ? "Dice" : "预设"}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>A · Kibo UI Color Picker</CardTitle>
            <CardDescription>MIT · 仿 Figma · 依赖 color + radix-ui Slider · 吸管 / 明度饱和面 / 色相 / 透明度 / hex·rgb·hsl 输出</CardDescription>
          </CardHeader>
          <CardContent>
            <Kibo.ColorPicker
              key={`kibo-${kiboKey}`}
              defaultValue={hex}
              onChange={([r, g, b]) => { const next = Color.rgb(r, g, b).hex().toLowerCase(); if (next !== hex) pick(next, "kibo"); }}
              className="max-w-sm rounded-md border bg-background p-4 shadow-sm"
            >
              <Kibo.ColorPickerSelection className="h-56" />
              <div className="flex items-center gap-4">
                <Kibo.ColorPickerEyeDropper />
                <div className="grid w-full gap-1">
                  <Kibo.ColorPickerHue />
                  <Kibo.ColorPickerAlpha />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kibo.ColorPickerOutput />
                <Kibo.ColorPickerFormat />
              </div>
            </Kibo.ColorPicker>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>B · Dice UI Color Picker</CardTitle>
            <CardDescription>公开源码 · 这里用 inline 模式并排看；正式用法是色块触发弹层 · 依赖 radix-ui · 吸管 / 明度饱和面 / 色相 / 透明度 / 格式切换 / 键盘可操作</CardDescription>
          </CardHeader>
          <CardContent>
            <Dice.ColorPicker
              key={`dice-${diceKey}`}
              defaultFormat="hex"
              defaultValue={hex}
              onValueChange={(v: string) => { const next = String(v).toLowerCase(); if (next !== hex) pick(next, "dice"); }}
              inline
              className="max-w-sm"
            >
              <Dice.ColorPickerContent className="rounded-md border bg-background p-4 shadow-sm">
                <Dice.ColorPickerArea />
                <div className="flex items-center gap-2">
                  <Dice.ColorPickerEyeDropper />
                  <div className="flex flex-1 flex-col gap-2">
                    <Dice.ColorPickerHueSlider />
                    <Dice.ColorPickerAlphaSlider />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Dice.ColorPickerFormatSelect />
                  <Dice.ColorPickerInput />
                </div>
              </Dice.ColorPickerContent>
            </Dice.ColorPicker>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>推荐给 KA Pilot 的 12 个预设</CardTitle>
          <CardDescription>偏深、偏稳，放在黑白壳上不炸；每个都标出处。红绿黄不进预设，那是状态色。点一个，上面两家取色器和下面预览一起变。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Swatches items={recommended} current={hex} onPick={(h) => pick(h, "preset")} />
          <Preview hex={hex} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>预设出处 · 别人家在用什么</CardTitle>
          <CardDescription>shadcn 官方主题 8 色 · Radix Colors 第 9 阶 · Tailwind 600 阶 · tweakcn 42 套预设里能取到 hex 主色的 {tweak.length} 套 · 品牌参考</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {[["shadcn 官方 Themes（ui.shadcn.com/themes）", shadcnThemes], ["Radix Colors（第 9 阶，用作实色）", radixColors], ["Tailwind CSS（600 阶）", tailwind600], ["tweakcn 预设主色（jnsahaj/tweakcn theme-presets.ts）", tweak], ["品牌 / 设计系统参考", brandRefs]].map(([title, items]) => (
            <div key={title as string}>
              <div className="mb-2 text-sm font-medium">{title as string}</div>
              <Swatches items={items as Preset[]} current={hex} onPick={(h) => pick(h, "preset")} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>两家怎么选</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-4 font-medium">项</th><th className="py-2 pr-4 font-medium">Kibo UI</th><th className="py-2 font-medium">Dice UI</th></tr></thead>
            <tbody className="[&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
              <tr><td>许可</td><td>MIT</td><td>公开源码（Dice UI，MIT）</td></tr>
              <tr><td>形态</td><td>内联面板（放弹层里要自己包一层 Popover）</td><td>自带弹层：色块触发 → 面板；也能内联</td></tr>
              <tr><td>依赖</td><td>color（颜色换算）+ radix-ui</td><td>只有 radix-ui；自带换算</td></tr>
              <tr><td>功能</td><td>吸管 / 面 / 色相 / 透明 / 格式（hex·rgb·hsl）</td><td>同左 + 键盘方向键微调、受控 value、表单可提交</td></tr>
              <tr><td>代码量</td><td>1 个文件 13KB</td><td>1 个主文件 43KB + 3 个小 hook</td></tr>
              <tr><td>适配成本</td><td>低：改 3 个 import 路径；选色面板高度要由父容器给（size-full）</td><td>低：改 import 路径 + 补 shadcn popover/select 官方文件</td></tr>
              <tr><td>细节差异</td><td>打开时游标不按初始颜色定位（停在左上角，拖一下才对）；透明度值显示在输入框尾</td><td>游标按初始颜色定位；透明度单独一格；面板/滑块都可键盘操作</td></tr>
              <tr><td>我的看法</td><td>更小更简单，视觉更像 Figma</td><td>更完整（键盘、受控、表单），弹层现成，更贴我们「右上角一点就开」的用法</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
