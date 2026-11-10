/**
 * 静态站点构建：src/content.mjs -> dist/*.html + dist/search.json
 * 无第三方依赖。node src/build.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, pages } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");

const STAMP = new Date().toISOString().slice(0, 10);

/* ---------------- 工具 ---------------- */

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const slugId = (text) => {
  let id = text
    .replace(/^[\d.]+\s*/, "")
    .replace(/[^\p{Script=Han}\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "section";
};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- 章节：给 h2 加 id 并抽出目录 ---------------- */

function annotate(body, slug) {
  const toc = [];
  const used = new Map();
  const html = body.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, level, attrs, inner) => {
    const text = stripTags(inner);
    if (!text) return m;
    const base = slugId(text);
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    if (level === "2") toc.push({ id, text, level: 2 });
    else toc.push({ id, text, level: 3 });
    return `<h${level}${attrs} id="${esc(id)}">${inner}</h${level}>`;
  });
  return { html, toc };
}

/* ---------------- 布局 ---------------- */

const NAV_GROUPS = [
  {
    label: "开始",
    items: ["index"],
  },
  {
    label: "正文",
    items: ["university", "five-factors", "hidden", "recruiting", "income", "execution", "tools"],
  },
  {
    label: "收尾",
    items: ["closing", "about"],
  },
];

const bySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));

function navHtml(current) {
  return NAV_GROUPS.map((group) => {
    const items = group.items
      .map((slug) => {
        const p = bySlug[slug];
        if (!p) return "";
        const active = p.slug === current.slug ? ' aria-current="page"' : "";
        return `<a class="nav__item" href="${p.file}"${active}><span class="nav__num">${esc(p.num)}</span><span>${esc(p.nav)}</span></a>`;
      })
      .join("");
    return `<div class="nav__group"><div class="nav__label">${esc(group.label)}</div>${items}</div>`;
  }).join("");
}

function tocHtml(toc) {
  if (!toc.length) return "";
  const items = toc
    .map(
      (t) =>
        `<li class="lvl-${t.level}"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`
    )
    .join("");
  return `<nav class="toc" aria-label="本页目录" data-toc><div class="toc__label">本页目录</div><ol>${items}</ol></nav>`;
}

function pagerHtml(index) {
  const prev = pages[index - 1];
  const next = pages[index + 1];
  const link = (p, dir) =>
    p
      ? `<a class="pager__link${dir === "next" ? " pager__link--next" : ""}" href="${p.file}"><span class="pager__dir">${dir === "next" ? "下一节" : "上一节"}</span><span class="pager__title">${esc(p.nav)}</span></a>`
      : `<span class="pager__link pager__link--empty" aria-hidden="true"></span>`;
  return `<nav class="pager" aria-label="章节导航">${link(prev, "prev")}${link(next, "next")}</nav>`;
}

function heroHtml(p) {
  return `<header class="hero">
  <span class="hero__kicker">${esc(SITE.edition)}　·　就业指南</span>
  <h1>${esc(SITE.subtitle)}</h1>
  <p class="hero__lead">${esc(p.lead)}</p>
  <div class="hero__meta">
    <span><b>${pages.length - 2}</b> 篇正文</span>
    <span><b>11</b> 页原文</span>
    <span>纯静态 · 可离线阅读</span>
  </div>
</header>`;
}

