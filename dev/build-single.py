"""src/ を「サーバー不要の1ファイルHTML」に焼き固めるビルドスクリプト。

なぜ必要か
----------
src/ は ES Modules 構成なので、`file://` で直接開くとブラウザに拒否される
（CORS 制限）。つまり遊ぶたびにローカルサーバーが要る。
このスクリプトは three.js とゲームコードを1枚のHTMLに埋め込み、
**ダブルクリックで開けるファイル**を作る。配布・共有もこれ1枚で済む。

やっていること
--------------
1. three.min.js（グローバル THREE を定義する非モジュール版）をダウンロード
2. src/js/**.js を依存順に連結し、import 行を削除・export を剥がす
   → モジュール境界が消えて、ただのスクリプト1本になる
3. index.html の <head>/<body> と style.css を合わせて1枚に組み立てる

使い方:
    python dev/build-single.py
    → dev/dist/goki100.html が生成される
"""

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT_DIR = ROOT / "dev" / "dist"
CACHE = ROOT / "dev" / ".cache"

THREE_URL = "https://unpkg.com/three@0.160.0/build/three.min.js"

# 依存順（前のファイルが後のファイルから参照される）。
# class 宣言は巻き上げされないので Renderer は ThreeRenderer より前に置くこと。
ORDER = [
    "js/game/config.js",
    "js/render/textures.js",
    "js/render/Renderer.js",
    "js/render/ThreeRenderer.js",
    "js/game/input.js",
    "js/game/state.js",
    "js/audio.js",
    "js/main.js",
]

# import 文は複数行にまたがることがある（{ A, B,\n  C } from '...' 形式）。
# [\s\S] で改行も含めて最初の ; まで拾う。
IMPORT_LINE = re.compile(r"^\s*import\s[\s\S]*?;\s*$", re.MULTILINE)
EXPORT_KEYWORD = re.compile(r"^export\s+", re.MULTILINE)


def fetch_three() -> str:
    """three.min.js を取得（一度落としたらキャッシュを使う）。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / "three.min.js"
    if not cached.exists():
        print(f"downloading {THREE_URL} ...")
        with urllib.request.urlopen(THREE_URL) as res:
            cached.write_bytes(res.read())
    return cached.read_text(encoding="utf-8")


def strip_module_syntax(code: str, name: str) -> str:
    """import 行を消し、export キーワードを剥がして素のスクリプトにする。"""
    code = IMPORT_LINE.sub("", code)
    code = EXPORT_KEYWORD.sub("", code)
    return f"\n/* ===== {name} ===== */\n{code}"


def main() -> None:
    three = fetch_three()
    css = (SRC / "style.css").read_text(encoding="utf-8")
    html = (SRC / "index.html").read_text(encoding="utf-8")

    # index.html から <body> の中身だけ取り出す（HUD などのマークアップ）
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    # モジュール読み込みタグは不要（コードを直接埋め込むため）
    body = re.sub(r'<script type="module".*?</script>', "", body, flags=re.S)

    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)

    game_code = "".join(
        strip_module_syntax((SRC / rel).read_text(encoding="utf-8"), rel)
        for rel in ORDER
    )

    out = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{three}
</script>
<script>
{game_code}
</script>
</body>
</html>
"""

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / "goki100.html"
    dest.write_text(out, encoding="utf-8")
    print(f"built {dest}  ({len(out) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
