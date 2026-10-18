#!/usr/bin/env python3
"""生成仅本机使用的配置和数据目录；已有配置绝不覆盖。"""
import json
import os
from pathlib import Path
import secrets


def main():
    """使用独立随机凭据初始化开发环境，配置以 0600 权限创建。"""
    root = Path(__file__).resolve().parents[1]
    config_path = root / "backend/config.json"
    if config_path.exists():
        print("已有配置，保持原样：{}".format(config_path))
        print("请确认 database_path 和 upload_dir 指向本地测试数据。")
        return
    config = json.loads((root / "backend/config.example.json").read_text())
    data = root / ".local-data"
    data.mkdir(mode=0o700, exist_ok=True)
    config["database_path"] = str(data / "kpsucai.db")
    config["upload_dir"] = str(data / "uploads")
    config["admin"]["password"] = secrets.token_urlsafe(24)
    config["jwt_secret"] = secrets.token_urlsafe(48)
    fd = os.open(str(config_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(config, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print("本地配置已生成：{}".format(config_path))
    print("管理员为 admin；请在此文件中查看随机密码，不要提交实际配置。")


if __name__ == "__main__":
    main()
