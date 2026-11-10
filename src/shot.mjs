/**
 * 用无头 Chrome 做版面体检：溢出、字号、JS 报错，并截图。
 * node src/shot.mjs [baseUrl]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.argv[2] || "http://127.0.0.1:5178";
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("找不到 Chrome/Edge");

const OUT = path.resolve(".tmp/screens");
fs.mkdirSync(OUT, { recursive: true });

const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "zywiki-cdp-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("CDP 未就绪");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.errors.push(msg.params.exceptionDetails.text + " " + (msg.params.exceptionDetails.exception?.description || ""));
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.errors.push("console.error: " + JSON.stringify(msg.params.args.map((a) => a.value)));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

const PAGES = ["index.html", "five-factors.html", "university.html", "tools.html"];
const SIZES = [
  { name: "desktop", width: 1440, height: 960, dsf: 1 },
  { name: "laptop", width: 1180, height: 900, dsf: 1 },
  { name: "mobile", width: 390, height: 844, dsf: 2 },
];

const url = await target();
const ws = new WebSocket(url);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
const cdp = new Cdp(ws);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

const report = [];
for (const size of SIZES) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: size.width,
    height: size.height,
    deviceScaleFactor: size.dsf,
    mobile: size.name === "mobile",
  });
  for (const p of PAGES) {
    const nav = await cdp.send("Page.navigate", { url: `${BASE}/${p}` });
    void nav;
    await sleep(700);
    const { result } = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const de = document.documentElement;
        const over = [...document.querySelectorAll('body *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1);
        }).slice(0, 6).map(el => (el.tagName.toLowerCase()) + (el.className ? '.' + String(el.className).split(' ').join('.') : '') + ' @' + Math.round(el.getBoundingClientRect().right));
        const h1 = document.querySelector('h1');
        const p1 = document.querySelector('.article p');
        return {
          title: document.title,
          scrollW: de.scrollWidth,
          innerW: window.innerWidth,
          overflow: over,
          verticalOverflow: de.scrollWidth > window.innerWidth + 1,
          anchors: document.querySelectorAll('.anchor').length,
          navItems: document.querySelectorAll('.nav__item').length,
          tocLinks: document.querySelectorAll('[data-toc] a').length,
          h1: h1 ? getComputedStyle(h1).fontSize + '/' + getComputedStyle(h1).fontWeight : null,
          p: p1 ? getComputedStyle(p1).fontSize + '/' + getComputedStyle(p1).lineHeight : null,
          bg: getComputedStyle(document.body).backgroundColor,
          font: getComputedStyle(document.body).fontFamily.split(',')[0],
          scoreDots: document.querySelectorAll('.score__dot').length,
          docHeight: de.scrollHeight
        };
      })()`,
    });
    const v = result.value;
    report.push({ size: size.name, page: p, ...v });
    if (size.name === "desktop" || size.name === "mobile") {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, `${size.name}-${p.replace(".html", "")}.png`), Buffer.from(shot.data, "base64"));
    }
  }
}

// 全页大图（桌面 2 屏高的首页）
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
await cdp.send("Page.navigate", { url: `${BASE}/five-factors.html` });
await sleep(900);
const full = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
fs.writeFileSync(path.join(OUT, "five-factors-full.png"), Buffer.from(full.data, "base64"));

console.log(JSON.stringify({ errors: cdp.errors, report }, null, 2));
ws.close();
chrome.kill();
