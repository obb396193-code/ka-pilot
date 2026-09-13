/**
 * 前端直出 CSV（F8-27）。
 *
 * 「直出」= 拿页面上**已经看到的那份数据**导出，不再向后端要一次。
 * 这样导出的内容和屏幕上一字不差——包括筛选条件、缺数的「−」、部分合计。
 * 再请一次的话，两次请求之间数据可能已经变了，人会拿到一份和刚才看的不一样的表，
 * 而且完全看不出来。
 */

/** RFC 4180：字段里有逗号、引号、换行就整体加引号，内部引号翻倍 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(columns: string[], rows: (string | number | null | undefined)[][]): string {
  return [columns.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\r\n")
}

/**
 * 触发下载。
 * ★带 **UTF-8 BOM**：不带的话 Excel 在中文 Windows 上会按 GBK 解，整张表中文全是乱码——
 * 这是导出功能最常见也最容易被忽略的坏法（本机 macOS 上永远看不出来）。
 */
export function downloadCsv(filename: string, columns: string[], rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob(["﻿", toCsv(columns, rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 不撤销的话这个 blob 会一直占着内存，导十次就是十份
  URL.revokeObjectURL(url)
}

/** 文件名带上窗口和筛选摘要：一堆 `导出.csv` 躺在下载目录里谁也认不出哪个是哪个 */
export function csvName(prefix: string, window: { from: string; to: string }, note?: string): string {
  return [prefix, `${window.from}_${window.to}`, note].filter(Boolean).join("-")
}
