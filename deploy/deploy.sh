#!/usr/bin/env bash
# 已有生产环境发布/回滚。构建成功后才停服务；保护配置、数据库和原素材。
set -Eeuo pipefail
export PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export GOMAXPROCS="${GOMAXPROCS:-2}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
STATE="$ROOT/.deploy"
MODE=deploy
TARGET=""
STAGE=""
SNAPSHOT=""
SERVICE_TOUCHED=0
cd "$ROOT"

# fail 在修改线上运行状态前给出可操作的失败原因。
fail() { echo "错误: $*" >&2; exit 1; }

# health_check 同时检查后端响应及本机 Nginx 的有效 HTTPS 反向代理。
health_check() {
    local attempt
    for attempt in {1..20}; do
        if systemctl is-active --quiet kpsucai &&
            curl -fsS --max-time 3 http://127.0.0.1:8080/ping >/dev/null &&
            curl -fsS --max-time 5 --resolve kpsucai.cn:443:127.0.0.1 https://kpsucai.cn/api/categories >/dev/null &&
            curl -fsS --max-time 5 --resolve kpsucai.cn:443:127.0.0.1 https://kpsucai.cn/ >/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# save_runtime 保存可回退的前后端、服务配置、备份程序及运行版本标记。
save_runtime() {
    mkdir -p "$SNAPSHOT"
    cp -p backend/server "$SNAPSHOT/server"
    cp -a frontend/dist "$SNAPSHOT/dist"
    cp -p /etc/systemd/system/kpsucai.service "$SNAPSHOT/kpsucai.service"
    cp -p /opt/backup_db.sh "$SNAPSHOT/backup_db.sh"
    if [[ -f "$STATE/running_revision" ]]; then
        cp "$STATE/running_revision" "$SNAPSHOT/revision"
    else
        echo pre-git > "$SNAPSHOT/revision"
    fi
}

# restore_runtime 恢复程序和静态资源，不覆盖数据库、素材或实际密码配置。
restore_runtime() {
    local source=$1
    install -m 755 "$source/server" backend/server.next || return 1
    mv -f backend/server.next backend/server || return 1
    if [[ -d frontend/dist ]]; then
        mv frontend/dist "$STAGE/discarded-dist-$(date +%s%N)" || return 1
    fi
    cp -a "$source/dist" frontend/dist || return 1
    install -m 644 "$source/kpsucai.service" /etc/systemd/system/kpsucai.service || return 1
    install -m 755 "$source/backup_db.sh" /opt/backup_db.sh || return 1
    cp "$source/revision" "$STATE/running_revision" || return 1
    systemctl daemon-reload || return 1
}

# on_failure 先报告失败，再恢复上一运行版本；保留数据库备份和故障日志供排查。
on_failure() {
    local result=$?
    trap - ERR INT TERM
    set +e
    echo "发布失败（退出码 $result）。构建或快照位于: $STAGE $SNAPSHOT" >&2
    if [[ $SERVICE_TOUCHED -eq 1 ]]; then
        echo "正在恢复发布前的程序，数据库保持现状。" >&2
        systemctl stop kpsucai
        if restore_runtime "$SNAPSHOT" && systemctl start kpsucai && health_check; then
            echo "上一运行版本已恢复。" >&2
        else
            echo "自动恢复未通过，请立即检查 journalctl -u kpsucai。" >&2
        fi
    fi
    exit "$result"
}
trap on_failure ERR
trap 'false' INT TERM

[[ $EUID -eq 0 && "$ROOT" == /opt/website_test ]] || fail "仅用于现有生产目录 /opt/website_test，需 root。"
[[ $# -eq 0 || ( $# -eq 2 && $1 == --rollback ) ]] || fail "用法: bash deploy/deploy.sh [--rollback latest或快照ID]"
mkdir -p "$STATE/releases"
chmod 700 "$STATE" "$STATE/releases"
if [[ ${KPSUCAI_DEPLOY_LOCK_HELD:-0} != 1 ]]; then
    exec 9> "$STATE/deploy.lock"
    flock -n 9 || fail "已有发布任务运行。"
fi
[[ $(git branch --show-current) == main ]] || fail "当前分支必须为 main。"
[[ -z $(git status --porcelain) ]] || fail "工作副本存在改动，请先核对。"
for command in git go npm python3 sqlite3 curl flock gcc nginx; do
    command -v "$command" >/dev/null || fail "缺少依赖: $command"
done
systemctl is-active --quiet kpsucai || fail "现有服务未运行，先按运维手册排查。"
[[ -s backend/server && -s frontend/dist/index.html ]] || fail "缺少现有运行产物，不能安全保存回滚版本。"
python3 - <<'PY'
import json
from pathlib import Path
c = json.loads(Path('backend/config.json').read_text())
assert c.get('database_path') == '/opt/data/kpsucai.db', '生产数据库路径不匹配'
assert c.get('upload_dir', '/opt/data/uploads') == '/opt/data/uploads', '生产素材路径不匹配'
assert c.get('server_port') == '127.0.0.1:8080', '生产后端必须仅监听本机'
assert len(c.get('jwt_secret', '')) >= 32, '生产签名密钥长度不足'
assert Path('backend/config.json').stat().st_mode & 0o077 == 0, '生产配置应为 0600'
PY
bash deploy/check_database.sh
nginx -t
REVISION=$(git rev-parse HEAD)
STAGE=$(mktemp -d "$STATE/build.XXXXXX")
if [[ $# -eq 2 ]]; then
    MODE=rollback
    TARGET=$2
    if [[ "$TARGET" == latest ]]; then TARGET=$(cat "$STATE/last_rollback"); fi
    [[ "$TARGET" =~ ^[0-9]{8}T[0-9]{6}-[a-f0-9]{7,40}(-[0-9]+)?$ ]] || fail "无效快照 ID。"
    TARGET="$STATE/releases/$TARGET"
    [[ -s "$TARGET/server" && -s "$TARGET/dist/index.html" && -s "$TARGET/revision" && -s "$TARGET/kpsucai.service" && -s "$TARGET/backup_db.sh" ]] || fail "回滚快照不完整。"
else
    echo "构建版本 $REVISION，当前服务继续运行。"
    (cd backend && go test ./... && go build -o "$STAGE/server" ./cmd/server/)
    (cd frontend && npm ci --no-audit --no-fund && npm run build -- --outDir "$STAGE/dist")
fi

SNAPSHOT_ID="$(date +%Y%m%dT%H%M%S)-${REVISION:0:12}-$$"
SNAPSHOT="$STATE/releases/$SNAPSHOT_ID"
save_runtime
SERVICE_TOUCHED=1
systemctl stop kpsucai
# 每次发布在独立快照目录备份停稳后的数据库，避免与小时备份争锁而跳过。
KPSUCAI_BACKUP_DIR="$SNAPSHOT/database" bash backup_db.sh
if [[ "$MODE" == rollback ]]; then
    restore_runtime "$TARGET"
else
    install -m 755 "$STAGE/server" backend/server.next
    mv -f backend/server.next backend/server
    mv frontend/dist "$STAGE/previous-dist"
    mv "$STAGE/dist" frontend/dist
    chmod 755 frontend/dist
    install -m 755 backup_db.sh /opt/backup_db.sh
    install -m 644 deploy/kpsucai.service /etc/systemd/system/kpsucai.service
    systemctl daemon-reload
    echo "$REVISION" > "$STATE/running_revision"
fi
systemctl start kpsucai
health_check
echo "$SNAPSHOT_ID" > "$STATE/last_rollback"
SERVICE_TOUCHED=0
trap - ERR INT TERM
rm -rf -- "$STAGE"
echo "$MODE 完成，运行版本: $(cat "$STATE/running_revision")"
echo "发布前程序及数据库快照: $SNAPSHOT"
echo "请再从公网验证修改涉及的业务功能；健康检查不能代替业务验证。"
