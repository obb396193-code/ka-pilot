"use client"

import { useEffect, useRef, useState } from "react"
import { IconCheck, IconPhotoPlus, IconTrash, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AVATAR_CHANGE_EVENT, avatarPresets, avatarSrc, fileToAvatarDataUrl, presetSrc, readStoredAvatar, storeAvatar, type AvatarChoice } from "@/lib/avatar"
import { cn } from "@/lib/utils"

/** 读当前头像选择，并跟随其他组件的修改实时更新（同页多处头像要一起变） */
export function useAvatarChoice(): AvatarChoice {
  const [choice, setChoice] = useState<AvatarChoice>({ kind: "default" })
  useEffect(() => {
    setChoice(readStoredAvatar())
    const onChange = (event: Event) => setChoice((event as CustomEvent<AvatarChoice>).detail ?? readStoredAvatar())
    const onStorage = () => setChoice(readStoredAvatar())
    window.addEventListener(AVATAR_CHANGE_EVENT, onChange)
    window.addEventListener("storage", onStorage)
    return () => { window.removeEventListener(AVATAR_CHANGE_EVENT, onChange); window.removeEventListener("storage", onStorage) }
  }, [])
  return choice
}

/** 预设图由 Codex 出，文件没到位时显示占位；到位后自动换成真图 */
function PresetTile({ id, name, brief, active, onPick }: { id: string; name: string; brief: string; active: boolean; onPick: () => void }) {
  const [missing, setMissing] = useState(false)
  return (
    <button
      type="button"
      title={`${name} · ${brief}`}
      aria-label={name}
      aria-pressed={active}
      disabled={missing}
      onClick={onPick}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        missing ? "cursor-not-allowed border-dashed bg-muted/40" : "hover:scale-105",
        active && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      {missing ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] leading-tight text-muted-foreground">
          <IconPhotoPlus className="size-4" />
          待出图
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={presetSrc(id)} alt="" className="size-full object-cover" onError={() => setMissing(true)} />
      )}
      {active && !missing ? <span className="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background"><IconCheck className="size-3" /></span> : null}
    </button>
  )
}

export function AvatarPicker({ name, initials }: { name: string; initials: string }) {
  const current = useAvatarChoice()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AvatarChoice>(current)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) setDraft(current) }, [open, current])

  const pick = async (file: File | null | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      setDraft({ kind: "upload", dataUrl: await fileToAvatarDataUrl(file) })
    } catch (error) {
      toast.error("上传失败", { description: error instanceof Error ? error.message : "换一张图片试试" })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const draftLabel = draft.kind === "upload" ? "自己上传的图片" : draft.kind === "preset" ? avatarPresets.find((item) => item.id === draft.id)?.name ?? "预设头像" : "默认头像"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">更换头像</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>更换头像</DialogTitle>
          <DialogDescription>挑一个预设，或上传自己的图片。选择先记在本机，账号同步接入后跟人走。</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <Avatar className="size-12 rounded-lg">
            <AvatarImage src={avatarSrc(draft)} alt={name} />
            <AvatarFallback className="rounded-lg text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{draftLabel}</p>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><IconUpload className="size-4" />{busy ? "处理中…" : "上传图片"}</Button>
            {draft.kind !== "default" ? <Button size="sm" variant="ghost" onClick={() => setDraft({ kind: "default" })}><IconTrash className="size-4" />用默认</Button> : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">预设（12 张，出图后自动出现）</p>
          <div className="grid grid-cols-6 gap-2">
            {avatarPresets.map((preset) => (
              <PresetTile
                key={preset.id}
                id={preset.id}
                name={preset.name}
                brief={preset.brief}
                active={draft.kind === "preset" && draft.id === preset.id}
                onPick={() => setDraft({ kind: "preset", id: preset.id })}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">上传的图片会裁成正方形、压到 256×256 存在这台电脑上，不会上传到服务器（上传接口契约里还没有）。</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={() => { storeAvatar(draft); setOpen(false); toast.success("头像已更新", { description: draft.kind === "default" ? "已改回默认头像" : "已记在这台电脑" }) }}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
