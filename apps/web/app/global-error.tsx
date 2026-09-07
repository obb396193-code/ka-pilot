"use client"

// 根级兜底：连布局都崩了才会走这里，必须自带 <html>/<body>，且不能依赖任何 provider。
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Geist, 'PingFang SC', 'Microsoft YaHei', sans-serif", background: "#fafafa", color: "#111" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>KA Pilot 暂时打不开</p>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 4px" }}>刷新一次通常就好；一直失败请把下面的编号发给我们。</p>
          <p style={{ fontSize: 12, color: "#6b7280", fontFamily: "ui-monospace, Menlo, monospace" }}>{error.digest ?? "无编号"}</p>
          <button onClick={reset} style={{ marginTop: 12, height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid #d4d4d8", background: "#fff", fontSize: 13, cursor: "pointer" }}>重试</button>
        </div>
      </body>
    </html>
  )
}
