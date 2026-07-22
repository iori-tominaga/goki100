"""開発用の簡易静的サーバー。

`python -m http.server` との違いはひとつだけ：**キャッシュを禁止する**。
標準のサーバーは Cache-Control を送らないため、ブラウザが JS モジュールを
勝手にキャッシュし「編集したのに反映されない」という事故が起きる。

使い方（プロジェクト root から）:
    python dev/serve.py          # http://localhost:8000
    python dev/serve.py 8080     # ポート指定
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(SRC))
    print(f"serving {SRC} at http://localhost:{port}  (no-cache)")
    HTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()
