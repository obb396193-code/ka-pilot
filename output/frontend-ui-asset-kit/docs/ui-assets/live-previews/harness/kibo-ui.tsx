import { createRoot } from "react-dom/client";
import { useState } from "react";

import {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
} from "@/official/kibo/color-picker";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/official/kibo/dropzone";

function Demo() {
  const [files, setFiles] = useState<File[]>([]);
  const color = "#f45d2c";

  return (
    <main className="preview-shell" data-preview-source="kibo-ui">
      <header className="preview-heading">
        <div><span>02 / BUSINESS UI</span><h1>Kibo UI</h1></div>
        <p>实际运行 Dropzone 与 Color Picker，体现业务级组件的完成度；颜色已接项目语义强调色。</p>
      </header>
      <section className="preview-grid">
        <article className="demo-card">
          <div className="demo-label">DROPZONE</div>
          <Dropzone
            accept={{ "image/*": [] }}
            className="min-h-56 border-dashed bg-card hover:bg-muted/60"
            maxFiles={3}
            maxSize={8 * 1024 * 1024}
            onDrop={(accepted) => setFiles(accepted)}
            src={files.length ? files : undefined}
          >
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
          <p className="demo-note">点击或拖入图片；选择后由官方组件切换到文件摘要状态。</p>
        </article>
        <article className="demo-card">
          <div className="demo-label">COLOR PICKER</div>
          <ColorPicker defaultValue={color}>
            <ColorPickerSelection className="h-36 rounded-xl" />
            <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="space-y-3"><ColorPickerHue /><ColorPickerAlpha /></div>
              <ColorPickerOutput />
            </div>
            <ColorPickerFormat className="mt-4" />
          </ColorPicker>
          <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="size-5 rounded-full border" style={{ background: color }} />
            用于图表、标注与主题配置，不绑定官网配色。
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
