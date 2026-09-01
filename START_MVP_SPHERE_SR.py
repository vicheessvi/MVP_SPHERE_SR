import os
import sys
from pathlib import Path


def _show_error(message):
    print("MVP_SPHERE_SR не запущен.")
    print(message)
    try:
        if sys.stdin and sys.stdin.isatty():
            input("Нажмите Enter, чтобы закрыть окно...")
    except Exception:
        pass


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        _show_error("Требуется установленный Python 3.11 или новее.")
        raise SystemExit(1)
    try:
        from mvp_runtime.launcher import run

        run(Path(__file__).resolve().parent, open_browser=os.environ.get("MVP_NO_BROWSER") != "1")
    except Exception:
        _show_error("Локальная операция не выполнена. Убедитесь, что проект скачан полностью.")
        raise SystemExit(1)
