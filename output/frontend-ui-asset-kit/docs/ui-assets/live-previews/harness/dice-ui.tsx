import { createRoot } from "react-dom/client";
import { useState } from "react";
import { GripVertical, Upload } from "lucide-react";

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadTrigger,
} from "@/official/dice/file-upload";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
} from "@/official/dice/kanban";

type Card = { id: string; title: string; meta: string };

const initial: Record<string, Card[]> = {
  "待处理": [
    { id: "k1", title: "素材审核", meta: "3 个创意" },
    { id: "k2", title: "异常计划复核", meta: "CPA +28%" },
  ],
  "进行中": [{ id: "k3", title: "预算调整预览", meta: "等待确认" }],
};

function Demo() {
  const [files, setFiles] = useState<File[]>([]);
  const [columns, setColumns] = useState(initial);

  return (
    <main className="preview-shell" data-preview-source="dice-ui">
      <header className="preview-heading">
        <div><span>03 / ACCESSIBLE INTERACTION</span><h1>Dice UI</h1></div>
        <p>实际运行 File Upload 与 Kanban：前者可键盘触发，后者支持鼠标、触摸与键盘拖拽。</p>
      </header>
      <section className="preview-grid preview-grid-wide">
        <article className="demo-card">
          <div className="demo-label">FILE UPLOAD</div>
          <FileUpload
            accept="image/*"
            className="w-full"
            maxFiles={4}
            multiple
            onValueChange={setFiles}
            value={files}
          >
            <FileUploadDropzone className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center data-[dragging]:bg-muted">
              <Upload className="mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">拖入素材，或用键盘选择文件</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG / JPG，最多 4 个</p>
              <FileUploadTrigger className="demo-action mt-5">选择素材</FileUploadTrigger>
            </FileUploadDropzone>
          </FileUpload>
          <p className="demo-note">当前选择：{files.length ? `${files.length} 个文件` : "尚未选择"}</p>
        </article>
        <article className="demo-card min-w-0">
          <div className="demo-label">KANBAN</div>
          <Kanban<Card> getItemValue={(item) => item.id} onValueChange={setColumns} value={columns}>
            <KanbanBoard className="min-h-64 overflow-x-auto">
              {Object.entries(columns).map(([column, items]) => (
                <KanbanColumn className="min-w-52 bg-muted/60" key={column} value={column}>
                  <div className="flex items-center justify-between px-1 py-1 text-sm font-semibold">
                    {column}<KanbanColumnHandle aria-label={`拖动${column}`}><GripVertical className="size-4" /></KanbanColumnHandle>
                  </div>
                  {items.map((item) => (
                    <KanbanItem className="rounded-lg border bg-card p-3 shadow-sm" key={item.id} value={item.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.meta}</p></div>
                        <KanbanItemHandle aria-label={`拖动${item.title}`}><GripVertical className="size-4" /></KanbanItemHandle>
                      </div>
                    </KanbanItem>
                  ))}
                </KanbanColumn>
              ))}
            </KanbanBoard>
          </Kanban>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
