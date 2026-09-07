"use client"

import { useState } from "react"
import { IconPalette } from "@tabler/icons-react"

import {
  ColorPicker,
  ColorPickerAlphaSlider,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
} from "@/components/dice/color-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { huePresets, themeModes, type ThemeMode } from "@/lib/theme/theme"
import { cn } from "@/lib/utils"
import { useTheme } from "./theme-provider"

// 顶栏右上角：模式三段（黑白 / 黑白+彩 / 全彩，开关本身永远黑白不跟主色）+ 色点（显示当前主色；打开色卡：12 预设 + Dice 取色器 + 吸管）
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setMode, setHue } = useTheme()
  // 预设点选后重挂取色器（非受控 + key），避免受控回路；拖动取色器时不重挂
  const [pickerKey, setPickerKey] = useState(0)

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ToggleGroup
        type="single"
        size="sm"
        value={theme.mode}
        onValueChange={(value) => { if (value) setMode(value as ThemeMode) }}
        aria-label="颜色模式"
        className="hidden h-8 items-center gap-0.5 rounded-full border bg-background p-0.5 md:flex"
      >
        {themeModes.map((mode) => (
          // 不用 Tooltip 包 Item：Radix Tooltip 会把 data-state 覆盖掉 Toggle 的 on/off，选中态就丢了；提示用 title
          <ToggleGroupItem
            key={mode.value}
            value={mode.value}
            aria-label={mode.label}
            title={mode.hint}
            className="h-7 min-w-0 gap-1.5 rounded-full! border-0 px-3 text-xs font-medium text-muted-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm hover:bg-muted hover:text-foreground"
          >
            <ModeDot mode={mode.value} />
            {mode.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="选择主色"
                className="inline-flex size-8 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="size-4 rounded-full" style={{ background: "var(--hue)", boxShadow: "0 0 0 2px var(--background), 0 0 0 3px color-mix(in srgb, var(--hue) 40%, white)" }} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">主色：图表、点缀；全彩模式下也管按钮和选中态</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" sideOffset={8} className="w-[268px] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">主色</span>
            <span className="font-mono text-[11px] text-muted-foreground">{theme.hue}</span>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-2" role="listbox" aria-label="预设主色">
            {huePresets.map((preset) => {
              const active = preset.hex.toLowerCase() === theme.hue
              return (
                <Tooltip key={preset.hex}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={`${preset.name} ${preset.hex}`}
                      onClick={() => { setHue(preset.hex); setPickerKey((value) => value + 1) }}
                      className={cn("size-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", active && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
                      style={{ background: preset.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{preset.name} · {preset.source}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
          <div className="mt-3 border-t pt-3">
            <ColorPicker key={pickerKey} inline defaultFormat="hex" defaultValue={theme.hue} onValueChange={(value: string) => setHue(value)}>
              <ColorPickerContent className="w-full gap-2 border-0 p-0 shadow-none">
                <ColorPickerArea className="h-28" />
                <div className="flex items-center gap-2">
                  <ColorPickerEyeDropper />
                  <div className="flex flex-1 flex-col gap-2">
                    <ColorPickerHueSlider />
                    <ColorPickerAlphaSlider />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ColorPickerFormatSelect />
                  <ColorPickerInput />
                </div>
              </ColorPickerContent>
            </ColorPicker>
          </div>
        </PopoverContent>
      </Popover>
      <span className="sr-only"><IconPalette /></span>
    </div>
  )
}

function ModeDot({ mode }: { mode: ThemeMode }) {
  const style: React.CSSProperties =
    mode === "bw" ? { background: "linear-gradient(90deg, currentColor 50%, transparent 50%)" }
    : mode === "bwc" ? { background: "linear-gradient(90deg, currentColor 50%, var(--kp-tone) 50%)" }
    : { background: "var(--kp-tone)", borderColor: "var(--kp-tone)" }
  return <span aria-hidden className="size-2.5 rounded-full border border-current" style={style} />
}
