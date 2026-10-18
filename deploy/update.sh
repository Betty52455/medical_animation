#!/usr/bin/env bash
# 服务器唯一日常更新入口：只允许 main 快进拉取，再执行拉取后的发布脚本。
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
[[ $EUID -eq 0 && "$ROOT" == /opt/website_test ]] || {
    echo "请在生产服务器 /opt/website_test 使用 root 执行。" >&2; exit 1;
}
mkdir -p .deploy
chmod 700 .deploy
exec 9> .deploy/deploy.lock
flock -n 9 || { echo "已有发布任务运行。" >&2; exit 1; }
[[ $(git branch --show-current) == main ]] || { echo "当前分支必须为 main。" >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo "工作副本有改动，请先核对，禁止强制覆盖。" >&2; exit 1; }
git pull --ff-only origin main
# 锁描述符随 exec 保留，避免拉取与构建之间插入第二次发布。
export KPSUCAI_DEPLOY_LOCK_HELD=1
exec bash "$ROOT/deploy/deploy.sh"
