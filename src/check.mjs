import fs from "node:fs";
import path from "node:path";

const DIST = path.join(process.cwd(), "dist");
const files = fs.readdirSync(DIST).filter((f) => f.endsWith(".html"));
let problems = 0;
const note = (...a) => {
  problems += 1;
  console.log(...a);
};

for (const f of files) {
  const html = fs.readFileSync(path.join(DIST, f), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:|#)/.test(url)) continue;
    const [p] = url.split("#");
    if (!p) continue;
    if (!fs.existsSync(path.join(DIST, p))) note("链接缺失", f, "->", url);
  }
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(decodeURIComponent(m[1]))) note("锚点缺失", f, "#" + m[1]);
  }
  if (/undefined|\[object |NaN/.test(html)) note("模板异常", f);
  if (!/<html lang="zh-CN">/.test(html)) note("缺少 lang", f);
  if (!/<title>.+<\/title>/.test(html)) note("缺少 title", f);

  const h1 = [...html.matchAll(/<h1>([\s\S]*?)<\/h1>/g)];
  if (h1.length !== 1) note("h1 数量异常", f, h1.length);

  // 标签配对粗查
  for (const tag of ["div", "article", "main", "aside", "nav", "section", "ul", "ol", "table"]) {
    const open = (html.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) || []).length;
    if (open !== close) note("标签不配对", f, tag, open, close);
  }
}

const search = JSON.parse(fs.readFileSync(path.join(DIST, "search.json"), "utf8"));
for (const item of search) {
  const [file, anchor] = item.u.split("#");
  if (!fs.existsSync(path.join(DIST, file))) note("索引指向缺失文件", item.u);
  if (anchor) {
    const html = fs.readFileSync(path.join(DIST, file), "utf8");
    if (!html.includes(`id="${anchor}"`)) note("索引锚点缺失", item.u);
  }
}

console.log(problems === 0 ? `检查通过：${files.length} 页 / 索引 ${search.length} 条` : `发现 ${problems} 处问题`);
process.exit(problems === 0 ? 0 : 1);
