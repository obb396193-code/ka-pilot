// 视口横向溢出实测：headless Chrome + CDP，登录 cookie 注入，8 页 × 3 宽度截图并量 document.scrollWidth - clientWidth。
// 用法：
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/kp-chrome about:blank &
//   node scripts/ui/overflow-check.mjs <ka_session cookie 值> <输出目录>
// 验收口径：1093（Win 1366@125%）与 1280（1920@150%）所有页 横向溢出 0px。arch 2026-09-09。
const [,, cookie, outDir] = process.argv;
const widths = [1093, 1280, 1440];
const pages = ["/accounts", "/data", "/tasks", "/tasks/1803240580", "/work-items/inbox", "/reports", "/settings", "/admin"];
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const target = list.find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method) events.push(d.method); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await send("Network.enable"); await send("Page.enable");
await send("Network.setCookie", { name: "ka_session", value: cookie, domain: "localhost", path: "/", httpOnly: true });
const summary = [];
for (const w of widths) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 614, deviceScaleFactor: 1, mobile: false });
  for (const p of pages) {
    events.length = 0;
    await send("Page.navigate", { url: "http://localhost:3411" + p });
    for (let i = 0; i < 60 && !events.includes("Page.loadEventFired"); i++) await sleep(100);
    await sleep(1800);
    const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const vw = window.innerWidth; const de = document.documentElement;
      const over = []; for (const el of document.querySelectorAll('body *')) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.right > vw + 2 && getComputedStyle(el).position !== 'fixed') { const c = el.className && typeof el.className === 'string' ? el.className.slice(0,60) : ''; over.push(el.tagName.toLowerCase() + (c ? '.' + c.split(' ').slice(0,3).join('.') : '') + ' right=' + Math.round(b.right)); if (over.length >= 6) break; } }
      const scrollX = de.scrollWidth - de.clientWidth;
      return { url: location.pathname, title: document.title, vw, scrollWidth: de.scrollWidth, overflowPx: scrollX, overflowing: over };
    })()` });
    const v = r.result?.result?.value ?? {};
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    const slug = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
    const file = `${outDir}/${w}-${slug}.jpg`;
    (await import("node:fs")).writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    summary.push({ width: w, page: p, finalUrl: v.url, overflowPx: v.overflowPx, overflowing: v.overflowing, file });
    console.log(`${w} ${p.padEnd(20)} → ${v.url}  横向溢出 ${v.overflowPx}px  越界元素 ${v.overflowing?.length ?? '?'} ${v.overflowing?.[0] ?? ''}`);
  }
}
(await import("node:fs")).writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
ws.close();
