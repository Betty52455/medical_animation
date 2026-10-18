#!/bin/bash
# 服务启动前检查原库；丢失、空库或损坏时拒绝启动，避免静默创建空库。
set -euo pipefail

KPSUCAI_DATABASE="${KPSUCAI_DB_PATH:-/opt/data/kpsucai.db}"
if [ ! -s "$KPSUCAI_DATABASE" ]; then
    echo "数据库不存在或为空，请先恢复数据: $KPSUCAI_DATABASE" >&2
    exit 1
fi

KPSUCAI_CHECK_RESULT=$(sqlite3 -readonly "$KPSUCAI_DATABASE" "PRAGMA quick_check;")
if [ "$KPSUCAI_CHECK_RESULT" != "ok" ]; then
    echo "数据库检查失败，请先恢复数据: $KPSUCAI_CHECK_RESULT" >&2
    exit 1
fi
