#!/usr/bin/env bash

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done

ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
SERVER_DIR="${SERVER_DIR:-$ROOT_DIR/server}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
APP_ENV="${APP_ENV:-production}"
APP_NAME="${APP_NAME:-qiju-server}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_SLEEP="${HEALTH_SLEEP:-1}"

log() {
  printf '[deploy] %s\n' "$*"
}

die() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"
}

require_cmd git
require_cmd npm
require_cmd pm2
require_cmd curl

[ -d "$ROOT_DIR/.git" ] || die "当前目录不是 Git 工作区: $ROOT_DIR"
[ -f "$SERVER_DIR/package.json" ] || die "找不到服务端 package.json: $SERVER_DIR/package.json"
[ -f "$SERVER_DIR/ecosystem.config.js" ] || die "找不到 PM2 配置: $SERVER_DIR/ecosystem.config.js"

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no)" ]]; then
  die "工作区有未提交的跟踪文件修改，请先提交或清理后再部署"
fi

current_branch="$(git -C "$ROOT_DIR" branch --show-current)"
if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
  log "切换分支到 $DEPLOY_BRANCH"
  git -C "$ROOT_DIR" checkout "$DEPLOY_BRANCH"
fi

log "拉取最新代码: origin/$DEPLOY_BRANCH"
git -C "$ROOT_DIR" pull --ff-only origin "$DEPLOY_BRANCH"

log "安装服务端依赖"
(
  cd "$SERVER_DIR"
  npm ci --omit=dev
)

log "重启 PM2 进程: $APP_NAME"
(
  cd "$SERVER_DIR"
  pm2 startOrRestart ecosystem.config.js --env "$APP_ENV"
)

log "等待健康检查通过: $HEALTH_URL"
for ((i = 1; i <= HEALTH_RETRIES; i++)); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    log "部署完成"
    exit 0
  fi
  sleep "$HEALTH_SLEEP"
done

die "健康检查失败: $HEALTH_URL"
