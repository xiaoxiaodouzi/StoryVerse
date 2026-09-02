"""StoryVerse local server and OpenAI-compatible API proxy."""

from __future__ import annotations

import json
import io
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 4173
ROOT = Path(__file__).resolve().parent


def api_endpoints(base_url: str) -> tuple[str, str]:
    """Return the chat endpoint and its sibling model-discovery endpoint."""
    if base_url.endswith("/chat/completions"):
        root = base_url.removesuffix("/chat/completions")
        return base_url, root + "/models"
    if base_url.endswith("/models"):
        root = base_url.removesuffix("/models")
        return root + "/chat/completions", base_url
    return base_url + "/chat/completions", base_url + "/models"


def system_tls_context() -> ssl.SSLContext:
    """Use the OS trust store without relying on a possibly stale SSL_CERT_FILE."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    context.load_default_certs(ssl.Purpose.SERVER_AUTH)
    return context


TLS_CONTEXT = system_tls_context()


def _curl_config_quote(value: str) -> str:
    """Quote a value for curl's stdin-only config format."""
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\r", "").replace("\n", "")


def curl_urlopen(request: urllib.request.Request, timeout: int) -> io.BytesIO:
    """Use Windows Schannel through curl without exposing the API key in argv."""
    config = ["silent", "show-error"]
    for name, value in request.header_items():
        config.append(f'header = "{_curl_config_quote(name)}: {_curl_config_quote(value)}"')
    body_path: str | None = None
    try:
        args = [
            "curl.exe", "--config", "-", "--request", request.get_method(),
            "--max-time", str(timeout), "--write-out", "\n%{http_code}",
            "--url", request.full_url,
        ]
        if request.data is not None:
            with tempfile.NamedTemporaryFile(prefix="storyverse-request-", suffix=".json", delete=False) as body_file:
                body_file.write(request.data)
                body_path = body_file.name
            args.extend(["--data-binary", "@" + body_path])
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        completed = subprocess.run(
            args,
            input=("\n".join(config) + "\n").encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout + 5,
            creationflags=creation_flags,
            check=False,
        )
        if completed.returncode != 0:
            detail = completed.stderr.decode("utf-8", errors="replace").strip()
            raise urllib.error.URLError(detail or f"Windows curl 返回错误 {completed.returncode}")
        try:
            body, status_raw = completed.stdout.rsplit(b"\n", 1)
            status = int(status_raw.strip())
        except (ValueError, TypeError):
            raise urllib.error.URLError("Windows curl 没有返回有效的 HTTP 状态。")
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, f"HTTP {status}", None, io.BytesIO(body))
        return io.BytesIO(body)
    except FileNotFoundError:
        raise urllib.error.URLError("系统中找不到 curl.exe，无法启用 Windows HTTPS 兼容模式。")
    except subprocess.TimeoutExpired:
        raise TimeoutError("Windows HTTPS 兼容请求超时。")
    finally:
        if body_path:
            try:
                os.unlink(body_path)
            except OSError:
                pass


def compatible_urlopen(request: urllib.request.Request, timeout: int):
    """Prefer urllib, then retry TLS-specific failures through Windows Schannel."""
    try:
        return urllib.request.urlopen(request, timeout=timeout, context=TLS_CONTEXT)
    except urllib.error.URLError as exc:
        detail = str(getattr(exc, "reason", exc))
        if "EOF occurred in violation of protocol" in detail or "No such file or directory" in detail:
            return curl_urlopen(request, timeout)
        raise


class StoryVerseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args: object) -> None:
        print("[StoryVerse] " + fmt % args)

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/api/chat", "/api/models", "/api/test"):
            self.send_json(404, {"error": "请求地址不存在。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 2_000_000:
                raise ValueError("请求内容无效。")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            base_url = str(data.get("baseUrl", "")).strip().rstrip("/")
            api_key = str(data.get("apiKey", "")).strip()
            model = str(data.get("model", "")).strip()
            messages = data.get("messages")
            if not base_url or not api_key:
                self.send_json(400, {"error": "接口设置不完整，请检查地址和 API 密钥。"})
                return
            chat_endpoint, models_endpoint = api_endpoints(base_url)
            if self.path in ("/api/models", "/api/test"):
                endpoint = models_endpoint
                request = urllib.request.Request(endpoint, method="GET", headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                    "User-Agent": "StoryVerse/0.3",
                })
                try:
                    with compatible_urlopen(request, timeout=30) as response:
                        result = json.loads(response.read().decode("utf-8"))
                except urllib.error.HTTPError as exc:
                    if self.path == "/api/test" and exc.code not in (401, 403):
                        messages = {
                            404: "服务器可以访问，但没有提供 /models 模型列表。可以手动填写模型名称后再测试聊天。",
                            405: "服务器可以访问，但不允许读取模型列表。可以手动填写模型名称后再测试聊天。",
                            429: "服务器可以访问，但当前请求过于频繁或账户额度受限。",
                        }
                        self.send_json(200, {
                            "ok": True,
                            "level": "warning",
                            "message": messages.get(exc.code, f"服务器可以访问，但模型接口返回 HTTP {exc.code}。"),
                            "endpoint": chat_endpoint,
                            "probeEndpoint": models_endpoint,
                        })
                        return
                    if exc.code in (401, 403):
                        message = "服务器已响应，但 API 密钥无效或没有访问权限。"
                    elif exc.code == 404:
                        message = "这个接口没有提供模型列表，请检查接口地址。"
                    else:
                        message = f"读取模型失败（{exc.code}）。"
                    self.send_json(502, {"error": message, "endpoint": chat_endpoint, "probeEndpoint": models_endpoint})
                    return
                except urllib.error.URLError as exc:
                    reason = str(getattr(exc, "reason", exc))
                    self.send_json(502, {"error": f"无法访问接口服务器：{reason}", "endpoint": chat_endpoint, "probeEndpoint": models_endpoint})
                    return
                except TimeoutError:
                    self.send_json(504, {"error": "连接接口超时，请检查网络、接口地址或代理设置。", "endpoint": chat_endpoint, "probeEndpoint": models_endpoint})
                    return
                items = result.get("data", result.get("models", [])) if isinstance(result, dict) else []
                models = sorted({
                    str(item if isinstance(item, str) else item.get("id") or item.get("name"))
                    for item in items
                    if isinstance(item, str) or (isinstance(item, dict) and (item.get("id") or item.get("name")))
                })
                if self.path == "/api/test":
                    self.send_json(200, {
                        "ok": True,
                        "level": "success",
                        "message": f"聊天地址已识别，密钥有效，读取到 {len(models)} 个模型。",
                        "endpoint": chat_endpoint,
                        "probeEndpoint": models_endpoint,
                        "models": models,
                    })
                    return
                self.send_json(200, {"models": models})
                return
            if not model or not isinstance(messages, list):
                self.send_json(400, {"error": "智能体设置不完整，请检查模型名称。"})
                return
            endpoint = chat_endpoint
            request_body = json.dumps({
                "model": model,
                "messages": messages,
                "temperature": float(data.get("temperature", 0.85)),
                "max_tokens": int(data.get("maxTokens", 700)),
            }, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(endpoint, data=request_body, method="POST", headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "StoryVerse/0.2",
            })
            try:
                with compatible_urlopen(request, timeout=60) as response:
                    result = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                try:
                    parsed = json.loads(detail)
                    detail = parsed.get("error", {}).get("message") or parsed.get("message") or detail
                except json.JSONDecodeError:
                    pass
                if exc.code in (401, 403):
                    friendly = "连接 AI 失败，请检查 API 密钥是否正确。"
                elif exc.code == 404:
                    friendly = "没有找到接口或模型，请检查接口地址和模型名称。"
                elif exc.code == 429:
                    friendly = "请求过于频繁或额度不足，请稍后再试。"
                else:
                    friendly = f"AI 接口返回错误（{exc.code}）：{str(detail)[:240]}"
                self.send_json(502, {"error": friendly})
                return
            except urllib.error.URLError:
                self.send_json(502, {"error": "无法连接 AI，请检查网络和接口地址。"})
                return
            except TimeoutError:
                self.send_json(504, {"error": "AI 回复超时，请稍后重新发送。"})
                return
            choices = result.get("choices") or []
            content = choices[0].get("message", {}).get("content") if choices else None
            if not isinstance(content, str) or not content.strip():
                self.send_json(502, {"error": "当前模型没有返回内容，请稍后再试。"})
                return
            self.send_json(200, {"content": content.strip()})
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc) or "请求内容无法处理。"})
        except Exception as exc:
            print(f"[StoryVerse] unexpected proxy error: {exc!r}")
            self.send_json(500, {"error": "连接 AI 时发生意外错误，应用仍可继续使用。"})


def server_already_running() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((HOST, PORT)) == 0


def main() -> None:
    url = f"http://{HOST}:{PORT}/"
    if server_already_running():
        webbrowser.open(url)
        return
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), StoryVerseHandler)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    print(f"StoryVerse running at {url}")
    print("Close this window to stop StoryVerse.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
