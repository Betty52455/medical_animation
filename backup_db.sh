#!/bin/bash
# 在线备份 SQLite；只读打开原库，校验临时备份后再发布并清理过期备份。
# crontab 配置: 0 * * * * /opt/backup_db.sh >> /opt/data/website_db_backup/backup.log 2>&1
set -euo pipefail
umask 077

DB_PATH="${KPSUCAI_DB_PATH:-/opt/data/kpsucai.db}"
BACKUP_DIR="${KPSUCAI_BACKUP_DIR:-/opt/data/website_db_backup}"
KEEP_DAYS=14
BACKUP_TEMP=""

# cleanup_partial_backup 仅删除本次尚未完成的临时备份，保留原库和正式备份。
cleanup_partial_backup() {
    if [ -n "$BACKUP_TEMP" ]; then
        rm -f -- "$BACKUP_TEMP"
    fi
}
trap cleanup_partial_backup EXIT

mkdir -p "$BACKUP_DIR"

# 防止手动备份与整点任务同时运行；日志目录须在配置 cron 前创建。
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
    echo "$(date -Iseconds): 已有备份任务运行，本次跳过"
    exit 0
fi

# 禁止在原库缺失或为空时悄悄生成新库。
if [ ! -s "$DB_PATH" ]; then
    echo "$(date -Iseconds): 错误 - 数据库不存在或为空: $DB_PATH" >&2
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/test_${TIMESTAMP}.db"
BACKUP_TEMP=$(mktemp "$BACKUP_DIR/.test_${TIMESTAMP}.XXXXXX.tmp")
SQLITE_BACKUP_PATH=${BACKUP_TEMP//\'/\'\'}

# 使用 SQLite 在线备份接口，避免复制正在写入的数据库造成不一致。
sqlite3 -readonly "$DB_PATH" ".timeout 10000" ".backup '$SQLITE_BACKUP_PATH'"
CHECK_RESULT=$(sqlite3 -readonly "$BACKUP_TEMP" "PRAGMA integrity_check;")
if [ "$CHECK_RESULT" != "ok" ]; then
    echo "$(date -Iseconds): 错误 - 备份完整性检查失败: $CHECK_RESULT" >&2
    exit 1
fi

mv -- "$BACKUP_TEMP" "$BACKUP_FILE"
BACKUP_TEMP=""
echo "$(date -Iseconds): 备份成功且完整性校验通过 -> $BACKUP_FILE"

# 只有本次备份成功后才清理专用目录下的旧备份，绝不清理原库目录。
find "$BACKUP_DIR" -maxdepth 1 -name "test_*.db" -mtime +"$KEEP_DAYS" -type f -delete
