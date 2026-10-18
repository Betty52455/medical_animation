#!/usr/bin/env bash
# 本地正式开发入口：保留已有配置，优先选择支持水印的 macOS ffmpeg。
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $(uname -s) == Darwin ]]; then
    for prefix in /opt/homebrew/opt/ffmpeg-full /usr/local/opt/ffmpeg-full; do
        if [[ -x "$prefix/bin/ffmpeg" ]]; then
            export PATH="$prefix/bin:$PATH"
            break
        fi
    done
fi
FILTERS=$(ffmpeg -hide_banner -filters 2>/dev/null)
[[ "$FILTERS" == *drawtext* ]] || { echo "ffmpeg 缺少 drawtext，请按使用说明安装完整版本。" >&2; exit 1; }
python3 "$ROOT/scripts/init_local.py"
cd "$ROOT/backend"
exec go run ./cmd/server/
