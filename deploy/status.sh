#!/usr/bin/env bash
# 只读展示代码/运行版本、核心服务、证书与数据库检查结果。
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
git status --short --branch
git log -1 --format='代码版本: %h %s'
if [[ -f .deploy/running_revision ]]; then
    echo "运行版本: $(cat .deploy/running_revision)"
fi
systemctl is-active kpsucai nginx crond certbot-renew.timer cloudmonitor
systemctl --failed --no-pager
bash deploy/check_database.sh
df -h /opt/data
openssl x509 -in /etc/letsencrypt/live/kpsucai.cn/fullchain.pem -noout -dates
curl -fsS --max-time 10 https://kpsucai.cn/api/categories
echo
