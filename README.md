# 大学实用就业指南 · Wiki

把《给大学新生的一份坦白话（2026 版）》（11 页 PDF）整理成一个可检索、可打印的静态 wiki。

白蓝配色，克制排版，长文阅读优先。

## 线上地址

- 服务器：`47.111.175.191`
- 域名：`https://los-theseus.site/`（入口页） → `https://los-theseus.site/zywiki/`
- 纯 IP：`http://47.111.175.191/zywiki/`（80 明文，不受域名跳转影响）

> 入口页 `portal/` 也在本仓库里，改首页同样走 git + `update.sh`，不要在服务器上手改。

## 目录结构

```
ZyWiki/
├── src/
│   ├── content.mjs    # 全部正文（唯一的内容源，改这里）
│   ├── build.mjs      # 生成 dist/：页面、目录、搜索索引、sitemap
│   ├── check.mjs      # 结构与链接自检（构建后跑一遍）
│   ├── shot.mjs       # 无头 Chrome 版面体检（溢出/字号/JS 报错 + 截图）
│   └── serve.mjs      # 本地预览服务器
├── public/            # 静态资源，原样拷贝进 dist/
├── portal/            # 域名首页（LosAngelous 入口页），发布到 /var/www/index
├── deploy/nginx/      # nginx 站点配置，用 update.sh --nginx 同步
├── dist/              # 构建产物（已提交，服务器不需要 node）
└── update.sh          # 服务器端更新脚本
```

`dist/` 是提交进仓库的，所以服务器只装 git 和 rsync 就能发布，不需要 Node。

## 本地使用

```bash
npm run build        # 生成 dist/
node src/check.mjs   # 链接、锚点、标签配对自检
npm run serve        # 预览 http://127.0.0.1:5178/
```

改内容只改 `src/content.mjs`，然后重新 build。不要手改 `dist/`。

## 一个页面长什么样

- 左侧：全书目录（移动端为抽屉）
- 中间：正文，最大宽度 44rem，行高 1.9
- 右侧：本页目录，随滚动高亮
- 顶部：阅读进度条、搜索（`/` 或 `Ctrl/⌘ + K`）
- 页尾：上一节 / 下一节

正文里用到的版式组件：

| 组件 | 写法 | 用途 |
| --- | --- | --- |
| 提示块 | `<div class="callout">` | 一句话结论、需要注意的点 |
| 安静提示 | `callout--quiet` | 比方、补充说明 |
| 警示提示 | `callout--warn` | 容易做错的地方 |
| 引用块 | `<div class="quotebox">` | 原文金句、公式 |
| 对照双栏 | `<div class="duo">` | 好情况 / 差情况 |
| 情景对照 | `<div class="scenario">` | 同一个处境下的两种人 |
| 分层卡片 | `<div class="layers"><div class="layer">` | 技能三层 |
| 步骤列表 | `<ol class="steps">` | 自问清单 |
| 表格 | `<div class="tablewrap"><table>` | 清单、对照 |

标题层级只用 `h2`（进入右侧目录）和 `h3`（正文小标题）；`h2` 的 id 由构建脚本自动生成。

## 部署

### 首次

本地推送到 GitHub：

```bash
git add -A && git commit -m "..." && git push origin main
```

服务器上：

```bash
cd /opt
git clone https://github.com/2932238802/ZyWiki.git
cd ZyWiki
chmod +x update.sh
./update.sh
```

`update.sh` 会把 `dist/` 同步到 `/var/www/index/zywiki/`（nginx 现有站点根目录下的子路径），并修正属主。

### 日常更新

```bash
cd /opt/ZyWiki && ./update.sh
```

脚本做的事：`git pull --ff-only` → 校验 `dist/index.html` → `rsync -a --delete` 到站点目录 → `chown www-data` → 打印文件数与访问地址。

可选参数：

| 参数 | 作用 |
| --- | --- |
| `--no-pull` | 只发布，不拉取 |
| `--build` | 拉取后在本机重新构建（需要 node） |
| `--nginx` | 同步 `deploy/nginx/*.conf` 到 sites-available/enabled，改前自动备份，`nginx -t` 通过才重载 |
| `--help` | 查看用法 |

环境变量：`WEB_ROOT`（默认 `/var/www/index/zywiki`）、`PORTAL_ROOT`（默认 `/var/www/index`）、`WEB_OWNER`（默认 `www-data:www-data`）、`BRANCH`（默认 `main`）、`MIRROR`（默认 `https://gh-proxy.com`）。

### HTTPS

证书用 Let's Encrypt（certbot webroot 方式，不接管 nginx 配置），到期自动续期：

```bash
certbot certonly --webroot -w /var/www/index -d los-theseus.site \
  --deploy-hook 'systemctl reload nginx'
```

配置见 `deploy/nginx/index-https.conf`：443 提供站点，域名 80 跳 443，`/.well-known/acme-challenge/` 保留明文供续期；IP 直连仍走 80，避免证书与 IP 不匹配。

**注意**：阿里云安全组需要放行入方向 `443/TCP`，否则外网访问会一直握手失败（服务器本机 443 是通的）。

## 内容口径

- 事实、数字、限定语以原文为准；原文标注“仅供参考”“各公司不同”的地方不改写。
- 不做励志加工，不替作者补结论。
- 站点只负责分节、加锚点、建索引。

原文：`给大学新生的一份坦白话（2026 版）`，Typora 导出 PDF，11 页，38 条书签。
