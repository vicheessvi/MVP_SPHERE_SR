"""User-facing Python startup without CMD, PowerShell or Node.js."""

from __future__ import annotations

import os
import sys
import webbrowser
from pathlib import Path
from typing import Callable

from .server import create_server


MINIMUM_PYTHON = (3, 11)
REQUIRED_FILES = (
    "index.html",
    "app.js",
    "product-catalog.js",
    "styles.css",
    "vendor/xlsx.full.min.js",
    "runtime/credential-pool.js",
    "runtime/device-catalog.json",
)


class LaunchError(RuntimeError):
    """Safe local startup failure."""


def validate_environment(project_root: Path | str, version: tuple[int, ...] | None = None) -> Path:
    current = tuple(version or sys.version_info[:3])
    if current < MINIMUM_PYTHON:
        raise LaunchError("Требуется Python 3.11 или новее.")
    root = Path(project_root).resolve()
    missing = [relative for relative in REQUIRED_FILES if not (root / relative).is_file()]
    if missing:
        raise LaunchError("Пакет проекта неполон или повреждён. Скачайте его заново целиком.")
    return root


def run(
    project_root: Path | str,
    *,
    port: int = 0,
    open_browser: bool = True,
    browser_open: Callable[..., bool] = webbrowser.open,
) -> None:
    root = validate_environment(project_root)
    server = create_server(root, port)
    url = server.launch_url
    print(f"MVP_SPHERE_SR: http://127.0.0.1:{server.server_port}", flush=True)
    print("Для остановки закройте это окно или нажмите Ctrl+C.", flush=True)
    if open_browser:
        opened = False
        try:
            opened = bool(browser_open(url, new=2, autoraise=True))
        except Exception:
            opened = False
        if not opened:
            print(f"Браузер не открылся автоматически. Откройте локальный адрес: {url}", flush=True)
    else:
        print(f"Launch URL: {url}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    run(project_root, open_browser=os.environ.get("MVP_NO_BROWSER") != "1")
