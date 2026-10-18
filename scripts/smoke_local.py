#!/usr/bin/env python3
"""用临时数据运行真实后端，验证注册、上传路径、预览及鉴权下载。"""
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zlib


def request(base, path, payload=None, token=None, body=None, content_type=None):
    """调用本地临时服务，不记录密码或令牌；返回状态码和响应字节。"""
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode()
        content_type = "application/json"
    if content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + path, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def png_chunk(kind, body):
    """构造有效的 PNG 测试数据块，供真实 ffmpeg 上传流程使用。"""
    return struct.pack("!I", len(body)) + kind + body + struct.pack("!I", zlib.crc32(kind + body) & 0xffffffff)


def verify(base, config):
    """验证 API 与 SQLite 实际保存结果，并确认公开路径不暴露原文件。"""
    password = secrets.token_urlsafe(24)
    code, _ = request(base, "/api/auth/register", {"username": "smoke_user", "password": password, "confirm_password": password})
    assert code == 200, "registration failed"
    code, body = request(base, "/api/auth/login", {"username": "smoke_user", "password": password})
    assert code == 200, "user login failed"
    user = json.loads(body)["token"]
    code, body = request(base, "/api/auth/login", config["admin"])
    assert code == 200, "admin login failed"
    admin = json.loads(body)["token"]
    code, _ = request(base, "/api/admin/categories", {"name": "smoke_category", "type": 1}, admin)
    assert code == 200, "category creation failed"
    image = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack("!2I5B", 64, 64, 8, 2, 0, 0, 0))
    image += png_chunk(b"IDAT", zlib.compress((b"\x00" + b"\x30\x80\xdd" * 64) * 64)) + png_chunk(b"IEND", b"")
    boundary = "smoke" + secrets.token_hex(12)
    body = ('--{}\r\nContent-Disposition: form-data; name="files"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n'.format(boundary)).encode()
    body += image + ('\r\n--{}--\r\n'.format(boundary)).encode()
    code, _ = request(base, "/api/admin/upload", token=admin, body=body, content_type="multipart/form-data; boundary=" + boundary)
    assert code == 200, "upload failed"
    material = None
    for _ in range(60):
        with sqlite3.connect(config["database_path"]) as db:
            material = db.execute("SELECT id, original_url, preview_url FROM materials WHERE title = ?", ("smoke.png",)).fetchone()
        if material:
            break
        time.sleep(0.25)
    assert material and material[2], "image processing did not persist a preview; check ffmpeg and fonts"
    ident, original, preview = material
    assert Path(original).parent == Path(config["upload_dir"]) / "originals", "wrong physical upload directory"
    assert preview.startswith("uploads/previews/"), "preview URL leaked a physical path"
    assert request(base, "/" + preview)[0] == 200, "preview inaccessible"
    assert request(base, "/uploads/originals/" + Path(original).name)[0] == 404, "original file is public"
    path = "/api/materials/{}/download".format(ident)
    assert request(base, path)[0] == 401, "anonymous download unexpectedly allowed"
    code, downloaded = request(base, path, token=user)
    assert code == 200 and downloaded == image, "authenticated download mismatch"
    print(json.dumps({"ok": True, "registration": True, "category": True, "configured_upload_directory": True,
                      "watermarked_preview": True, "original_blocked": True, "authenticated_download": True}))


def main():
    """构建临时二进制，以随机端口/凭据运行，结束后清理本次进程和测试数据。"""
    root = Path(__file__).resolve().parents[1]
    if sys.platform == "darwin":
        for prefix in ("/opt/homebrew/opt/ffmpeg-full", "/usr/local/opt/ffmpeg-full"):
            if (Path(prefix) / "bin/ffmpeg").is_file():
                os.environ["PATH"] = prefix + "/bin:" + os.environ.get("PATH", "")
                break
    filters = subprocess.check_output(["ffmpeg", "-hide_banner", "-filters"], stderr=subprocess.DEVNULL)
    if b"drawtext" not in filters:
        raise RuntimeError("ffmpeg lacks drawtext; install ffmpeg-full as described in the usage guide")
    with tempfile.TemporaryDirectory(prefix="kpsucai-smoke-") as directory:
        work = Path(directory)
        binary = work / "server"
        subprocess.run(["go", "build", "-o", str(binary), "./cmd/server/"], cwd=str(root / "backend"), check=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        config = {"admin": {"username": "smoke_admin", "password": secrets.token_urlsafe(24)},
                  "database_path": str(work / "test.db"), "upload_dir": str(work / "local assets"),
                  "jwt_secret": secrets.token_urlsafe(48), "server_port": "127.0.0.1:{}".format(port)}
        (work / "config.json").write_text(json.dumps(config))
        (work / "config.json").chmod(0o600)
        base = "http://127.0.0.1:{}".format(port)
        with (work / "backend.log").open("w") as log:
            process = subprocess.Popen([str(binary)], cwd=str(work), stdout=log, stderr=log)
            try:
                for _ in range(60):
                    try:
                        if request(base, "/ping")[0] == 200:
                            break
                    except (urllib.error.URLError, OSError):
                        pass
                    if process.poll() is not None:
                        raise RuntimeError("temporary backend exited before readiness")
                    time.sleep(0.1)
                verify(base, config)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
