// 预设主色候选：每个都标出处。给 KA Pilot 色卡挑「推荐 12」用。
export type Preset = { name: string; hex: string; source: string };

export const shadcnThemes: Preset[] = [
  { name: "Zinc", hex: "#18181b", source: "shadcn 官方 Themes" },
  { name: "Red", hex: "#dc2626", source: "shadcn 官方 Themes" },
  { name: "Rose", hex: "#e11d48", source: "shadcn 官方 Themes" },
  { name: "Orange", hex: "#f97316", source: "shadcn 官方 Themes" },
  { name: "Green", hex: "#16a34a", source: "shadcn 官方 Themes" },
  { name: "Blue", hex: "#2563eb", source: "shadcn 官方 Themes" },
  { name: "Yellow", hex: "#facc15", source: "shadcn 官方 Themes" },
  { name: "Violet", hex: "#7c3aed", source: "shadcn 官方 Themes" },
];

export const radixColors: Preset[] = [
  { name: "Blue 9", hex: "#0090ff", source: "Radix Colors" },
  { name: "Indigo 9", hex: "#3e63dd", source: "Radix Colors" },
  { name: "Violet 9", hex: "#6e56cf", source: "Radix Colors" },
  { name: "Teal 9", hex: "#12a594", source: "Radix Colors" },
  { name: "Green 9", hex: "#30a46c", source: "Radix Colors" },
  { name: "Orange 9", hex: "#f76b15", source: "Radix Colors" },
  { name: "Crimson 9", hex: "#e93d82", source: "Radix Colors" },
  { name: "Gray 9", hex: "#8d8d8d", source: "Radix Colors" },
];

export const tailwind600: Preset[] = [
  { name: "Blue 600", hex: "#2563eb", source: "Tailwind" },
  { name: "Indigo 600", hex: "#4f46e5", source: "Tailwind" },
  { name: "Violet 600", hex: "#7c3aed", source: "Tailwind" },
  { name: "Teal 600", hex: "#0d9488", source: "Tailwind" },
  { name: "Emerald 600", hex: "#059669", source: "Tailwind" },
  { name: "Orange 600", hex: "#ea580c", source: "Tailwind" },
  { name: "Rose 600", hex: "#e11d48", source: "Tailwind" },
  { name: "Slate 600", hex: "#475569", source: "Tailwind" },
];

export const brandRefs: Preset[] = [
  { name: "Linear", hex: "#5e6ad2", source: "品牌参考" },
  { name: "Stripe", hex: "#635bff", source: "品牌参考" },
  { name: "Vercel", hex: "#0070f3", source: "品牌参考" },
  { name: "Figma", hex: "#a259ff", source: "品牌参考" },
  { name: "Ant Design 拂晓蓝", hex: "#1677ff", source: "品牌参考" },
  { name: "Ant Design 酱紫", hex: "#722ed1", source: "品牌参考" },
  { name: "Ant Design 明青", hex: "#13c2c2", source: "品牌参考" },
  { name: "D-CON 橙（PRD 5.1）", hex: "#ff6a2c", source: "本项目" },
];

// 我给 KA Pilot 挑的 12 个：偏深、偏稳，放在灰壳上不炸；红绿黄不进（那是状态色）
export const recommended: Preset[] = [
  { name: "靛蓝", hex: "#3e63dd", source: "Radix Indigo 9" },
  { name: "正蓝", hex: "#2563eb", source: "shadcn Blue" },
  { name: "Linear 蓝紫", hex: "#5e6ad2", source: "Linear" },
  { name: "Stripe 紫", hex: "#635bff", source: "Stripe" },
  { name: "紫", hex: "#6e56cf", source: "Radix Violet 9" },
  { name: "青", hex: "#12a594", source: "Radix Teal 9" },
  { name: "翠绿", hex: "#059669", source: "Tailwind Emerald 600" },
  { name: "明青", hex: "#13c2c2", source: "Ant Design" },
  { name: "D-CON 橙", hex: "#ff6a2c", source: "本项目 PRD 5.1" },
  { name: "深橙", hex: "#ea580c", source: "Tailwind Orange 600" },
  { name: "绯红", hex: "#e93d82", source: "Radix Crimson 9" },
  { name: "石墨", hex: "#3a3a3a", source: "中性" },
];
