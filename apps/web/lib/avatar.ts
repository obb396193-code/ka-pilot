// 用户头像：契约里 session 只有 displayName，没有头像字段（缺口已写 inbox-arch）。
// 所以选择先记在本机 localStorage，接口加了 avatarUrl 之后改成跟账号走，这里的存取口不用变。
export type AvatarChoice =
  | { kind: "default" }
  | { kind: "preset"; id: string }
  | { kind: "upload"; dataUrl: string }

export const AVATAR_STORAGE_KEY = "ka-pilot.avatar"
export const AVATAR_CHANGE_EVENT = "ka-pilot:avatar-change"

/** 没选过头像时用的图（内测期沿用 shadcn 示例照片，老板 2026-09-07 拍板保留） */
export const DEFAULT_AVATAR_SRC = "/avatars/shadcn-morty-official.jpg"

// 预设头像 = 12 个槽位，图由 Codex 出（brief 见 docs/relay/inbox-arch.md「头像预设出图」）。
// 文件放 public/avatars/presets/<id>.png；文件没到位时选择器显示「待出图」占位，到位后自动亮起来。
export type AvatarPreset = { id: string; name: string; brief: string }

export const avatarPresets: AvatarPreset[] = [
  { id: "p01-sunrise", name: "日出", brief: "暖橙渐变 + 地平线圆弧" },
  { id: "p02-indigo", name: "靛蓝", brief: "深蓝渐变 + 细弧线" },
  { id: "p03-violet", name: "蓝紫", brief: "蓝紫渐变 + 竖条节奏" },
  { id: "p04-magenta", name: "品红", brief: "品红渐变 + 菱形" },
  { id: "p05-teal", name: "青", brief: "青绿渐变 + 波纹" },
  { id: "p06-emerald", name: "翠绿", brief: "翠绿渐变 + 方格" },
  { id: "p07-sky", name: "天蓝", brief: "天蓝渐变 + 弧线" },
  { id: "p08-rose", name: "玫瑰", brief: "玫红渐变 + 同心圆" },
  { id: "p09-plum", name: "梅子", brief: "紫粉渐变 + 波纹" },
  { id: "p10-slate", name: "石墨", brief: "中性灰渐变 + 方格" },
  { id: "p11-lime", name: "青柠", brief: "黄绿渐变 + 竖条" },
  { id: "p12-ink", name: "墨", brief: "近黑渐变 + 菱形" },
]

export const presetSrc = (id: string) => `/avatars/presets/${id}.png`

/** 头像最终地址；default → 内测示例照片 */
export function avatarSrc(choice: AvatarChoice): string {
  if (choice.kind === "upload") return choice.dataUrl
  if (choice.kind === "preset") return presetSrc(choice.id)
  return DEFAULT_AVATAR_SRC
}

export function readStoredAvatar(): AvatarChoice {
  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY)
    if (!raw) return { kind: "default" }
    const parsed = JSON.parse(raw) as AvatarChoice
    if (parsed.kind === "preset" && typeof parsed.id === "string") return parsed
    if (parsed.kind === "upload" && typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:image/")) return parsed
    return { kind: "default" }
  } catch {
    return { kind: "default" }
  }
}

export function storeAvatar(choice: AvatarChoice) {
  try {
    if (choice.kind === "default") window.localStorage.removeItem(AVATAR_STORAGE_KEY)
    else window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // 隐私模式 / 存储写满：忽略，本次会话内仍然生效
  }
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGE_EVENT, { detail: choice }))
}

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024
const OUTPUT_SIZE = 256

/** 上传的图片一律裁成正方形并压到 256×256，避免把几 MB 原图塞进 localStorage */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("只支持图片文件")); return }
    if (file.size > AVATAR_MAX_BYTES) { reject(new Error("图片超过 4MB，换一张小一点的")); return }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight)
        const canvas = document.createElement("canvas")
        canvas.width = OUTPUT_SIZE
        canvas.height = OUTPUT_SIZE
        const context = canvas.getContext("2d")
        if (!context) throw new Error("浏览器不支持图片处理")
        context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
        const webp = canvas.toDataURL("image/webp", 0.85)
        resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85))
      } catch (error) {
        reject(error instanceof Error ? error : new Error("图片处理失败"))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("这张图片打不开，换一张试试")) }
    image.src = url
  })
}