function pageHtml(p, i, body, toc) {
  const isHome = p.slug === "index";
  const eyebrow = isHome
    ? `<div class="eyebrow"><span>${esc(SITE.edition)}</span><span class="rule"></span><span class="zh">${esc(SITE.subtitle)}</span></div>`
    : `<div class="eyebrow"><span>${esc(p.en)}</span><span class="rule"></span><span class="zh">${esc(p.part)}</span></div>`;
  const head = isHome
    ? heroHtml(p)
    : `${eyebrow}<h1>${esc(p.title)}</h1><p class="lead">${esc(p.lead)}</p>`;

  const title = isHome ? `${SITE.title} · ${SITE.subtitle}（${SITE.edition}）` : `${p.title} · ${SITE.title}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.lead)}">
<meta name="color-scheme" content="light">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.lead)}">
<meta property="og:type" content="article">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<a class="skip" href="#main">跳到正文</a>
<div class="progress" data-progress></div>

<header class="topbar">
  <div class="topbar__inner">
    <button class="burger" type="button" data-burger aria-label="打开目录" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <a class="brand" href="index.html">
      <span class="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none"><path d="M3 3.4c1.9-.8 3.4-.8 5 0v9.2c-1.6-.8-3.1-.8-5 0V3.4Z" fill="#fff"/><path d="M13 3.4c-1.9-.8-3.4-.8-5 0v9.2c1.6-.8 3.1-.8 5 0V3.4Z" fill="#fff" fill-opacity=".72"/></svg>
      </span>
      <span class="brand__text"><span class="brand__title">${esc(SITE.title)}</span><span class="brand__sub">${esc(SITE.edition)} wiki</span></span>
    </a>
    <div class="topbar__nav">
      <a class="topbar__link" href="index.html">目录</a>
      <a class="topbar__link" href="five-factors.html">五项自评</a>
      <a class="topbar__link" href="tools.html">工具清单</a>
      <button class="searchbtn" type="button" data-search-open aria-label="搜索全书">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.5"/><path d="m10.4 10.4 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span>搜索</span><kbd>/</kbd>
      </button>
    </div>
  </div>
</header>

<div class="shell">
  <aside class="sidebar" aria-label="全书目录">
    ${navHtml(p)}
    <div class="sidebar__meta">
      <strong>关于这份指南</strong>
      整理自《${esc(SITE.subtitle)}》（${esc(SITE.edition)}）。文字以原文为准，只做结构整理。
      <a href="about.html">来源与编辑原则</a>
    </div>
  </aside>

  <main class="main" id="main">
    <article class="article">
      ${head}
      ${body}
      ${pagerHtml(i)}
    </article>
  </main>

  ${tocHtml(toc)}
</div>

<footer class="footer">
  <div class="footer__inner">
    <span>${esc(SITE.title)} · ${esc(SITE.edition)}　|　内容整理自《${esc(SITE.subtitle)}》</span>
    <span class="footer__links">
      <a href="index.html">目录</a>
      <a href="about.html">关于本站</a>
      <a href="tools.html">工具清单</a>
    </span>
  </div>
</footer>

<div class="search" data-search hidden>
  <div class="search__panel" role="dialog" aria-modal="true" aria-label="站内搜索">
    <div class="search__field">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.5"/><path d="m10.4 10.4 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <input class="search__input" type="search" placeholder="搜索关键词：实习、秋招、城市、自卑……" autocomplete="off" spellcheck="false">
      <span class="search__esc">ESC</span>
    </div>
    <ul class="search__results" role="listbox"></ul>
    <div class="search__empty" hidden></div>
    <div class="search__foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div>
  </div>
</div>

<script src="assets/site.js" defer></script>
</body>
</html>
`;
}

/* ---------------- 构建 ---------------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
fs.cpSync(path.join(PUBLIC, "assets"), path.join(DIST, "assets"), { recursive: true });
for (const f of fs.readdirSync(PUBLIC)) {
  const from = path.join(PUBLIC, f);
  if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(DIST, f));
}

const searchIndex = [];

pages.forEach((p, i) => {
  const { html, toc } = annotate(p.body, p.slug);
  const out = pageHtml(p, i, html, toc);
  fs.writeFileSync(path.join(DIST, p.file), out, "utf8");

  // 按 h2 切块建索引
  const parts = html.split(/(?=<h2\b)/);
  searchIndex.push({
    t: p.title,
    p: p.part,
    h: p.nav,
    u: p.file,
    x: stripTags(p.lead),
  });
  parts.forEach((chunk, ci) => {
    const heading = (chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1];
    const id = (chunk.match(/<h2[^>]*id="([^"]+)"/) || [])[1];
    if (!heading || !id) return;
    const text = stripTags(chunk.replace(/<h2[\s\S]*?<\/h2>/, ""));
    if (text.length < 8) return;
    searchIndex.push({
      t: p.title,
      p: p.part,
      h: stripTags(heading),
      u: `${p.file}#${id}`,
      x: text,
    });
    void ci;
  });
});

fs.writeFileSync(path.join(DIST, "search.json"), JSON.stringify(searchIndex), "utf8");

// 站点地图（纯静态，方便索引）
const urls = pages
  .map((p) => `  <url><loc>${p.file === "index.html" ? "./" : p.file}</loc><lastmod>${STAMP}</lastmod></url>`)
  .join("\n");
fs.writeFileSync(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  "utf8"
);

console.log(`构建完成：${pages.length} 页，索引 ${searchIndex.length} 条 -> ${DIST}`);
