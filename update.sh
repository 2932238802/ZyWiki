#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 就业指南 Wiki · 服务器更新脚本
#
#   用法：  ./update.sh            拉取 + 发布（wiki + 首页）
#           ./update.sh --build    拉取 + 本地重新构建 + 发布
#           ./update.sh --no-pull  只发布，不拉取
#
#   发布目标：
#     wiki  -> ${WEB_ROOT:-/var/www/index/zywiki}
#     首页  -> ${PORTAL_ROOT:-/var/www/index}（跳过 zywiki 子目录）
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/index/zywiki}"
PORTAL_ROOT="${PORTAL_ROOT:-/var/www/index}"
WEB_OWNER="${WEB_OWNER:-www-data:www-data}"
SRC_DIR="$APP_DIR/dist"
PORTAL_SRC="$APP_DIR/portal"
BRANCH="${BRANCH:-main}"

PULL=1
BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --build)   BUILD=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed -E 's/^# ?//' | head -n 20
      exit 0
      ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;34m[wiki]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[wiki]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

# --- 1. 拉取 ---------------------------------------------------------------
if [ "$PULL" = "1" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    before="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
    say "git pull（当前 ${before}）"
    if ! git -c core.quotepath=false pull --ff-only origin "$BRANCH"; then
      # 国内服务器直连 github.com 常常超时，回退到镜像代理再试一次
      MIRROR="${MIRROR:-https://gh-proxy.com}"
      say "直连失败，改用镜像 ${MIRROR} 重试"
      git -c core.quotepath=false \
          -c url."${MIRROR}/https://github.com/".insteadOf="https://github.com/" \
          pull --ff-only origin "$BRANCH" \
        || fail "拉取失败：请检查网络或设置 MIRROR 环境变量"
    fi
    after="$(git rev-parse --short HEAD)"
    if [ "$before" = "$after" ]; then
      say "已是最新：${after}"
    else
      say "更新：${before} -> ${after}"
    fi
  else
    say "跳过拉取：当前目录不是 git 仓库"
  fi
fi

# --- 2. 可选构建 -----------------------------------------------------------
if [ "$BUILD" = "1" ]; then
  command -v node >/dev/null 2>&1 || fail "需要 node 才能构建，但未安装"
  say "构建静态文件"
  node src/build.mjs
fi

[ -f "$SRC_DIR/index.html" ] || fail "找不到 $SRC_DIR/index.html，无法发布"
[ -f "$PORTAL_SRC/index.html" ] || fail "找不到 $PORTAL_SRC/index.html，无法发布"

# --- 3. 同步工具 -----------------------------------------------------------
# 用 rsync 时把权限固定为目录 755 / 文件 644
publish_mirror() {           # 目标目录完全镜像源目录（会删除多余文件）
  local src="$1" dest="$2" extra="${3:-}"
  install -d -m 0755 "$dest"
  if command -v rsync >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    rsync -a --delete --chmod=D755,F644 ${extra} "$src"/ "$dest"/
  else
    find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -R "$src"/. "$dest"/
    find "$dest" -type d -exec chmod 755 {} +
    find "$dest" -type f -exec chmod 644 {} +
  fi
}

publish_merge() {            # 只覆盖同名文件，不删除目标里已有的东西
  local src="$1" dest="$2"
  install -d -m 0755 "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --chmod=D755,F644 "$src"/ "$dest"/
  else
    cp -R "$src"/. "$dest"/
    find "$dest" -maxdepth 1 -type f -exec chmod 644 {} +
  fi
}

# --- 4. 发布 wiki ----------------------------------------------------------
publish_mirror "$SRC_DIR" "$WEB_ROOT"
say "wiki  -> $WEB_ROOT"

# --- 5. 发布首页（只覆盖，不删除；zywiki 子目录自然保留） -------------------
if [ "$PORTAL_ROOT" != "$WEB_ROOT" ]; then
  publish_merge "$PORTAL_SRC" "$PORTAL_ROOT"
  say "首页  -> $PORTAL_ROOT"
else
  say "跳过首页：PORTAL_ROOT 与 WEB_ROOT 相同"
fi

if [ "$(id -u)" = "0" ]; then
  chown -R "$WEB_OWNER" "$WEB_ROOT" 2>/dev/null || true
  if [ "$PORTAL_ROOT" != "$WEB_ROOT" ]; then
    chown "$WEB_OWNER" "$PORTAL_ROOT"/index.html 2>/dev/null || true
  fi
fi

# --- 6. 自检 ---------------------------------------------------------------
if command -v nginx >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    nginx -t >/dev/null 2>&1 || say "提示：nginx 配置检查未通过（与本站无关时请单独排查）"
  fi
fi

wiki_files="$(find "$WEB_ROOT" -type f | wc -l | tr -d ' ')"
portal_files="$(find "$PORTAL_ROOT" -maxdepth 1 -type f | wc -l | tr -d ' ')"
say "发布完成：wiki ${wiki_files} 个文件，首页 ${portal_files} 个文件"
say "访问：http://$(hostname -I 2>/dev/null | awk '{print $1}'):80/zywiki/"

if command -v git >/dev/null 2>&1 && [ -d "$APP_DIR/.git" ]; then
  git -c core.quotepath=false log -1 --pretty='    %h  %ad  %s' --date=format:'%Y-%m-%d %H:%M' || true
fi
