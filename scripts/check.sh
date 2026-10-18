#!/usr/bin/env bash
# 本地提交前验证：后端测试及编译、前端锁定依赖安装及生产构建。
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BUILD=$(mktemp -d "${TMPDIR:-/tmp}/kpsucai-check.XXXXXX")
# cleanup_build 仅移除本次创建的临时构建产物。
cleanup_build() { rm -rf -- "$BUILD"; }
trap cleanup_build EXIT
cd "$ROOT/backend"
go test ./...
go build -o "$BUILD/server" ./cmd/server/
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
npm run build -- --outDir "$BUILD/dist"
cd "$ROOT"
git diff --check
echo "提交前检查通过。"
